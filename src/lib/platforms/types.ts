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
  /** Why the platform says this order was cancelled, and who cancelled it
   * (BUYER / SELLER / SYSTEM). Only set for cancelled orders. All three
   * platforms report the first two — TikTok over the API, Shopee and Lazada
   * inside the order export itself (see cancellationFields.ts) — but neither
   * file export carries a cancellation timestamp, so `cancelledAt` stays
   * undefined for those. */
  cancelReason?: string;
  cancelInitiator?: string;
  cancelledAt?: Date;
  /** When the shipping label / tracking number was created, as the platform
   * itself records it. The shipping summary files an order under the day its
   * tracking number arrived, so this is preferred over every estimate in
   * sync.ts. Only TikTok reports it (rts_time) — and it does so whether the
   * label was printed here or in Seller Center. Shopee and Lazada exports
   * carry no such time; see `shippedAt`. */
  labelCreatedAt?: Date;
  /** When the carrier took the parcel (Shopee's "เวลาส่งสินค้า"). Later than
   * the label, but a real date for an order that has already gone out — far
   * closer than the order date for filing historical orders. */
  shippedAt?: Date;
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
