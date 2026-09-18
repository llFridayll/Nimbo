import { OrderStatus, Platform } from "@prisma/client";

/** Normalized order shape every platform adapter must produce, regardless of the
 *  wildly different payload shapes TikTok Shop / Shopee / Lazada actually return. */
export interface NormalizedOrderItem {
  sku: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  imageUrl?: string;
}

export interface NormalizedOrder {
  platform: Platform;
  platformOrderId: string;
  status: OrderStatus;
  buyerName?: string;
  buyerPhone?: string;
  buyerUsername?: string;
  /** District + province only — see the matching Order.buyerRegion schema
   * comment for why nothing more precise is available. */
  buyerRegion?: string;
  totalAmount: number;
  currency: string;
  orderDate: Date;
  shippingCarrier?: string;
  trackingNumber?: string;
  shippingStatus?: string;
  /** Which store this came from, for platforms with multiple shops per
   * seller account (currently TikTok Shop only). */
  shopId?: string;
  shopName?: string;
  /** True when the platform itself reports this order as still awaiting
   * payment — see the matching Order.isUnpaid schema comment. Optional
   * (defaults to false) since most orders and every platform's non-unpaid
   * statuses don't need to set this at all. */
  isUnpaid?: boolean;
  items: NormalizedOrderItem[];
  rawPayload: unknown;
}

/** Every marketplace connector implements this so the sync service and webhook
 * handlers never need to know which platform they're talking to. */
export interface PlatformAdapter {
  platform: Platform;
  isConfigured(): boolean;
  /** Pull orders updated since `since` (or a reasonable recent window if omitted). */
  fetchRecentOrders(since?: Date): Promise<NormalizedOrder[]>;
  /** Pull a single order by the platform's own order id — used for search fallback
   * and manual refresh when a webhook is missed. */
  fetchOrderById(platformOrderId: string): Promise<NormalizedOrder | null>;
  /** Normalize a webhook payload straight from the platform into our shape. */
  normalizeWebhookPayload(payload: unknown): NormalizedOrder | null;
  /** One-time full history pull from `startDate` to now, handling pagination
   * and any platform-side max-range-per-request limit internally. Streams
   * results in batches via `onBatch` instead of returning one giant array, so
   * a multi-year backfill doesn't have to sit in memory. Returns total count.
   * Optional — platforms without a real API (still mock) don't implement it. */
  fetchOrderHistory?(startDate: Date, onBatch: (orders: NormalizedOrder[]) => Promise<void>): Promise<number>;
}
