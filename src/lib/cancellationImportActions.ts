"use server";

import { revalidatePath } from "next/cache";
import { OrderStatus } from "@prisma/client";
import { logActivity } from "./activityLog";
import { requireAdmin } from "./dal";
import { prisma } from "./db";
import { CancellationParseError, parseCancellationExport } from "./platforms/cancellationImport";
import { ReturnParseError, looksLikeReturnReport, parseReturnExport } from "./platforms/returnImport";
import * as XLSX from "xlsx";

const MAX_LISTED = 20;

/** Outcome for one uploaded file. Errors are per-file so one unreadable
 * export doesn't discard the rest of the batch. */
export interface CancellationFileOutcome {
  fileName: string;
  /** Which report this file turned out to be. Detected from its columns, not
   * asked for on the form — the two exports are keyed on the same order
   * number and the shop downloads them from adjacent screens, so making
   * someone pick the right upload box is a step that only ever goes wrong. */
  kind?: "cancellation" | "return";
  error?: string;
  /** Set alongside `error` when the parser couldn't find a column — these are
   * the headers the file actually has, so the right name can be added to
   * HEADER_CANDIDATES instead of the upload just failing. */
  foundHeaders?: string[];
  matchedHeaders?: { field: string; header: string }[];
  rowsInFile?: number;
  skippedRows?: number;
  updated?: number;
  /** Rows whose order exists but isn't marked cancelled (or, for a returns
   * file, returned) here — the reason is saved, the status is deliberately
   * left alone. */
  notCancelledHere?: string[];
  notCancelledCount?: number;
  /** Returns only: total refunded across the orders this file matched. */
  refundTotal?: number;
  /** Order numbers in the file that this system has never seen. */
  notFound?: string[];
  notFoundCount?: number;
  noReason?: number;
}

export interface CancellationImportState {
  /** Only for a problem with the submission as a whole (no files chosen). */
  error?: string;
  results?: CancellationFileOutcome[];
  totals?: { files: number; succeeded: number; failed: number; updated: number; notFound: number };
}

/** A returns export: matched on order number exactly like the cancellation
 * one, but writing the return columns. Status is left alone for the same
 * reason — an order's status comes from sync, and a spreadsheet may be a
 * stale export. */
async function importReturns(fileName: string, buffer: Buffer): Promise<CancellationFileOutcome> {
  let parsed;
  try {
    parsed = parseReturnExport(buffer);
  } catch (err) {
    if (err instanceof ReturnParseError) {
      return { fileName, kind: "return", error: err.message, foundHeaders: err.foundHeaders };
    }
    return { fileName, kind: "return", error: "อ่านไฟล์รายการคืนสินค้าไม่สำเร็จ" };
  }

  if (parsed.rows.length === 0) {
    return { fileName, kind: "return", error: "ไม่พบแถวที่มีเลขคำสั่งซื้อในไฟล์นี้" };
  }

  const existing = await prisma.order.findMany({
    where: { platformOrderId: { in: parsed.rows.map((r) => r.orderNo) } },
    select: { id: true, platformOrderId: true, status: true },
  });
  const byOrderNo = new Map(existing.map((o) => [o.platformOrderId, o]));

  const notFound: string[] = [];
  const notReturnedHere: string[] = [];
  let updated = 0;
  let noReason = 0;
  let refundTotal = 0;

  for (const row of parsed.rows) {
    const order = byOrderNo.get(row.orderNo);
    if (!order) {
      notFound.push(row.orderNo);
      continue;
    }
    if (!row.reason && !row.returnedAt && row.refundAmount === null) {
      noReason++;
      continue;
    }
    if (order.status !== OrderStatus.RETURNED) notReturnedHere.push(row.orderNo);

    await prisma.order.update({
      where: { id: order.id },
      data: { returnReason: row.reason, returnedAt: row.returnedAt, refundAmount: row.refundAmount },
    });
    updated++;
    refundTotal += row.refundAmount ?? 0;
  }

  return {
    fileName,
    kind: "return",
    matchedHeaders: parsed.matchedHeaders,
    rowsInFile: parsed.rows.length,
    skippedRows: parsed.skippedRows,
    updated,
    notCancelledHere: notReturnedHere.slice(0, MAX_LISTED),
    notCancelledCount: notReturnedHere.length,
    notFound: notFound.slice(0, MAX_LISTED),
    notFoundCount: notFound.length,
    noReason,
    refundTotal,
  };
}

/** Peeks at the first row's column names so the file can be routed without
 * reading it twice through a full parser. */
function sheetHeaders(buffer: Buffer): string[] {
  try {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) return [];
    const [first] = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
    return first ? Object.keys(first) : [];
  } catch {
    return [];
  }
}

async function importOne(file: File): Promise<CancellationFileOutcome> {
  let buffer: Buffer;
  try {
    buffer = Buffer.from(await file.arrayBuffer());
  } catch {
    return { fileName: file.name, error: "อ่านไฟล์ไม่สำเร็จ" };
  }

  if (looksLikeReturnReport(sheetHeaders(buffer))) return importReturns(file.name, buffer);

  let parsed;
  try {
    parsed = parseCancellationExport(buffer);
  } catch (err) {
    if (err instanceof CancellationParseError) {
      return { fileName: file.name, kind: "cancellation", error: err.message, foundHeaders: err.foundHeaders };
    }
    return {
      fileName: file.name,
      error: "อ่านไฟล์ไม่สำเร็จ — ต้องเป็นไฟล์ที่ export มาจาก Seller Center โดยตรง (.xlsx หรือ .csv)",
    };
  }

  if (parsed.rows.length === 0) {
    return { fileName: file.name, kind: "cancellation", error: "ไม่พบแถวที่มีเลขคำสั่งซื้อในไฟล์นี้" };
  }

  // One query for every order number in the file rather than one per row —
  // a few hundred round trips to Singapore would dominate the whole import.
  const existing = await prisma.order.findMany({
    where: { platformOrderId: { in: parsed.rows.map((r) => r.orderNo) } },
    select: { id: true, platformOrderId: true, status: true },
  });
  const byOrderNo = new Map(existing.map((o) => [o.platformOrderId, o]));

  const notFound: string[] = [];
  const notCancelledHere: string[] = [];
  let updated = 0;
  let noReason = 0;

  for (const row of parsed.rows) {
    const order = byOrderNo.get(row.orderNo);
    if (!order) {
      notFound.push(row.orderNo);
      continue;
    }
    if (!row.reason && !row.initiator && !row.cancelledAt) {
      noReason++;
      continue;
    }
    if (order.status !== OrderStatus.CANCELLED) {
      // Recorded, but the status is left as it is: an order's status comes
      // from sync, and flipping it from an uploaded file would quietly pull
      // it out of sales figures and the packing list on the strength of a
      // spreadsheet that may be a stale export.
      notCancelledHere.push(row.orderNo);
    }
    await prisma.order.update({
      where: { id: order.id },
      data: { cancelReason: row.reason, cancelInitiator: row.initiator, cancelledAt: row.cancelledAt },
    });
    updated++;
  }

  return {
    fileName: file.name,
    kind: "cancellation",
    matchedHeaders: parsed.matchedHeaders,
    rowsInFile: parsed.rows.length,
    skippedRows: parsed.skippedRows,
    updated,
    notCancelledHere: notCancelledHere.slice(0, MAX_LISTED),
    notCancelledCount: notCancelledHere.length,
    notFound: notFound.slice(0, MAX_LISTED),
    notFoundCount: notFound.length,
    noReason,
  };
}

/** "ยกเลิก 9, คืนสินค้า 1" — one batch can mix the two reports. */
function kindSummary(results: CancellationFileOutcome[]): string {
  const cancellations = results.filter((r) => r.kind !== "return").length;
  const returns = results.length - cancellations;
  return [cancellations ? `ยกเลิก ${cancellations}` : "", returns ? `คืนสินค้า ${returns}` : ""].filter(Boolean).join(", ");
}

/** Filenames for the activity log, trimmed so a bulk upload doesn't write a
 * paragraph into a table cell. */
const MAX_LOGGED_NAMES = 5;

function fileList(results: CancellationFileOutcome[]): string {
  const names = results.map((r) => r.fileName);
  if (names.length <= MAX_LOGGED_NAMES) return names.join(", ");
  return `${names.slice(0, MAX_LOGGED_NAMES).join(", ")} และอีก ${names.length - MAX_LOGGED_NAMES} ไฟล์`;
}

export async function importCancellationFile(
  _state: CancellationImportState,
  formData: FormData,
): Promise<CancellationImportState> {
  const admin = await requireAdmin();

  const files = formData.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { error: "เลือกไฟล์ก่อนครับ" };

  // Sequential, for the same reason as the order import: these loops write
  // row by row against a small connection pool.
  const results: CancellationFileOutcome[] = [];
  for (const file of files) {
    results.push(await importOne(file));
  }

  const succeeded = results.filter((r) => !r.error);
  const updated = succeeded.reduce((sum, r) => sum + (r.updated ?? 0), 0);
  const notFound = succeeded.reduce((sum, r) => sum + (r.notFoundCount ?? 0), 0);

  if (succeeded.length > 0) {
    await logActivity({
      userId: admin.id,
      username: admin.username,
      action: "CANCELLATION_FILE_IMPORT",
      // Names and kinds, not just a count. A bare "10 ไฟล์" makes the log
      // useless for the questions it actually gets asked — which shop, and
      // which report — and the uploaded files aren't kept to check against.
      detail: `${succeeded.length} ไฟล์ (${kindSummary(succeeded)}) — อัปเดต ${updated} ออเดอร์, ไม่พบ ${notFound} (${fileList(succeeded)})`,
    });
    revalidatePath("/cancellations");
    revalidatePath("/returns");
  }

  return {
    results,
    totals: {
      files: results.length,
      succeeded: succeeded.length,
      failed: results.length - succeeded.length,
      updated,
      notFound,
    },
  };
}
