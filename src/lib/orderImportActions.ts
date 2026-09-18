"use server";

import { revalidatePath } from "next/cache";
import { Platform } from "@prisma/client";
import { requireAdmin } from "@/lib/dal";
import { logActivity } from "@/lib/activityLog";
import { upsertOrder } from "@/lib/sync";
import { parseShopeeExport } from "@/lib/platforms/shopeeImport";
import { parseLazadaExport } from "@/lib/platforms/lazadaImport";
import { detectImportFileTarget, knownShopNamesLabel } from "@/lib/platforms/importFileNaming";

export interface OrderImportState {
  error?: string;
  result?: {
    platform: Platform;
    shopName: string;
    orderCount: number;
    itemCount: number;
    skippedRows: number;
    unrecognizedStatuses: string[];
  };
}

export async function importOrderFile(_state: OrderImportState, formData: FormData): Promise<OrderImportState> {
  const admin = await requireAdmin();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "กรุณาเลือกไฟล์ที่ export มาจาก Shopee หรือ Lazada Seller Center" };
  }

  const target = detectImportFileTarget(file.name);
  if (!target) {
    return {
      error: `ไม่รู้จักชื่อไฟล์นี้ — ต้องขึ้นต้นด้วย "SP-{ชื่อร้าน}" หรือ "LZD-{ชื่อร้าน}" เช่น "SP-Kgarden-Order.all....xlsx" (ร้านที่รู้จัก: ${knownShopNamesLabel()})`,
    };
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(await file.arrayBuffer());
  } catch {
    return { error: "อ่านไฟล์ไม่สำเร็จ ลองอีกครั้ง" };
  }

  let orders: ReturnType<typeof parseShopeeExport>["orders"];
  let skippedRows: number;
  let unrecognizedStatuses: string[];

  try {
    if (target.platform === Platform.SHOPEE) {
      const result = parseShopeeExport(buffer, target.shopName);
      orders = result.orders;
      skippedRows = result.skippedRows;
      unrecognizedStatuses = result.unrecognizedStatuses;
    } else {
      const result = parseLazadaExport(buffer, target.shopName);
      orders = result.orders;
      skippedRows = result.skippedRows;
      unrecognizedStatuses = result.unrecognizedStatuses;
    }
  } catch {
    return { error: `รูปแบบไฟล์ไม่ถูกต้อง — ต้องเป็นไฟล์ที่ export มาจาก ${target.platform === Platform.SHOPEE ? "Shopee" : "Lazada"} Seller Center โดยตรง (.xlsx หรือ .csv)` };
  }

  if (orders.length === 0) {
    return { error: "ไม่พบข้อมูลออเดอร์ในไฟล์นี้" };
  }

  for (const order of orders) {
    await upsertOrder(order);
  }

  const itemCount = orders.reduce((sum, o) => sum + o.items.length, 0);

  await logActivity({
    userId: admin.id,
    username: admin.username,
    action: "ORDER_FILE_MANUAL_IMPORT",
    detail: `นำเข้า ${orders.length} ออเดอร์ (${target.platform}) ร้าน "${target.shopName}" (${file.name})`,
  });

  revalidatePath("/orders");
  revalidatePath("/");
  revalidatePath("/orders/shipping-summary");

  return {
    result: {
      platform: target.platform,
      shopName: target.shopName,
      orderCount: orders.length,
      itemCount,
      skippedRows,
      unrecognizedStatuses,
    },
  };
}
