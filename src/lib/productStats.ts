import { Platform, Prisma } from "@prisma/client";
import { prisma } from "./db";
import { currentShippingCutoffWindow } from "./dateUtils";
import { NEEDS_SHIPPING_STATUSES, shippingWindowWhere } from "./shippingSummary";
import { getSkuAliasMap, resolveDisplaySku } from "./skuAlias";

export interface ProductSummary {
  sku: string;
  /** The name set for this SKU on the packing list (SkuAlias), or null when
   * it still shows the platform's own SKU. */
  displaySku: string | null;
  productName: string;
  imageUrl: string | null;
  platforms: Platform[];
  totalQuantitySold: number;
  minPrice: number;
  maxPrice: number;
  lastPrice: number;
  lastSoldAt: Date;
}

/** One row per SKU regardless of how many platforms sold it; `platforms`
 * lists which channels carried it.
 *
 * Grouped by Postgres rather than in JS. The previous version pulled every
 * matching OrderItem row (all 7,778 of them, joined to their order) and
 * folded them into a Map client-side — 2627ms against the live database,
 * versus 513ms for this query, because the unfiltered page shipped the whole
 * item table over the wire just to produce ~200 summary rows. The portability
 * argument for doing it in JS no longer applies: the SQLite provider is gone
 * (see the datasource comment in prisma/schema.prisma).
 *
 * `LIKE` (not `ILIKE`) keeps the previous `contains:` semantics exactly —
 * Prisma's `contains` without `mode: "insensitive"` is case-sensitive on
 * Postgres, and likewise does not escape % or _ in the search term. */
export type ProductSort = "quantity" | "recent";

export async function listProductSummaries({
  q,
  platform,
  sort = "quantity",
}: {
  q?: string;
  platform?: Platform;
  /** "quantity": best sellers first (the page's default). "recent": most
   * recently sold first. */
  sort?: ProductSort;
}): Promise<ProductSummary[]> {
  const aliases = await getSkuAliasMap();
  // Searching for a name set on the packing list should find the platform
  // SKUs behind it too — that name is what staff now call the product.
  const aliasMatches = q ? [...aliases].filter(([, display]) => display.includes(q)).map(([raw]) => raw) : [];

  const conditions: Prisma.Sql[] = [];
  if (q) {
    conditions.push(
      aliasMatches.length > 0
        ? Prisma.sql`(i."sku" LIKE ${`%${q}%`} OR i."productName" LIKE ${`%${q}%`} OR i."sku" IN (${Prisma.join(aliasMatches)}))`
        : Prisma.sql`(i."sku" LIKE ${`%${q}%`} OR i."productName" LIKE ${`%${q}%`})`,
    );
  }
  if (platform) conditions.push(Prisma.sql`o."platform" = ${platform}::"Platform"`);
  const where = conditions.length > 0 ? Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}` : Prisma.empty;

  const rows = await prisma.$queryRaw<
    {
      sku: string;
      productName: string;
      imageUrl: string | null;
      platforms: string[];
      totalQuantitySold: number;
      minPrice: number;
      maxPrice: number;
      lastPrice: number;
      lastSoldAt: Date;
    }[]
  >`
    WITH filtered AS (
      SELECT i."sku", i."productName", i."imageUrl", i."unitPrice", i."quantity",
             o."orderDate", o."platform"
      FROM "OrderItem" i
      JOIN "Order" o ON o."id" = i."orderId"
      ${where}
    ),
    aggregated AS (
      SELECT "sku",
             SUM("quantity")::int            AS "totalQuantitySold",
             MIN("unitPrice")                AS "minPrice",
             MAX("unitPrice")                AS "maxPrice",
             MAX("orderDate")                AS "lastSoldAt",
             ARRAY_AGG(DISTINCT "platform"::text) AS "platforms"
      FROM filtered
      GROUP BY "sku"
    ),
    -- Name, image and price all come from the most recent sale of the SKU,
    -- matching what the JS version did. DISTINCT ON additionally makes ties
    -- deterministic, which the old "first row wins" loop was not.
    most_recent AS (
      SELECT DISTINCT ON ("sku")
             "sku", "productName", "imageUrl", "unitPrice" AS "lastPrice"
      FROM filtered
      ORDER BY "sku", "orderDate" DESC, "unitPrice" DESC
    )
    SELECT a."sku", m."productName", m."imageUrl", a."platforms",
           a."totalQuantitySold", a."minPrice", a."maxPrice", m."lastPrice", a."lastSoldAt"
    FROM aggregated a
    JOIN most_recent m ON m."sku" = a."sku"
    ORDER BY ${sort === "recent" ? Prisma.sql`a."lastSoldAt" DESC` : Prisma.sql`a."totalQuantitySold" DESC, a."lastSoldAt" DESC`}
  `;

  return rows.map((row) => ({ ...row, displaySku: aliases.get(row.sku) ?? null, platforms: row.platforms as Platform[] }));
}

export interface PendingShipmentProduct {
  sku: string;
  productName: string;
  imageUrl: string | null;
  totalQuantity: number;
  orderCount: number;
}

/** Packing-list view for the dashboard's "products awaiting shipment" panel —
 * the items on today's packing list (/orders/shipping-summary, which the
 * panel links to) whose order hasn't left yet, summed by display SKU so a
 * product sold under two platform SKUs counts once. Not every
 * PENDING_SHIPMENT order: Shopee and Lazada statuses only move on a file
 * import, so that also counted long-gone parcels and never matched the
 * packing list. */
export async function getPendingShipmentProducts(now: Date = new Date()): Promise<PendingShipmentProduct[]> {
  const [items, aliases] = await Promise.all([
    prisma.orderItem.findMany({
      where: {
        order: {
          AND: [shippingWindowWhere(currentShippingCutoffWindow(now), { now }), { status: { in: NEEDS_SHIPPING_STATUSES } }],
        },
      },
      select: { sku: true, productName: true, quantity: true, imageUrl: true, orderId: true },
    }),
    getSkuAliasMap(),
  ]);

  const bySku = new Map<string, PendingShipmentProduct & { orderIds: Set<string> }>();
  for (const raw of items) {
    const item = { ...raw, sku: resolveDisplaySku(aliases, raw.sku) };
    const existing = bySku.get(item.sku);
    if (!existing) {
      bySku.set(item.sku, {
        sku: item.sku,
        productName: item.productName,
        imageUrl: item.imageUrl,
        totalQuantity: item.quantity,
        orderCount: 0,
        orderIds: new Set([item.orderId]),
      });
      continue;
    }
    existing.totalQuantity += item.quantity;
    existing.orderIds.add(item.orderId);
  }

  return [...bySku.values()]
    .map((p) => ({ sku: p.sku, productName: p.productName, imageUrl: p.imageUrl, totalQuantity: p.totalQuantity, orderCount: p.orderIds.size }))
    .sort((a, b) => b.totalQuantity - a.totalQuantity);
}

export interface PricePoint {
  orderDate: Date;
  unitPrice: number;
  /** Price before discount for this line, when the platform tells us
   * (currently TikTok only — pulled from the order's stored rawPayload).
   * Null when unavailable, e.g. Shopee/Lazada mock orders. */
  originalUnitPrice: number | null;
  quantity: number;
  platform: Platform;
  orderId: string;
  platformOrderId: string;
  productName: string;
}

interface TikTokRawLineItem {
  seller_sku?: string;
  sku_id?: string;
  original_price?: string;
}

/** Finds this SKU's per-unit original price inside a TikTok order's raw
 * payload — mirrors the grouping in discountInfo.ts since TikTok's API
 * returns one line_item row per physical unit, not per SKU. */
function findTikTokOriginalUnitPrice(rawPayload: unknown, sku: string): number | null {
  const lineItems = (rawPayload as { line_items?: TikTokRawLineItem[] } | null)?.line_items;
  if (!lineItems?.length) return null;
  const matches = lineItems.filter((li) => (li.seller_sku || li.sku_id) === sku);
  if (matches.length === 0) return null;
  const total = matches.reduce((sum, li) => sum + Number(li.original_price ?? 0), 0);
  return total / matches.length;
}

/** Every sale of one exact SKU, oldest first — the raw material for both the
 * price-over-time chart and the transaction table on the product page. */
export async function getProductPriceHistory(sku: string): Promise<PricePoint[]> {
  const items = await prisma.orderItem.findMany({
    where: { sku },
    select: {
      unitPrice: true,
      quantity: true,
      productName: true,
      order: { select: { id: true, orderDate: true, platform: true, platformOrderId: true, rawPayload: true } },
    },
    orderBy: { order: { orderDate: "asc" } },
  });

  return items.map((item) => ({
    orderDate: item.order.orderDate,
    unitPrice: item.unitPrice,
    originalUnitPrice: item.order.platform === Platform.TIKTOK ? findTikTokOriginalUnitPrice(item.order.rawPayload, sku) : null,
    quantity: item.quantity,
    platform: item.order.platform,
    orderId: item.order.id,
    platformOrderId: item.order.platformOrderId,
    productName: item.productName,
  }));
}
