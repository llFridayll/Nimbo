import { Platform } from "@prisma/client";

export interface ItemDiscountInfo {
  /** Original price of one unit before any discount. */
  unitOriginalPrice: number;
  /** Amount knocked off one unit (platform-funded + seller-funded combined). */
  unitDiscount: number;
}

export interface OrderDiscountInfo {
  /** Per-SKU original price/discount, keyed the same way OrderItem.sku is. */
  items: Map<string, ItemDiscountInfo>;
  /** Order-level totals straight from the platform's payment breakdown. */
  totalOriginalPrice: number;
  totalDiscount: number;
}

interface TikTokRawLineItem {
  seller_sku?: string;
  sku_id?: string;
  original_price?: string;
  platform_discount?: string;
  seller_discount?: string;
}

interface TikTokRawPayload {
  line_items?: TikTokRawLineItem[];
  payment?: {
    original_total_product_price?: string;
    platform_discount?: string;
    seller_discount?: string;
  };
}

/** Pulls the discount breakdown TikTok Shop already sends on every order
 * (original price vs. what the platform/seller knocked off) out of the raw
 * payload we store — it isn't in our own schema since only TikTok has real
 * data for it right now. Returns null when there's nothing to show. */
export function getOrderDiscountInfo(platform: Platform, rawPayload: unknown): OrderDiscountInfo | null {
  if (platform !== Platform.TIKTOK || !rawPayload) return null;
  const raw = rawPayload as TikTokRawPayload;
  if (!raw.line_items?.length) return null;

  // TikTok's Search Orders response has one line_item row per physical
  // unit, so summing across rows sharing a SKU gives the right per-SKU
  // total (and dividing by the group's count gives the per-unit figure).
  const groups = new Map<string, { originalTotal: number; discountTotal: number; count: number }>();
  for (const li of raw.line_items) {
    const sku = li.seller_sku || li.sku_id;
    if (!sku) continue;
    const original = Number(li.original_price ?? 0);
    const discount = Number(li.platform_discount ?? 0) + Number(li.seller_discount ?? 0);
    const group = groups.get(sku) ?? { originalTotal: 0, discountTotal: 0, count: 0 };
    group.originalTotal += original;
    group.discountTotal += discount;
    group.count += 1;
    groups.set(sku, group);
  }

  const items = new Map<string, ItemDiscountInfo>();
  for (const [sku, g] of groups) {
    items.set(sku, { unitOriginalPrice: g.originalTotal / g.count, unitDiscount: g.discountTotal / g.count });
  }

  const payment = raw.payment ?? {};
  const totalOriginalPrice = Number(payment.original_total_product_price ?? 0);
  const totalDiscount = Number(payment.platform_discount ?? 0) + Number(payment.seller_discount ?? 0);

  return { items, totalOriginalPrice, totalDiscount };
}
