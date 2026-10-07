import "server-only";
import * as XLSX from "xlsx";

/** Header names this parser will accept for each field, matched
 * case-insensitively after trimming.
 *
 * Deliberately a list rather than one fixed string per field, unlike
 * shopeeImport.ts: that file's headers were verified against a real export,
 * whereas Seller Center's cancellation report has not been seen here yet and
 * Shopee and Lazada word these differently (and switch between Thai and
 * English depending on the account's language setting). When none of these
 * match, the import fails loudly and prints the headers it DID find, so the
 * real name can be added here — rather than importing zero rows in silence. */
const HEADER_CANDIDATES = {
  orderNo: [
    "หมายเลขคำสั่งซื้อ",
    "เลขที่คำสั่งซื้อ",
    "หมายเลขออเดอร์",
    "รหัสคำสั่งซื้อ",
    "order id",
    "order no",
    "order number",
    "ordernumber",
    "orderid",
  ],
  reason: [
    "เหตุผลในการยกเลิก",
    "เหตุผลการยกเลิก",
    "สาเหตุการยกเลิก",
    "เหตุผล",
    "cancel reason",
    "cancellation reason",
    "reason for cancellation",
    "reason",
  ],
  initiator: [
    "ยกเลิกโดย",
    "ผู้ยกเลิก",
    "ผู้ทำรายการยกเลิก",
    "cancelled by",
    "canceled by",
    "cancel by",
    "cancellation initiator",
    "initiator",
  ],
  cancelledAt: [
    "วันที่ยกเลิก",
    "เวลายกเลิก",
    "วันเวลาที่ยกเลิก",
    "cancel time",
    "cancellation time",
    "cancelled at",
    "canceled at",
  ],
} as const;

/** Maps each platform's wording onto the BUYER / SELLER / SYSTEM vocabulary
 * TikTok already uses, so the cancellations page groups a Shopee buyer
 * cancellation and a TikTok one into the same bar instead of two lookalike
 * rows. Anything unrecognised is kept verbatim rather than guessed at. */
const INITIATOR_MAP: Record<string, string> = {
  ผู้ซื้อ: "BUYER",
  ลูกค้า: "BUYER",
  buyer: "BUYER",
  customer: "BUYER",
  ผู้ขาย: "SELLER",
  ร้านค้า: "SELLER",
  seller: "SELLER",
  shop: "SELLER",
  ระบบ: "SYSTEM",
  system: "SYSTEM",
  shopee: "SYSTEM",
  lazada: "SYSTEM",
};

export interface CancellationRow {
  orderNo: string;
  reason: string | null;
  initiator: string | null;
  cancelledAt: Date | null;
}

export interface CancellationParseResult {
  rows: CancellationRow[];
  /** Rows with no order number at all — blank spacer rows and totals. */
  skippedRows: number;
  /** Which header each field was resolved to, echoed back so the UI can show
   * what the parser actually keyed on. */
  matchedHeaders: { field: string; header: string }[];
}

export class CancellationParseError extends Error {
  constructor(
    message: string,
    /** Every header found in the file, so the caller can show them. */
    readonly foundHeaders: string[],
  ) {
    super(message);
    this.name = "CancellationParseError";
  }
}

export type SheetRow = Record<string, string | number>;

export function findHeader(actual: string[], candidates: readonly string[]): string | null {
  const normalised = actual.map((h) => ({ raw: h, key: h.trim().toLowerCase() }));
  for (const candidate of candidates) {
    const hit = normalised.find((h) => h.key === candidate.toLowerCase());
    if (hit) return hit.raw;
  }
  // Fall back to a contains match — exports often append units or notes to a
  // header ("เหตุผลในการยกเลิก (ถ้ามี)").
  for (const candidate of candidates) {
    const hit = normalised.find((h) => h.key.includes(candidate.toLowerCase()));
    if (hit) return hit.raw;
  }
  return null;
}

export function text(row: SheetRow, header: string | null): string {
  if (!header) return "";
  const value = row[header];
  return value === undefined || value === null ? "" : String(value).trim();
}

function parseDate(value: string): Date | null {
  if (!value) return null;
  const parsed = new Date(value.replace(" ", "T"));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Longest key first, so a key that is a prefix of another can't win the
 * partial match below: "Shopee ระบบอัตโนมัติ" contains both "shop" (SELLER)
 * and "shopee" (SYSTEM), and insertion order was silently handing it to
 * SELLER — turning every platform-initiated cancellation into a
 * shop-initiated one on the report. */
const INITIATOR_KEYS_BY_SPECIFICITY = Object.keys(INITIATOR_MAP).sort((a, b) => b.length - a.length);

function normaliseInitiator(raw: string): string | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase();
  if (INITIATOR_MAP[key]) return INITIATOR_MAP[key];
  const partial = INITIATOR_KEYS_BY_SPECIFICITY.find((k) => key.includes(k.toLowerCase()));
  // Unrecognised wording is kept verbatim rather than guessed into one of the
  // three buckets — a wrong bucket is worse than an obviously odd label.
  return partial ? INITIATOR_MAP[partial] : raw.trim();
}

/** Reads a Seller Center cancellation export into plain rows. Does not touch
 * the database — matching against real orders happens in
 * cancellationImportActions.ts, so this stays testable on a file alone. */
export function parseCancellationExport(buffer: Buffer): CancellationParseResult {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new CancellationParseError("ไฟล์นี้ไม่มีชีตข้อมูล", []);

  const dataRows = XLSX.utils.sheet_to_json<SheetRow>(sheet, { defval: "" });
  if (dataRows.length === 0) throw new CancellationParseError("ไฟล์นี้ไม่มีข้อมูล", []);

  const foundHeaders = Object.keys(dataRows[0]);
  const orderNoHeader = findHeader(foundHeaders, HEADER_CANDIDATES.orderNo);
  if (!orderNoHeader) {
    throw new CancellationParseError("หาคอลัมน์เลขคำสั่งซื้อในไฟล์นี้ไม่เจอ", foundHeaders);
  }
  const reasonHeader = findHeader(foundHeaders, HEADER_CANDIDATES.reason);
  if (!reasonHeader) {
    throw new CancellationParseError("หาคอลัมน์เหตุผลการยกเลิกในไฟล์นี้ไม่เจอ", foundHeaders);
  }
  const initiatorHeader = findHeader(foundHeaders, HEADER_CANDIDATES.initiator);
  const cancelledAtHeader = findHeader(foundHeaders, HEADER_CANDIDATES.cancelledAt);

  const matchedHeaders = [
    { field: "เลขคำสั่งซื้อ", header: orderNoHeader },
    { field: "เหตุผล", header: reasonHeader },
    ...(initiatorHeader ? [{ field: "ผู้ยกเลิก", header: initiatorHeader }] : []),
    ...(cancelledAtHeader ? [{ field: "วันที่ยกเลิก", header: cancelledAtHeader }] : []),
  ];

  const rows: CancellationRow[] = [];
  let skippedRows = 0;
  // One order can appear on several rows (one per line item) in these
  // exports; the cancellation detail is identical on each, so keep the first.
  const seen = new Set<string>();

  for (const row of dataRows) {
    const orderNo = text(row, orderNoHeader);
    if (!orderNo) {
      skippedRows++;
      continue;
    }
    if (seen.has(orderNo)) continue;
    seen.add(orderNo);

    rows.push({
      orderNo,
      reason: text(row, reasonHeader) || null,
      initiator: normaliseInitiator(text(row, initiatorHeader)),
      cancelledAt: parseDate(text(row, cancelledAtHeader)),
    });
  }

  return { rows, skippedRows, matchedHeaders };
}
