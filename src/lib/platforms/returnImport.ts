import "server-only";
import * as XLSX from "xlsx";
import { findHeader, text, type SheetRow } from "./cancellationImport";

/** A return happens AFTER the order shipped; a cancellation happens before.
 * Lazada reports them in a separate export from the order file (the one the
 * shop saves as "ราการคืนสินค้า ..."), with English headers even on a Thai
 * account — hence the mix below. Shopee's order export has a
 * "สถานะการคืนเงินหรือคืนสินค้า" column but no reason, so it is not read here. */
const HEADER_CANDIDATES = {
  orderNo: ["order id", "order no", "order number", "หมายเลขคำสั่งซื้อ", "เลขที่คำสั่งซื้อ"],
  reason: ["return reason", "refund reason", "reason", "เหตุผลการคืนสินค้า", "เหตุผลในการคืนสินค้า", "สาเหตุการคืนสินค้า"],
  returnedAt: ["return order date", "return date", "refund time", "วันที่คืนสินค้า", "วันเวลาที่คืนสินค้า"],
  refundAmount: ["refund amount", "refunded amount", "ยอดเงินคืน", "จำนวนเงินที่คืน"],
  status: ["status", "return status", "สถานะ"],
} as const;

export interface ReturnRow {
  orderNo: string;
  reason: string | null;
  returnedAt: Date | null;
  /** Summed across every returned line item of the order — the export gives
   * one row per item, and a partial return of a two-item order would
   * otherwise record only the first item's refund. */
  refundAmount: number | null;
  status: string | null;
}

export interface ReturnParseResult {
  rows: ReturnRow[];
  skippedRows: number;
  matchedHeaders: { field: string; header: string }[];
}

export class ReturnParseError extends Error {
  constructor(
    message: string,
    readonly foundHeaders: string[],
  ) {
    super(message);
    this.name = "ReturnParseError";
  }
}

/** True when this sheet looks like a returns export rather than a
 * cancellation one. Both are keyed on an order number, so the order-number
 * column alone can't tell them apart — a return-specific column has to be
 * present. Used to route an upload without asking which kind it is. */
export function looksLikeReturnReport(headers: string[]): boolean {
  const keys = headers.map((h) => h.trim().toLowerCase());
  return keys.some((k) => k.includes("return reason") || k.includes("return order id") || k.includes("return order date"));
}

/** Lazada writes shop-local time with no offset. Parsed as Bangkok rather
 * than as the server's own zone, so a deploy outside Asia/Bangkok doesn't
 * shift every return by hours (same reasoning as parseShopeeDate). */
function parseReturnDate(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === "null") return null;
  const parsed = new Date(`${trimmed.replace(" ", "T")}+07:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseAmount(value: string): number | null {
  const cleaned = value.replace(/[,\s]/g, "");
  if (!cleaned || cleaned.toLowerCase() === "null") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Reads a Lazada returns export into plain rows. Touches no database, so it
 * stays testable on a file alone — matching against real orders happens in
 * cancellationImportActions.ts. */
export function parseReturnExport(buffer: Buffer): ReturnParseResult {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new ReturnParseError("ไฟล์นี้ไม่มีชีตข้อมูล", []);

  const dataRows = XLSX.utils.sheet_to_json<SheetRow>(sheet, { defval: "" });
  if (dataRows.length === 0) throw new ReturnParseError("ไฟล์นี้ไม่มีข้อมูล", []);

  const foundHeaders = Object.keys(dataRows[0]);
  const orderNoHeader = findHeader(foundHeaders, HEADER_CANDIDATES.orderNo);
  if (!orderNoHeader) throw new ReturnParseError("หาคอลัมน์เลขคำสั่งซื้อในไฟล์นี้ไม่เจอ", foundHeaders);
  const reasonHeader = findHeader(foundHeaders, HEADER_CANDIDATES.reason);
  if (!reasonHeader) throw new ReturnParseError("หาคอลัมน์เหตุผลการคืนสินค้าในไฟล์นี้ไม่เจอ", foundHeaders);
  const returnedAtHeader = findHeader(foundHeaders, HEADER_CANDIDATES.returnedAt);
  const refundHeader = findHeader(foundHeaders, HEADER_CANDIDATES.refundAmount);
  const statusHeader = findHeader(foundHeaders, HEADER_CANDIDATES.status);

  const matchedHeaders = [
    { field: "เลขคำสั่งซื้อ", header: orderNoHeader },
    { field: "เหตุผลการคืน", header: reasonHeader },
    ...(returnedAtHeader ? [{ field: "วันที่คืน", header: returnedAtHeader }] : []),
    ...(refundHeader ? [{ field: "ยอดเงินคืน", header: refundHeader }] : []),
    ...(statusHeader ? [{ field: "สถานะการคืน", header: statusHeader }] : []),
  ];

  // One order can appear on several rows, one per returned line item. The
  // reason and dates repeat; only the refund differs, so that one is summed
  // and the rest taken from the first row seen.
  const byOrder = new Map<string, ReturnRow>();
  let skippedRows = 0;

  for (const row of dataRows) {
    const orderNo = text(row, orderNoHeader);
    if (!orderNo) {
      skippedRows++;
      continue;
    }
    const refund = refundHeader ? parseAmount(text(row, refundHeader)) : null;
    const seen = byOrder.get(orderNo);
    if (seen) {
      if (refund !== null) seen.refundAmount = (seen.refundAmount ?? 0) + refund;
      continue;
    }
    byOrder.set(orderNo, {
      orderNo,
      reason: text(row, reasonHeader) || null,
      returnedAt: returnedAtHeader ? parseReturnDate(text(row, returnedAtHeader)) : null,
      refundAmount: refund,
      status: statusHeader ? text(row, statusHeader) || null : null,
    });
  }

  return { rows: [...byOrder.values()], skippedRows, matchedHeaders };
}
