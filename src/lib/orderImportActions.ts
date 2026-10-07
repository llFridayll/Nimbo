"use server";

import { revalidatePath } from "next/cache";
import { Platform } from "@prisma/client";
import { requireAdmin } from "@/lib/dal";
import { logActivity } from "@/lib/activityLog";
import { upsertOrder } from "@/lib/sync";
import { parseShopeeExport } from "@/lib/platforms/shopeeImport";
import { parseLazadaExport } from "@/lib/platforms/lazadaImport";
import { detectImportFileTarget, knownShopNamesLabel } from "@/lib/platforms/importFileNaming";

/** What happened to one file in the batch. A failure here is per-file: the
 * whole point of accepting several at once is that one shop's malformed
 * export doesn't throw away the other eight that parsed fine. */
export interface OrderImportFileOutcome {
  fileName: string;
  error?: string;
  platform?: Platform;
  shopName?: string;
  orderCount?: number;
  itemCount?: number;
  skippedRows?: number;
  unrecognizedStatuses?: string[];
}

export interface OrderImportState {
  /** Only for a problem with the submission as a whole (no files chosen). */
  error?: string;
  results?: OrderImportFileOutcome[];
  totals?: {
    files: number;
    succeeded: number;
    failed: number;
    orderCount: number;
    itemCount: number;
  };
}

async function importOne(file: File): Promise<OrderImportFileOutcome> {
  const target = detectImportFileTarget(file.name);
  if (!target) {
    return {
      fileName: file.name,
      error: `ไม่รู้จักชื่อไฟล์ — ต้องขึ้นต้นด้วย "SP-{ชื่อร้าน}" หรือ "LZD-{ชื่อร้าน}" (ร้านที่รู้จัก: ${knownShopNamesLabel()})`,
    };
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(await file.arrayBuffer());
  } catch {
    return { fileName: file.name, error: "อ่านไฟล์ไม่สำเร็จ" };
  }

  let orders: ReturnType<typeof parseShopeeExport>["orders"];
  let skippedRows: number;
  let unrecognizedStatuses: string[];
  try {
    const result =
      target.platform === Platform.SHOPEE
        ? parseShopeeExport(buffer, target.shopName)
        : parseLazadaExport(buffer, target.shopName);
    orders = result.orders;
    skippedRows = result.skippedRows;
    unrecognizedStatuses = result.unrecognizedStatuses;
  } catch {
    return {
      fileName: file.name,
      error: `รูปแบบไฟล์ไม่ถูกต้อง — ต้องเป็นไฟล์ที่ export มาจาก ${target.platform === Platform.SHOPEE ? "Shopee" : "Lazada"} Seller Center โดยตรง`,
    };
  }

  if (orders.length === 0) {
    return { fileName: file.name, error: "ไม่พบข้อมูลออเดอร์ในไฟล์นี้", platform: target.platform, shopName: target.shopName };
  }

  for (const order of orders) {
    await upsertOrder(order);
  }

  return {
    fileName: file.name,
    platform: target.platform,
    shopName: target.shopName,
    orderCount: orders.length,
    itemCount: orders.reduce((sum, o) => sum + o.items.length, 0),
    skippedRows,
    unrecognizedStatuses,
  };
}

export async function importOrderFile(_state: OrderImportState, formData: FormData): Promise<OrderImportState> {
  const admin = await requireAdmin();

  const files = formData.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) {
    return { error: "กรุณาเลือกไฟล์ที่ export มาจาก Shopee หรือ Lazada Seller Center" };
  }

  // Sequential on purpose: each file's rows go through upsertOrder, and
  // running several files at once would multiply the open database
  // connections against a pool that only has a handful to give.
  const results: OrderImportFileOutcome[] = [];
  for (const file of files) {
    results.push(await importOne(file));
  }

  const succeeded = results.filter((r) => !r.error);
  const orderCount = succeeded.reduce((sum, r) => sum + (r.orderCount ?? 0), 0);
  const itemCount = succeeded.reduce((sum, r) => sum + (r.itemCount ?? 0), 0);

  if (succeeded.length > 0) {
    await logActivity({
      userId: admin.id,
      username: admin.username,
      action: "ORDER_FILE_MANUAL_IMPORT",
      detail: `นำเข้า ${orderCount} ออเดอร์ จาก ${succeeded.length} ไฟล์ (${succeeded.map((r) => r.fileName).join(", ")})`,
    });

    revalidatePath("/orders");
    revalidatePath("/");
    revalidatePath("/orders/shipping-summary");
  }

  return {
    results,
    totals: {
      files: results.length,
      succeeded: succeeded.length,
      failed: results.length - succeeded.length,
      orderCount,
      itemCount,
    },
  };
}
