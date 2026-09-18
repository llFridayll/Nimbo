import { OrderStatus, Platform } from "@prisma/client";
import { PlatformAdapter, NormalizedOrder, NormalizedOrderItem } from "./types";
import { generateMockOrders } from "./mockData";
import { buildPartnerUrl, getAllTikTokShopCredentials, getTikTokCredentialsForShop } from "./tiktokAuth";
import type { TikTokShopCredentials } from "./tiktokAuth";

/** Maps TikTok Shop's order_status strings to our unified OrderStatus.
 * Ref: https://partner.tiktokshop.com/docv2 (Order > Search Orders). */
function mapTikTokStatus(tiktokStatus: string): OrderStatus {
  switch (tiktokStatus) {
    case "UNPAID":
    case "ON_HOLD":
      return OrderStatus.NEW;
    case "AWAITING_SHIPMENT":
    case "AWAITING_COLLECTION":
    case "PARTIALLY_SHIPPING":
      return OrderStatus.PENDING_SHIPMENT;
    case "IN_TRANSIT":
      return OrderStatus.SHIPPED;
    case "DELIVERED":
    case "COMPLETED":
      return OrderStatus.DELIVERED;
    case "CANCELLED":
      return OrderStatus.CANCELLED;
    case "REFUND_REQUESTED":
    case "REFUND_OR_RETURN_REQUEST_PENDING":
      return OrderStatus.REFUND_REQUESTED;
    case "RETURNED":
      return OrderStatus.RETURNED;
    default:
      return OrderStatus.PROBLEM;
  }
}

interface TikTokOrderLine {
  sku_id: string;
  seller_sku: string;
  product_name: string;
  sku_image?: string;
  sale_price: string;
  quantity?: number;
}

interface TikTokOrder {
  id: string;
  status: string;
  buyer_name?: string;
  /** TikTok's opaque internal buyer identifier — not a real, human-readable
   * username/handle (TikTok doesn't expose that at all), but stable across a
   * buyer's orders, so it's still useful for spotting repeat customers. */
  user_id?: string | number;
  recipient_address?: {
    phone_number?: string;
    name?: string;
    /** District/province/country breakdown — the only part of the address
     * TikTok leaves unmasked (address_line1/address_detail come back
     * asterisked out, e.g. "20**********"). */
    district_info?: { address_level: string; address_name: string }[];
  };
  payment?: { total_amount?: string; currency?: string };
  create_time: number;
  shipping_provider?: string;
  tracking_number?: string;
  delivery_option_name?: string;
  /** An order normally ships as one package, but a seller can split it into
   * several — each with its own tracking number that `tracking_number` above
   * does NOT reflect (that top-level field only ever carries one value).
   * See withMultiPackageTracking below for how the rest get pulled in. */
  packages?: { id: string }[];
  line_items: TikTokOrderLine[];
  /** Sellers can place these against their own shop to test checkout/shipping
   * flows — TikTok includes them in the Search Orders response like any real
   * order, so they need to be filtered out explicitly or they'd pollute
   * sales stats and order lists with fake activity. */
  is_sample_order?: boolean;
}

/** Drops seller-created test orders (see TikTokOrder.is_sample_order) before
 * they ever reach normalizeTikTokOrder / the DB. */
function isRealOrder(order: TikTokOrder): boolean {
  return order.is_sample_order !== true;
}

/** TikTok Shop's Search Orders response lists one row per physical unit —
 * there's no `quantity` multiplier field. Ordering 2 of the same SKU shows
 * up as two separate line_items with the same sku_id, so we group by SKU
 * and count occurrences to get a real quantity. */
function normalizeLineItems(lineItems: TikTokOrderLine[]): NormalizedOrderItem[] {
  const bySku = new Map<string, NormalizedOrderItem>();
  for (const li of lineItems ?? []) {
    const sku = li.seller_sku || li.sku_id;
    const existing = bySku.get(sku);
    if (existing) {
      existing.quantity += li.quantity ?? 1;
    } else {
      bySku.set(sku, {
        sku,
        productName: li.product_name,
        quantity: li.quantity ?? 1,
        unitPrice: Number(li.sale_price ?? 0),
        imageUrl: li.sku_image,
      });
    }
  }
  return Array.from(bySku.values());
}

/** "เกาะลันตา, กระบี่" style district+province string from TikTok's
 * district_info breakdown — undefined if TikTok didn't send one. */
function extractBuyerRegion(address?: TikTokOrder["recipient_address"]): string | undefined {
  const info = address?.district_info;
  if (!info?.length) return undefined;
  const province = info.find((d) => d.address_level === "L1")?.address_name;
  const district = info.find((d) => d.address_level === "L2")?.address_name;
  return [district, province].filter(Boolean).join(", ") || undefined;
}

function normalizeTikTokOrder(order: TikTokOrder, shop?: TikTokShopCredentials): NormalizedOrder {
  const items = normalizeLineItems(order.line_items);

  return {
    platform: Platform.TIKTOK,
    platformOrderId: order.id,
    status: mapTikTokStatus(order.status),
    isUnpaid: order.status === "UNPAID",
    buyerName: order.buyer_name ?? order.recipient_address?.name,
    buyerPhone: order.recipient_address?.phone_number,
    buyerUsername: order.user_id != null ? String(order.user_id) : undefined,
    buyerRegion: extractBuyerRegion(order.recipient_address),
    totalAmount: Number(order.payment?.total_amount ?? 0),
    currency: order.payment?.currency ?? "THB",
    orderDate: new Date(order.create_time * 1000),
    shippingCarrier: order.shipping_provider,
    trackingNumber: order.tracking_number,
    shippingStatus: order.delivery_option_name,
    shopId: shop?.shopId,
    shopName: shop?.shopName ?? undefined,
    items,
    rawPayload: order,
  };
}

/** An order split into more than one package can have a different tracking
 * number per package — the order's own `tracking_number` field never
 * reflects more than one of them — so for that (rare) case this fetches
 * each package's own tracking number and folds them all into one field,
 * joined by " / ". Left untouched (no extra API calls) for the normal
 * single-package order. */
async function withMultiPackageTracking(normalized: NormalizedOrder, order: TikTokOrder, shopId?: string): Promise<NormalizedOrder> {
  const packages = order.packages;
  if (!packages || packages.length <= 1) return normalized;

  const statuses = await Promise.all(packages.map((pkg) => fetchTikTokPackageStatus(pkg.id, shopId).catch(() => null)));
  const trackingNumbers = Array.from(new Set(statuses.map((s) => s?.trackingNumber).filter((t): t is string => Boolean(t))));
  if (trackingNumbers.length === 0) return normalized;

  return { ...normalized, trackingNumber: trackingNumbers.join(" / ") };
}

/** True once the app itself is registered (env vars present) — does NOT mean
 * a shop has actually clicked Authorize yet. That's checked separately in
 * fetchRecentOrders/fetchOrderById via getValidTikTokCredentials(), since
 * it requires a DB lookup this interface's isConfigured() can't do (sync). */
function hasAppCredentials(): boolean {
  return Boolean(
    process.env.TIKTOK_SHOP_APP_KEY && process.env.TIKTOK_SHOP_APP_SECRET && process.env.TIKTOK_SHOP_TOKEN_URL
  );
}

const ORDER_SEARCH_PATH = "/order/202309/orders/search";

interface OrderSearchPage {
  orders: TikTokOrder[];
  nextPageToken?: string;
}

/** One page of the Search Orders call for a given [createTimeGe, createTimeLt)
 * window. Throws with `rangeTooWide: true` attached if TikTok rejects the
 * request specifically for spanning too much time, so callers can shrink
 * the window and retry without us having to hardcode the exact limit. */
async function searchOrdersPage(
  accessToken: string,
  shopCipher: string,
  createTimeGe: number,
  createTimeLt: number,
  pageToken?: string
): Promise<OrderSearchPage> {
  const body = JSON.stringify({ create_time_ge: createTimeGe, create_time_lt: createTimeLt });
  const queryParams: Record<string, string> = { shop_cipher: shopCipher, page_size: "50" };
  if (pageToken) queryParams.page_token = pageToken;

  const url = buildPartnerUrl(ORDER_SEARCH_PATH, queryParams, body);
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-tts-access-token": accessToken },
    body,
  });

  const text = await res.text();
  if (!res.ok) {
    const rangeTooWide = /time range|date range|create_time/i.test(text) && res.status === 400;
    const error = new Error(`TikTok Shop API error: ${res.status} ${text}`) as Error & { rangeTooWide?: boolean };
    error.rangeTooWide = rangeTooWide;
    throw error;
  }

  const json = JSON.parse(text) as { data?: { orders?: TikTokOrder[]; next_page_token?: string } };
  return { orders: json.data?.orders ?? [], nextPageToken: json.data?.next_page_token || undefined };
}

/** Pages through every order in [createTimeGe, createTimeLt) and returns them all. */
async function fetchAllPagesInWindow(
  accessToken: string,
  shopCipher: string,
  createTimeGe: number,
  createTimeLt: number
): Promise<TikTokOrder[]> {
  const all: TikTokOrder[] = [];
  let pageToken: string | undefined;
  do {
    const page = await searchOrdersPage(accessToken, shopCipher, createTimeGe, createTimeLt, pageToken);
    all.push(...page.orders);
    pageToken = page.nextPageToken;
  } while (pageToken);
  return all;
}

const MAX_WINDOW_DAYS = 90; // starting guess; shrinks automatically if TikTok rejects a window as too wide
const MIN_WINDOW_DAYS = 1;

export const tiktokAdapter: PlatformAdapter = {
  platform: Platform.TIKTOK,

  isConfigured() {
    return hasAppCredentials();
  },

  /** Used for the routine "sync now" / scheduled sync — only ever pulls
   * orders from `since` (the dashboard passes "start of today") onward, so
   * repeated syncs stay cheap regardless of how much history has been
   * backfilled separately. */
  async fetchRecentOrders(since?: Date): Promise<NormalizedOrder[]> {
    if (!hasAppCredentials()) {
      return generateMockOrders(Platform.TIKTOK, 20, 0);
    }
    const shopCreds = await getAllTikTokShopCredentials();
    if (shopCreds.length === 0) {
      throw new Error(
        "ยังไม่ได้เชื่อมต่อร้าน TikTok Shop — กดปุ่มเชื่อมต่อร้าน TikTok Shop ที่หน้าภาพรวมก่อน"
      );
    }

    const createTimeGe = Math.floor((since ?? new Date(Date.now() - 24 * 60 * 60 * 1000)).getTime() / 1000);
    const createTimeLt = Math.floor(Date.now() / 1000) + 60;

    // A seller account can run more than one TikTok Shop store — pull each
    // one's orders separately since every Partner API call needs that
    // specific shop's shop_cipher, then tag results with which shop they came from.
    const allOrders: NormalizedOrder[] = [];
    for (const creds of shopCreds) {
      const orders = await fetchAllPagesInWindow(creds.accessToken, creds.shopCipher, createTimeGe, createTimeLt);
      const normalized = await Promise.all(
        orders.filter(isRealOrder).map((o) => withMultiPackageTracking(normalizeTikTokOrder(o, creds), o, creds.shopId))
      );
      allOrders.push(...normalized);
    }
    return allOrders;
  },

  async fetchOrderById(platformOrderId: string): Promise<NormalizedOrder | null> {
    if (!hasAppCredentials()) {
      const mocked = generateMockOrders(Platform.TIKTOK, 20, 0);
      return mocked.find((o) => o.platformOrderId === platformOrderId) ?? null;
    }
    const shopCreds = await getAllTikTokShopCredentials();

    const path = "/order/202309/orders";
    for (const creds of shopCreds) {
      const url = buildPartnerUrl(path, { ids: `["${platformOrderId}"]`, shop_cipher: creds.shopCipher });
      const res = await fetch(url, { headers: { "x-tts-access-token": creds.accessToken } });
      if (!res.ok) continue;

      const json = (await res.json()) as { data?: { orders?: TikTokOrder[] } };
      const order = json.data?.orders?.[0];
      if (order && isRealOrder(order)) return withMultiPackageTracking(normalizeTikTokOrder(order, creds), order, creds.shopId);
    }
    return null;
  },

  normalizeWebhookPayload(payload: unknown): NormalizedOrder | null {
    const body = payload as { data?: TikTokOrder };
    if (!body?.data || !isRealOrder(body.data)) return null;
    return normalizeTikTokOrder(body.data);
  },

  /** One-time full history pull: walks from `startDate` to now in windows,
   * shrinking the window and retrying if TikTok rejects one as spanning too
   * much time, and paginating fully within each window. Streams results via
   * `onBatch` per window so a multi-year backfill never holds everything in
   * memory at once. */
  async fetchOrderHistory(
    startDate: Date,
    onBatch: (orders: NormalizedOrder[]) => Promise<void>
  ): Promise<number> {
    if (!hasAppCredentials()) {
      const mocked = generateMockOrders(Platform.TIKTOK, 20, 0);
      await onBatch(mocked);
      return mocked.length;
    }
    const shopCreds = await getAllTikTokShopCredentials();
    if (shopCreds.length === 0) {
      throw new Error(
        "ยังไม่ได้เชื่อมต่อร้าน TikTok Shop — กดปุ่มเชื่อมต่อร้าน TikTok Shop ที่หน้าภาพรวมก่อน"
      );
    }

    let total = 0;
    // Backfill each connected shop in turn — every shop needs its own
    // window-shrinking pass since the max-range-per-request limit and how
    // much history each shop has both vary independently.
    for (const creds of shopCreds) {
      let windowStart = Math.floor(startDate.getTime() / 1000);
      const overallEnd = Math.floor(Date.now() / 1000) + 60;
      let windowDays = MAX_WINDOW_DAYS;

      while (windowStart < overallEnd) {
        const windowEnd = Math.min(windowStart + windowDays * 24 * 60 * 60, overallEnd);
        try {
          const orders = await fetchAllPagesInWindow(creds.accessToken, creds.shopCipher, windowStart, windowEnd);
          const realOrders = orders.filter(isRealOrder);
          if (realOrders.length > 0) {
            const normalized = await Promise.all(realOrders.map((o) => withMultiPackageTracking(normalizeTikTokOrder(o, creds), o, creds.shopId)));
            await onBatch(normalized);
            total += realOrders.length;
          }
          windowStart = windowEnd;
        } catch (err) {
          const rangeTooWide = (err as Error & { rangeTooWide?: boolean }).rangeTooWide;
          if (rangeTooWide && windowDays > MIN_WINDOW_DAYS) {
            windowDays = Math.max(MIN_WINDOW_DAYS, Math.floor(windowDays / 2));
            continue; // retry the same windowStart with a narrower window
          }
          throw err;
        }
      }
    }

    return total;
  },
};

/** Fetches the courier's actual shipping label (barcode, QR code, COD info,
 * sorting code — whatever J&T/Flash/etc. generated for this package) as a
 * PDF URL from TikTok Shop. This is the physical label a picker sticks on
 * the box; it's generated by TikTok + the courier, not by us, so we just
 * request it. `packageId` comes from the order's rawPayload.packages[0].id.
 *
 * TODO(verify): the exact response field name for the PDF URL isn't
 * confirmed against live TikTok docs (gated behind partner login) — this
 * checks a few likely names and throws with the raw response if none match,
 * so it's easy to patch once we see a real response shape.
 *
 * `shopId` picks which connected shop's credentials to use — required now
 * that one account can have several shops, each with its own shop_cipher.
 * Falls back to the first connected shop for orders synced before shopId
 * was tracked (shopId undefined/null). */
export async function fetchTikTokShippingLabelUrl(packageId: string, shopId?: string | null): Promise<string> {
  const creds = shopId ? await getTikTokCredentialsForShop(shopId) : await getAllTikTokShopCredentials().then((c) => c[0] ?? null);
  if (!creds) {
    throw new Error("ยังไม่ได้เชื่อมต่อร้าน TikTok Shop — กดปุ่มเชื่อมต่อร้าน TikTok Shop ที่หน้าภาพรวมก่อน");
  }

  const path = `/fulfillment/202309/packages/${packageId}/shipping_documents`;
  const url = buildPartnerUrl(path, {
    shop_cipher: creds.shopCipher,
    // Combined document (confirmed against TikTok's live API — the accepted
    // document_type values are SHIPPING_LABEL, PACKING_SLIP,
    // SHIPPING_LABEL_AND_PACKING_SLIP, SHIPPING_LABEL_PICTURE, HAZMAT_LABEL,
    // INVOICE_LABEL): page 1 is the barcode label, page 2 lists the SKUs/qty
    // per item, matching what TikTok's own seller UI prints.
    document_type: "SHIPPING_LABEL_AND_PACKING_SLIP",
    document_size: "A6",
  });

  const res = await fetch(url, { headers: { "x-tts-access-token": creds.accessToken } });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`TikTok Shop shipping document API error: ${res.status} ${text}`);
  }

  const json = JSON.parse(text) as { data?: Record<string, unknown> };
  const data = json.data ?? {};
  const docUrl =
    (data.doc_url as string) ??
    (data.document_url as string) ??
    (data.url as string) ??
    (data.pdf_url as string);

  if (!docUrl) {
    throw new Error(`Could not find a document URL in TikTok's response: ${text}`);
  }
  return docUrl;
}

export interface TikTokPackageStatus {
  packageStatus: string;
  packageSubStatus?: string;
  shippingProviderName?: string;
  trackingNumber?: string;
}

/** Live "where's the package right now" check — TikTok Shop's Open API has
 * no separate courier-checkpoint/events endpoint (confirmed by testing:
 * every plausible ".../tracking" path 404s), so this Get Package Detail call
 * is the most granular status available: a package_status/package_sub_status
 * pair (e.g. "TO_FULFILL"/"STOCKING", "COMPLETED"/"DELIVERED") rather than a
 * timestamped event history. Called on-demand from the order detail page for
 * orders still in flight — not worth calling for already-delivered/cancelled
 * orders, whose status won't change again. */
export async function fetchTikTokPackageStatus(packageId: string, shopId?: string | null): Promise<TikTokPackageStatus> {
  const creds = shopId ? await getTikTokCredentialsForShop(shopId) : await getAllTikTokShopCredentials().then((c) => c[0] ?? null);
  if (!creds) {
    throw new Error("ยังไม่ได้เชื่อมต่อร้าน TikTok Shop");
  }

  const path = `/fulfillment/202309/packages/${packageId}`;
  const url = buildPartnerUrl(path, { shop_cipher: creds.shopCipher });
  const res = await fetch(url, { headers: { "x-tts-access-token": creds.accessToken } });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`TikTok Shop package detail API error: ${res.status} ${text}`);
  }

  const json = JSON.parse(text) as {
    data?: { package_status?: string; package_sub_status?: string; shipping_provider_name?: string; tracking_number?: string };
  };
  const data = json.data ?? {};
  if (!data.package_status) {
    throw new Error(`No package_status in TikTok's response: ${text}`);
  }
  return {
    packageStatus: data.package_status,
    packageSubStatus: data.package_sub_status,
    shippingProviderName: data.shipping_provider_name,
    trackingNumber: data.tracking_number,
  };
}
