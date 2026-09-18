import "server-only";
import { Platform } from "@prisma/client";
import { fetchLineMessageContent } from "@/lib/line";
import { parseShopeeExport } from "@/lib/platforms/shopeeImport";
import { parseLazadaExport } from "@/lib/platforms/lazadaImport";
import { detectImportFileTarget, knownShopNamesLabel } from "@/lib/platforms/importFileNaming";
import { upsertOrder } from "@/lib/sync";

export interface OrderFileLineImportOutcome {
  replyText: string;
}

/** Downloads an order-export file someone sent the bot and imports it — the
 * platform and shop come straight from the filename ("SP-{shop}..." /
 * "LZD-{shop}...", see importFileNaming.ts), so there's no separate "type
 * the shop name first" step. Same parse/upsert path the web upload form
 * uses, just triggered from a chat message instead of a form submit. */
export async function importOrderFileFromLine(fileName: string, messageId: string): Promise<OrderFileLineImportOutcome> {
  const target = detectImportFileTarget(fileName);
  if (!target) {
    return {
      replyText: `ไม่รู้จักชื่อไฟล์นี้ครับ — ต้องขึ้นต้นด้วย "SP-{ชื่อร้าน}" หรือ "LZD-{ชื่อร้าน}" เช่น "SP-Kgarden-...xlsx"\n\nร้านที่รู้จัก: ${knownShopNamesLabel()}`,
    };
  }

  const buffer = await fetchLineMessageContent(messageId);
  if (!buffer) {
    return { replyText: "ดาวน์โหลดไฟล์ไม่สำเร็จ ลองส่งใหม่อีกครั้งครับ" };
  }

  let orders: ReturnType<typeof parseShopeeExport>["orders"];
  let skippedRows: number;
  let unrecognizedStatuses: string[];

  try {
    if (target.platform === Platform.SHOPEE) {
      ({ orders, skippedRows, unrecognizedStatuses } = parseShopeeExport(buffer, target.shopName));
    } else {
      ({ orders, skippedRows, unrecognizedStatuses } = parseLazadaExport(buffer, target.shopName));
    }
  } catch {
    return { replyText: "อ่านไฟล์ไม่สำเร็จ — ต้องเป็นไฟล์ที่ export มาจาก Seller Center โดยตรง (.xlsx หรือ .csv)" };
  }

  if (orders.length === 0) {
    return { replyText: "ไม่พบข้อมูลออเดอร์ในไฟล์นี้ครับ" };
  }

  for (const order of orders) {
    await upsertOrder(order);
  }

  const itemCount = orders.reduce((sum, o) => sum + o.items.length, 0);
  const lines = [`✅ นำเข้าสำเร็จ ${orders.length} ออเดอร์ (${itemCount} รายการสินค้า) ร้าน "${target.shopName}"`];
  if (skippedRows > 0) lines.push(`ข้ามแถวว่าง ${skippedRows} แถว`);
  if (unrecognizedStatuses.length > 0) {
    lines.push(`⚠️ พบสถานะที่ยังไม่รู้จัก: ${unrecognizedStatuses.join(", ")}`);
  }

  console.log(`[order-file-line-import] imported ${orders.length} orders for shop "${target.shopName}" (${target.platform}) via LINE`);

  return { replyText: lines.join("\n") };
}
