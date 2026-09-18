import "server-only";
import * as zlib from "zlib";
import type { ShippingSummaryResult } from "@/lib/shippingSummary";
import {
  groupLinesForDisplay,
  aggregateGroupLines,
  formatSkuSummaryText,
  filterRedundantTieWireFreebies,
  needsOwnFreebieTie,
  countRealProductRows,
  buildGroupBundleNote,
  BUNDLE_TOGETHER_LABEL,
} from "@/lib/shippingSummaryDisplay";

type Row = (string | number)[];

const BLANK_ROW: Row = ["", "", "", "", "", "", "", "", ""];
const COLUMN_WIDTHS = [22, 55, 3, 3, 22, 3, 8, 24, 3];
// Requested by the user: the sheet used to need these applied by hand in
// Excel every time before it could be printed, so bake them into the file
// itself — printable as-is, no manual page-setup/font step first.
const SHEET_FONT_NAME = "Angsana New";
const SHEET_FONT_SIZE = 18;

// A fixed 2-line "count what arrived / who received it" block a warehouse
// worker fills in by hand, printed alongside the first 2 item rows of each
// carrier's block — matches the layout of the hand-built reference sheet
// this export replaces (see conversation), minus its phone-number line.
function signatureBlockCells(indexInCarrier: number): Row {
  if (indexInCarrier === 0) return ["รับสินค้าจำนวน_______", "", "ชิ้น", "ผู้รับสินค้า_____________", ""];
  if (indexInCarrier === 1) return ["ตาข่ายจำนวน_______", "", "ม้วน", "วันที่____________", ""];
  return ["", "", "", "", ""];
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

// 1-indexed column number -> spreadsheet letter ("A", "B", ..., "Z", "AA", ...).
function colLetter(n: number): string {
  let s = "";
  let remaining = n;
  while (remaining > 0) {
    const rem = (remaining - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    remaining = Math.floor((remaining - 1) / 26);
  }
  return s;
}

function buildSheetXml(rows: Row[]): string {
  const lastCol = colLetter(COLUMN_WIDTHS.length);
  const lastRow = Math.max(rows.length, 1);
  const colsXml = COLUMN_WIDTHS.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("");
  const rowsXml = rows
    .map((row, rIdx) => {
      const r = rIdx + 1;
      const cellsXml = row
        .map((val, cIdx) => {
          if (val === "" || val === null || val === undefined) return "";
          const ref = `${colLetter(cIdx + 1)}${r}`;
          if (typeof val === "number" && Number.isFinite(val)) return `<c r="${ref}"><v>${val}</v></c>`;
          return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(String(val))}</t></is></c>`;
        })
        .join("");
      return `<row r="${r}">${cellsXml}</row>`;
    })
    .join("");

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<dimension ref="A1:${lastCol}${lastRow}"/>` +
    `<sheetViews><sheetView workbookViewId="0"/></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="15"/>` +
    `<cols>${colsXml}</cols>` +
    `<sheetData>${rowsXml}</sheetData>` +
    `<pageMargins left="0.3" right="0.3" top="0.3" bottom="0.3" header="0.2" footer="0.2"/>` +
    `<pageSetup paperSize="9" orientation="landscape"/>` +
    `</worksheet>`
  );
}

const STYLES_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
  `<fonts count="1"><font><sz val="${SHEET_FONT_SIZE}"/><name val="${SHEET_FONT_NAME}"/></font></fonts>` +
  `<fills count="1"><fill><patternFill patternType="none"/></fill></fills>` +
  `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>` +
  `</styleSheet>`;

const WORKBOOK_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
  `<sheets><sheet name="ใบเตรียมสินค้า" sheetId="1" r:id="rId1"/></sheets>` +
  `</workbook>`;

const WORKBOOK_RELS_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
  `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
  `</Relationships>`;

const ROOT_RELS_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
  `</Relationships>`;

const CONTENT_TYPES_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
  `<Default Extension="xml" ContentType="application/xml"/>` +
  `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
  `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
  `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
  `</Types>`;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Hand-rolled, dependency-free .xlsx (OOXML + ZIP) writer — deliberately
 * not using the `xlsx` package here: it has no write support for page setup
 * or fonts at all in the open-source edition (both are SheetJS Pro-only
 * features), and this file's only requirement is a print-ready page
 * (A4 landscape) and font (see SHEET_FONT_NAME/SIZE above), which a handful
 * of small, fixed XML parts plus Node's built-in zlib can produce directly
 * without pulling in a heavier full-featured spreadsheet library. */
function buildXlsxBuffer(sheetXml: string): Buffer {
  const files: { name: string; data: Buffer }[] = [
    { name: "[Content_Types].xml", data: Buffer.from(CONTENT_TYPES_XML, "utf8") },
    { name: "_rels/.rels", data: Buffer.from(ROOT_RELS_XML, "utf8") },
    { name: "xl/workbook.xml", data: Buffer.from(WORKBOOK_XML, "utf8") },
    { name: "xl/_rels/workbook.xml.rels", data: Buffer.from(WORKBOOK_RELS_XML, "utf8") },
    { name: "xl/styles.xml", data: Buffer.from(STYLES_XML, "utf8") },
    { name: "xl/worksheets/sheet1.xml", data: Buffer.from(sheetXml, "utf8") },
  ];

  const localChunks: Buffer[] = [];
  const centralChunks: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBuf = Buffer.from(file.name, "utf8");
    const compressed = zlib.deflateRawSync(file.data);
    const useCompressed = compressed.length < file.data.length;
    const method = useCompressed ? 8 : 0;
    const dataToWrite = useCompressed ? compressed : file.data;
    const crc = crc32(file.data);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(dataToWrite.length, 18);
    localHeader.writeUInt32LE(file.data.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);
    localChunks.push(localHeader, nameBuf, dataToWrite);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(method, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(dataToWrite.length, 20);
    centralHeader.writeUInt32LE(file.data.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralChunks.push(centralHeader, nameBuf);

    offset += localHeader.length + nameBuf.length + dataToWrite.length;
  }

  const centralDirStart = offset;
  const centralDirBuf = Buffer.concat(centralChunks);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralDirBuf.length, 12);
  eocd.writeUInt32LE(centralDirStart, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localChunks, centralDirBuf, eocd]);
}

export interface SlipPreviewRow {
  trackingText: string;
  productText: string;
}

export interface SlipPreviewCarrier {
  carrier: string;
  rows: SlipPreviewRow[];
}

/** The actual tracking/product-text content of every row the workbook below
 * will contain, carrier by carrier — shared by the real xlsx writer and by
 * previewShippingSummarySlip (shippingSummaryActions.ts) so a staff preview
 * can never drift from what actually gets written to the file. Leaves out
 * the signature-block filler cells (see signatureBlockCells) since those are
 * a print-layout aid, not content worth previewing. */
function buildSlipPreviewCarriers(summary: ShippingSummaryResult): SlipPreviewCarrier[] {
  return summary.carriers.map((group) => {
    const rows: SlipPreviewRow[] = [];
    const mergeGroups = groupLinesForDisplay(filterRedundantTieWireFreebies(group.lines));
    for (const mg of mergeGroups) {
      const trackingText = mg.trackingNumber ?? "-";
      const isMerged = mg.orderIds.length > 1;
      const displayRows = aggregateGroupLines(mg.lines);
      const realProductCount = countRealProductRows(displayRows);
      displayRows.forEach((row, i) => {
        const rawSku = row.sourceLines[0].rawSku;
        let productText = formatSkuSummaryText(row.sku, row.quantity, row.promoQuantity);
        if (needsOwnFreebieTie(rawSku, row.productName, row.promoQuantity)) productText += BUNDLE_TOGETHER_LABEL;
        // Each spreadsheet row is one fixed print line (tied to the
        // signature-block layout below) — unlike the LINE message, there's
        // no spare row to give the multi-product note its own line, so on
        // top of any per-row note above it's appended to the last item's
        // cell instead.
        if (realProductCount > 1 && i === displayRows.length - 1) productText += ` ${buildGroupBundleNote(realProductCount)}`;
        if (isMerged && i === 0) productText += " (รวมออเดอร์)";
        rows.push({ trackingText, productText });
      });
    }
    return { carrier: group.carrier, rows };
  });
}

/** Server-action-friendly preview of buildShippingSummarySlipWorkbook's
 * content — no xlsx/zip encoding, just the plain rows, so staff can check
 * the data is right before actually downloading the file. */
export function previewShippingSummarySlip(summary: ShippingSummaryResult): SlipPreviewCarrier[] {
  return buildSlipPreviewCarriers(summary);
}

/** Builds the packing-slip workbook buffer for one ship-date's summary — one
 * sheet, carrier blocks stacked top to bottom (header row duplicated in
 * columns A and E, exactly like the reference sheet), each item row carrying
 * its tracking number and a "SKU xN , freebie xN" description, with the
 * signature block occupying columns E-H of the first 3 item rows. Page setup
 * is fixed at A4 landscape with the whole sheet in one font (see
 * SHEET_FONT_NAME/SIZE above) — requested so the file opens print-ready. */
export function buildShippingSummarySlipWorkbook(summary: ShippingSummaryResult): Buffer {
  const rows: Row[] = [];

  for (const carrier of buildSlipPreviewCarriers(summary)) {
    rows.push([carrier.carrier, "", "", "", carrier.carrier, "", "", "", ""]);
    carrier.rows.forEach((r, itemIndex) => {
      rows.push([r.trackingText, r.productText, "", "", ...signatureBlockCells(itemIndex)]);
    });
    rows.push(BLANK_ROW, BLANK_ROW);
  }

  if (rows.length === 0) rows.push(["ไม่มีออเดอร์ในช่วงเวลานี้"]);

  return buildXlsxBuffer(buildSheetXml(rows));
}

/** "ใบเตรียมสินค้า ส่งปกติ DD.MM.YY.xlsx", Buddhist-era 2-digit year — matches
 * the naming convention of the reference sheet this export replaces. */
export function shippingSummarySlipFilename(shipDate: Date): string {
  const dmy = shipDate
    .toLocaleDateString("th-TH-u-ca-buddhist", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: "Asia/Bangkok" })
    .replace(/\//g, ".");
  return `ใบเตรียมสินค้า ส่งปกติ ${dmy}.xlsx`;
}
