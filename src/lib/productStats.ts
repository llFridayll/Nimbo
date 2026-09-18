import { OrderStatus, Platform } from "@prisma/client";
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

/** Aggregates OrderItem rows by SKU (in JS — the dataset is small enough that
 * this is simpler and more portable across SQLite/Postgres than a raw SQL
 * group-by joining through Order). One row per SKU regardless of how many
 * platforms sold it; `platforms` lists which channels carried it. */
export async function listProductSummaries({ q, platform }: { q?: string; platform?: Platform }): Promise<ProductSummary[]> {
  const items = await prisma.orderItem.findMany({
    where: {
      ...(q ? { OR: [{ sku: { contains: q } }, { productName: { contains: q } }] } : {}),
      ...(platform ? { order: { platform } } : {}),
    },
    select: {
      sku: true,
      productName: true,
      unitPrice: true,
      quantity: true,
      imageUrl: true,
      order: { select: { orderDate: true, platform: true } },
    },
  });

  const bySku = new Map<string, ProductSummary>();
  for (const item of items) {
    const existing = bySku.get(item.sku);
    if (!existing) {
      bySku.set(item.sku, {
        sku: item.sku,
        productName: item.productName,
        imageUrl: item.imageUrl,
        platforms: [item.order.platform],
        totalQuantitySold: item.quantity,
        minPrice: item.unitPrice,
        maxPrice: item.unitPrice,
        lastPrice: item.unitPrice,
        lastSoldAt: item.order.orderDate,
      });
      continue;
    }
    existing.totalQuantitySold += item.quantity;
    existing.minPrice = Math.min(existing.minPrice, item.unitPrice);
    existing.maxPrice = Math.max(existing.maxPrice, item.unitPrice);
    if (!existing.platforms.includes(item.order.platform)) existing.platforms.push(item.order.platform);
    if (item.order.orderDate > existing.lastSoldAt) {
      existing.lastSoldAt = item.order.orderDate;
      existing.lastPrice = item.unitPrice;
      existing.productName = item.productName; // keep the most recent product name/image
      existing.imageUrl = item.imageUrl;
    }
  }

  return [...bySku.values()].sort((a, b) => b.lastSoldAt.getTime() - a.lastSoldAt.getTime());
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
