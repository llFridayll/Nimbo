import { Order } from "@prisma/client";
import { fetchTikTokShippingLabelUrl } from "./platforms/tiktok";

export function getTikTokPackageId(order: Order): string | null {
  const rawPayload = order.rawPayload as { packages?: { id?: string }[] } | null;
  return rawPayload?.packages?.[0]?.id ?? null;
}

/** Downloads one order's real TikTok shipping-label PDF as raw bytes —
 * shared by the single-order print route and the bulk merge route so both
 * hit the exact same lookup/error path. */
export async function fetchTikTokLabelPdfBytes(order: Order): Promise<Uint8Array> {
  const packageId = getTikTokPackageId(order);
  if (!packageId) {
    throw new Error("ยังไม่มีข้อมูลพัสดุสำหรับออเดอร์นี้ (อาจยังไม่ถูกอัปเดตจาก TikTok)");
  }
  const docUrl = await fetchTikTokShippingLabelUrl(packageId, order.shopId);
  const res = await fetch(docUrl);
  if (!res.ok) {
    throw new Error(`Failed to download shipping label PDF: ${res.status}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}
