import { OrderStatus, Platform, Prisma } from "@prisma/client";
import { prisma } from "./db";

export interface ProductSummary {
  sku: string;
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
export async function listProductSummaries({ q, platform }: { q?: string; platform?: Platform }): Promise<ProductSummary[]> {
  const conditions: Prisma.Sql[] = [];
  if (q) conditions.push(Prisma.sql`(i."sku" LIKE ${`%${q}%`} OR i."productName" LIKE ${`%${q}%`})`);
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
    ORDER BY a."lastSoldAt" DESC
  `;

  return rows.map((row) => ({ ...row, platforms: row.platforms as Platform[] }));
}

export interface PendingShipmentProduct {
  sku: string;
  productName: string;
  imageUrl: string | null;
  totalQuantity: number;
  orderCount: number;
}

/** Packing-list view for the dashboard's "products awaiting shipment" panel —
 * every OrderItem belonging to a still-PENDING_SHIPMENT order, summed by SKU,
 * so warehouse staff see "how many of each item to pack" rather than a raw
 * order list. Same JS-side group-by approach as listProductSummaries above. */
export async function getPendingShipmentProducts(): Promise<PendingShipmentProduct[]> {
  const items = await prisma.orderItem.findMany({
    where: { order: { status: OrderStatus.PENDING_SHIPMENT } },
    select: { sku: true, productName: true, quantity: true, imageUrl: true, orderId: true },
  });

  const bySku = new Map<string, PendingShipmentProduct & { orderIds: Set<string> }>();
  for (const item of items) {
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
