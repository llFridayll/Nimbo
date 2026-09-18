import type { Platform } from "@prisma/client";
import type { ShippingSummarySkuLine } from "@/lib/shippingSummary";

// Fence-mesh products in these SKU prefixes ship with a complimentary tie-wire
// pack (1 kg per roll sold) that has no SKU of its own in the order data —
// noted inline so packers remember to grab it too. Shared by both the LINE
// summary text (line.ts) and the packing-slip Excel export.
export const FREEBIE_TIE_WIRE_PREFIXES = ["SS", "HJ"];
export const FREEBIE_TIE_WIRE_LABEL = "ลวดมัด 1.8 มม. (1 กก.)";

// Monday-only promo (08:30-16:30, see isMondayPromoWindow): the same SS/HJ
// products also get a free twist-tie tool for whichever units were ordered
// in that window — promoQuantity may be less than the line's total quantity.
export const MONDAY_PROMO_TOOL_LABEL = "อุปกรณ์พันเกลียว";

// TikTok (and possibly other platforms) sometimes add the tie-wire freebie
// as a genuine, separate order item during a live-selling promo — e.g.
// "โปรเฉพาะไลฟ์สด แถมลวดมัด 1.80 mm. น้ำหนัก 1 กก." — instead of leaving it
// implicit. Showing that AND the auto-added note above on the paired SS/HJ
// line double-counts the same physical roll in the LINE/Excel summaries
// (see filterRedundantTieWireFreebies below) — though the web page still
// lists it, since it's a real order item.
export function isPlatformProvidedTieWireFreebie(productName: string): boolean {
  return productName.includes("แถม") && productName.includes("ลวดมัด");
}

/** Drops lines flagged isRedundantTieWireFreebie (see shippingSummary.ts) —
 * apply this before aggregating for a LINE message or the Excel export, but
 * NOT for the web page, which lists every real order item separately. */
export function filterRedundantTieWireFreebies(lines: ShippingSummarySkuLine[]): ShippingSummarySkuLine[] {
  return lines.filter((line) => !line.isRedundantTieWireFreebie);
}

/** "SKU x2 , ลวดมัด 1.8 มม. (1 กก.) x2" style summary text — the freebie/promo
 * add-ons a packer needs to know about, with no leading bullet/prefix so both
 * the LINE message (which adds "- ") and the Excel slip (which doesn't) can
 * build on the same text. */
export function formatSkuSummaryText(sku: string, quantity: number, promoQuantity: number): string {
  const needsTieWire = FREEBIE_TIE_WIRE_PREFIXES.some((prefix) => sku.startsWith(prefix));
  let text = `${sku} x${quantity}`;
  if (needsTieWire) {
    text += ` , ${FREEBIE_TIE_WIRE_LABEL} x${quantity}`;
    if (promoQuantity > 0) text += ` , ${MONDAY_PROMO_TOOL_LABEL} x${promoQuantity}`;
  }
  return text;
}

// Reminder for the packer (LINE message + Excel packing slip): a real
// product (a roll of fencing mesh, say) should get its bundled freebie tied
// onto it as one bundle before it goes in the box. Loose tie-wire/twist-tool
// products sold on their own have nothing to bundle onto, so they're
// excluded — same rawSku prefix guard as isPlatformProvidedTieWireFreebie's
// callers use, so a fencing product's own title mentioning "ลวดมัด" (its
// bundled freebie) never gets mistaken for one of these.
const WIRE_OR_TOOL_KEYWORDS = ["ลวดมัด", "พันเกลียว", "พันลวด"];
export const BUNDLE_TOGETHER_LABEL = " (มัดรวมกัน)";

export function isWireOrToolProduct(rawSku: string, productName: string): boolean {
  if (FREEBIE_TIE_WIRE_PREFIXES.some((prefix) => rawSku.startsWith(prefix))) return false;
  return WIRE_OR_TOOL_KEYWORDS.some((kw) => productName.includes(kw));
}

/** True when this one row's own quantity already carries more than one
 * physical item — a real product plus its automatic tie-wire/promo-tool
 * freebie — so THIS row's own text needs the "tie these together" note. This
 * fires independently of countRealProductRows/buildGroupBundleNote below —
 * a row can need its own note (tying its freebie to it) AND the shipment as
 * a whole can also need the group note (tying multiple products together),
 * at the same time. Standalone wire/tool rows (sold as their own order
 * line, isWireOrToolProduct) never get this — they're what other rows get
 * tied to, not a bundle in their own right. */
export function needsOwnFreebieTie(rawSku: string, productName: string, promoQuantity: number): boolean {
  if (isWireOrToolProduct(rawSku, productName)) return false;
  return FREEBIE_TIE_WIRE_PREFIXES.some((prefix) => rawSku.startsWith(prefix)) || promoQuantity > 0;
}

/** How many distinct real products (excluding standalone wire/tool rows —
 * see isWireOrToolProduct) go into one shipment (one order, or several
 * merged onto one tracking number). More than one means they all need tying
 * into a single box, reported once for the whole shipment via
 * buildGroupBundleNote — on top of, not instead of, any per-row
 * needsOwnFreebieTie note on the rows themselves. */
export function countRealProductRows(rows: { productName: string; sourceLines: { rawSku: string }[] }[]): number {
  return rows.filter((r) => !isWireOrToolProduct(r.sourceLines[0].rawSku, r.productName)).length;
}

/** The shipment-level note text, e.g. "(มัดรวมกัน 3 ชิ้น)" — only meaningful
 * when countRealProductRows(rows) > 1. */
export function buildGroupBundleNote(realProductCount: number): string {
  return `(มัดรวมกัน ${realProductCount} ชิ้น)`;
}

// Orders that share the same tracking number were packed into the same
// physical shipment (two orders for the same product, printed onto one
// label) — those get merged into a single display row listing every order
// number together, instead of one row each. An order with no tracking
// number yet has nothing to key a merge on, so it stays its own row until it
// does. Shared by the shipping-summary page and the packing-slip Excel
// export so both agree on what counts as "one row".
export interface MergeGroup {
  orderIds: string[];
  platformOrderIds: string[];
  shop: string;
  platform: Platform;
  trackingNumber: string | null;
  lines: ShippingSummarySkuLine[];
}

export function groupLinesForDisplay(lines: ShippingSummarySkuLine[]): MergeGroup[] {
  const map = new Map<string, MergeGroup>();
  for (const line of lines) {
    const key = line.trackingNumber ? `trk:${line.trackingNumber}` : `order:${line.orderId}`;
    let group = map.get(key);
    if (!group) {
      group = { orderIds: [], platformOrderIds: [], shop: line.shop, platform: line.platform, trackingNumber: line.trackingNumber, lines: [] };
      map.set(key, group);
    }
    if (!group.orderIds.includes(line.orderId)) {
      group.orderIds.push(line.orderId);
      group.platformOrderIds.push(line.platformOrderId);
    }
    group.lines.push(line);
  }
  return Array.from(map.values()).sort((a, b) => a.shop.localeCompare(b.shop) || a.platformOrderIds[0].localeCompare(b.platformOrderIds[0]));
}

export interface DisplaySkuRow {
  sku: string;
  productName: string;
  quantity: number;
  promoQuantity: number;
  sourceLines: ShippingSummarySkuLine[];
}

// Two merged orders can carry the same SKU (exactly the "same product, same
// tracking number" case) — sum those into one quantity instead of two
// identical-looking rows.
export function aggregateGroupLines(lines: ShippingSummarySkuLine[]): DisplaySkuRow[] {
  const bySku = new Map<string, DisplaySkuRow>();
  for (const line of lines) {
    const existing = bySku.get(line.sku);
    if (existing) {
      existing.quantity += line.quantity;
      existing.promoQuantity += line.promoQuantity;
      existing.sourceLines.push(line);
    } else {
      bySku.set(line.sku, { sku: line.sku, productName: line.productName, quantity: line.quantity, promoQuantity: line.promoQuantity, sourceLines: [line] });
    }
  }
  return Array.from(bySku.values());
}
