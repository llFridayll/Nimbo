import { OrderStatus, Platform } from "@prisma/client";
import { prisma } from "@/lib/db";
import { isMondayPromoWindow, type ShippingCutoffWindow } from "@/lib/dateUtils";
import { getSkuAliasMap, resolveDisplaySku } from "@/lib/skuAlias";
import { FREEBIE_TIE_WIRE_PREFIXES, isPlatformProvidedTieWireFreebie } from "@/lib/shippingSummaryDisplay";

const UNKNOWN_CARRIER_LABEL = "ไม่ระบุขนส่ง";
const UNKNOWN_SHOP_LABEL = "ไม่ระบุร้าน";

// Platforms report the same real-world courier under several different
// labels (bulky-item variants, country suffixes, etc.) — normalize them to
// one display name so "Flash Express Bulky" and "Flash Express Thailand"
// don't split into separate packing groups for what's really one courier.
const CARRIER_NORMALIZATION: { pattern: RegExp; label: string }[] = [
  { pattern: /flash/i, label: "Flash Express" },
  { pattern: /best/i, label: "BEST Express" },
];

function normalizeCarrierName(raw: string): string {
  const match = CARRIER_NORMALIZATION.find((rule) => rule.pattern.test(raw));
  return match ? match.label : raw;
}

// Orders that never reach the warehouse floor shouldn't show up on a
// packing list.
const EXCLUDED_STATUSES: OrderStatus[] = [OrderStatus.CANCELLED, OrderStatus.REFUND_REQUESTED, OrderStatus.RETURNED];

// Only these statuses are eligible for the "still hasn't been printed, so
// keep rolling it forward" fallback below — an order already SHIPPED or
// DELIVERED is obviously not waiting to be packed anymore, even if this
// system never happened to record its printedAt (older/imported data that
// picked up a status update without a tracking number attached). Without
// this, such an order's printedAt stays null forever, so it re-qualifies
// for "today's still-pending backlog" on every single day going forward —
// this is exactly the bug that was inflating the pending count with
// already-fulfilled orders.
const NEEDS_SHIPPING_STATUSES: OrderStatus[] = [OrderStatus.NEW, OrderStatus.PENDING_SHIPMENT, OrderStatus.PROBLEM];

/** One row per order-item — deliberately NOT merged across orders even when
 * two orders share the same SKU/carrier/shop, since each is a distinct
 * customer order with its own tracking number and shipped/pending state
 * (merging them previously made an already-printed order mask a still-
 * unprinted one sharing its SKU, and also made the LINE packing message
 * combine separate customers' items into one deceptive "SKU x N" line — see
 * groupLinesForDisplay/aggregateGroupLines in shippingSummaryDisplay.ts for
 * the one legitimate merge case, orders sharing a single tracking number). */
export interface ShippingSummarySkuLine {
  orderId: string;
  platformOrderId: string;
  platform: Platform;
  shop: string;
  /** Display name — the platform's own SKU unless overridden by a SkuAlias
   * (see skuAlias.ts), in which case every other field derived from this
   * line (checklist keys, LINE text, Excel export) uses that alias too. */
  sku: string;
  /** The platform's own SKU, untouched by any alias — what a SkuAlias edit
   * actually keys off, regardless of what `sku` currently displays as. */
  rawSku: string;
  productName: string;
  quantity: number;
  /** Units within `quantity` that came from orders placed during the Monday
   * 08:30-16:30 twist-tie-tool promo window (see isMondayPromoWindow). */
  promoQuantity: number;
  trackingNumber: string | null;
  /** True when this line is a platform-provided "แถมลวดมัด" freebie item
   * that duplicates the auto-added tie-wire note already on a sibling SS/HJ
   * line in the same order (see shippingSummaryDisplay.ts). Left in for the
   * web page, which still lists every real order item separately — only the
   * LINE/Excel summaries (which already show the note inline) filter these
   * out to avoid double-counting the same physical roll. */
  isRedundantTieWireFreebie: boolean;
}

export interface ShippingSummaryCarrierGroup {
  carrier: string;
  orderCount: number;
  totalItems: number;
  lines: ShippingSummarySkuLine[];
}

export interface ShippingSummaryResult {
  window: ShippingCutoffWindow;
  totalOrders: number;
  carriers: ShippingSummaryCarrierGroup[];
  /** Orders that would otherwise have landed in this window/status bucket
   * but are still awaiting payment (see Order.isUnpaid) — excluded from the
   * packing list entirely since nothing ships before it's paid for, but
   * counted here so the page can say why they're missing instead of just
   * silently dropping them. */
  unpaidExcludedCount: number;
}

export async function getShippingSummary(window: ShippingCutoffWindow): Promise<ShippingSummaryResult> {
  // Orders are bucketed by when they were actually PRINTED (tracking number
  // first assigned — see printedAt in sync.ts), not by order date: a
  // packing list only reflects orders once they have a label, and whichever
  // day that happens on is the day they belong to. An order with no
  // tracking number yet has no printedAt, and — only while `window` is the
  // current (still-open) window — still counts as pending for "today" so it
  // keeps rolling forward instead of vanishing, until it finally gets one.
  const now = new Date();
  const isCurrentWindow = now >= window.from && now < window.to;
  const windowOr = [
    { printedAt: { gte: window.from, lt: window.to } },
    ...(isCurrentWindow ? [{ printedAt: null, status: { in: NEEDS_SHIPPING_STATUSES } }] : []),
  ];

  const [orders, unpaidExcludedCount, skuAliases] = await Promise.all([
    prisma.order.findMany({
      where: { status: { notIn: EXCLUDED_STATUSES }, isUnpaid: false, OR: windowOr },
      include: { items: true },
    }),
    prisma.order.count({
      where: { status: { notIn: EXCLUDED_STATUSES }, isUnpaid: true, OR: windowOr },
    }),
    getSkuAliasMap(),
  ]);

  const byCarrier = new Map<string, { orderIds: Set<string>; lines: ShippingSummarySkuLine[] }>();

  for (const order of orders) {
    const carrier = order.shippingCarrier?.trim() ? normalizeCarrierName(order.shippingCarrier.trim()) : UNKNOWN_CARRIER_LABEL;
    const shop = order.shopName?.trim() || UNKNOWN_SHOP_LABEL;
    if (!byCarrier.has(carrier)) byCarrier.set(carrier, { orderIds: new Set(), lines: [] });
    const group = byCarrier.get(carrier)!;
    group.orderIds.add(order.id);
    const isPromoOrder = isMondayPromoWindow(order.orderDate);
    const hasQualifyingTieWireSku = order.items.some((i) => FREEBIE_TIE_WIRE_PREFIXES.some((prefix) => i.sku.startsWith(prefix)));
    for (const item of order.items) {
      // The SS/HJ product's own title routinely mentions "แถมลวดมัด" itself
      // (marketing copy describing what's bundled with THAT product) — only
      // a DIFFERENT item that isn't itself an SS/HJ line can be the
      // redundant duplicate being detected here, or a single-item order
      // consisting of just the SS/HJ product would wrongly filter out its
      // only line entirely (see isPlatformProvidedTieWireFreebie above).
      const isTieWireSkuItself = FREEBIE_TIE_WIRE_PREFIXES.some((prefix) => item.sku.startsWith(prefix));
      group.lines.push({
        orderId: order.id,
        platformOrderId: order.platformOrderId,
        platform: order.platform,
        shop,
        sku: resolveDisplaySku(skuAliases, item.sku),
        rawSku: item.sku,
        productName: item.productName,
        quantity: item.quantity,
        promoQuantity: isPromoOrder ? item.quantity : 0,
        trackingNumber: order.trackingNumber,
        isRedundantTieWireFreebie: hasQualifyingTieWireSku && !isTieWireSkuItself && isPlatformProvidedTieWireFreebie(item.productName),
      });
    }
  }

  const carriers: ShippingSummaryCarrierGroup[] = Array.from(byCarrier.entries())
    .map(([carrier, group]) => {
      const lines = group.lines.sort((a, b) => a.shop.localeCompare(b.shop) || a.sku.localeCompare(b.sku) || a.platformOrderId.localeCompare(b.platformOrderId));
      return {
        carrier,
        orderCount: group.orderIds.size,
        totalItems: lines.reduce((sum, l) => sum + l.quantity, 0),
        lines,
      };
    })
    .sort((a, b) => b.orderCount - a.orderCount);

  return { window, totalOrders: orders.length, carriers, unpaidExcludedCount };
}

/** Identifies one order's product line for the "remove this item" pickers
 * on the LINE/Excel preview screens (a customer cancelling just one item in
 * an otherwise-still-shipping order) — keyed off the untouched platform SKU
 * (rawSku), not the display sku, so a SkuAlias rename never changes what a
 * previously-picked exclusion matches. */
export function shippingLineItemKey(orderId: string, rawSku: string): string {
  return `${orderId}|${rawSku}`;
}

/** Drops excluded lines from every carrier (see shippingLineItemKey) and
 * recomputes each carrier's aggregate counts to match, dropping a carrier
 * entirely once nothing is left in it — used right before building the
 * LINE messages or Excel rows a staff member actually confirmed after
 * reviewing the preview, so an excluded item never sneaks back in. */
export function excludeShippingSummaryLines(
  carriers: ShippingSummaryCarrierGroup[],
  excludedKeys: ReadonlySet<string>
): ShippingSummaryCarrierGroup[] {
  if (excludedKeys.size === 0) return carriers;
  return carriers
    .map((group) => {
      const lines = group.lines.filter((line) => !excludedKeys.has(shippingLineItemKey(line.orderId, line.rawSku)));
      return { carrier: group.carrier, orderCount: new Set(lines.map((l) => l.orderId)).size, totalItems: lines.reduce((n, l) => n + l.quantity, 0), lines };
    })
    .filter((group) => group.lines.length > 0);
}
