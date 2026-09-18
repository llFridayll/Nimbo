import { OrderStatus, Platform } from "@prisma/client";
import { prisma } from "./db";

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

/** YYYY-MM-DD for the given instant, as a calendar date in Asia/Bangkok. */
function bangkokDateKey(d: Date): string {
  const bangkok = new Date(d.getTime() + BANGKOK_OFFSET_MS);
  return bangkok.toISOString().slice(0, 10);
}

export interface ProductQuantity {
  sku: string;
  productName: string;
  quantity: number;
}

export interface DailySalesPoint {
  date: string; // YYYY-MM-DD, Bangkok calendar day
  orderCount: number;
  revenue: number;
  /** Orders cancelled/refund-requested/returned that day — tracked
   * separately so the chart can show them as a downward bar alongside the
   * (already net-of-these) sales bar. */
  cancelledCount: number;
  cancelledAmount: number;
  /** What sold that day, most-sold first — lets the chart show a product
   * breakdown when a bar is clicked. Excludes items from cancelled/refunded/
   * returned orders, same as revenue. */
  products: ProductQuantity[];
}

export interface SalesStats {
  points: DailySalesPoint[];
  totalOrders: number;
  totalRevenue: number;
  cancelledOrRefunded: number;
}

/** Orders excluded from revenue since they never actually completed a sale —
 * still counted separately so a "cancelled/refunded" figure can be shown. */
const NON_REVENUE_STATUSES: OrderStatus[] = [OrderStatus.CANCELLED, OrderStatus.REFUND_REQUESTED, OrderStatus.RETURNED];

/** Builds one point per calendar day between fromDate and toDate (inclusive),
 * even for days with zero orders, so the chart's x-axis has no gaps. */
export async function getDailySales({
  fromDate,
  toDate,
  platform,
  shopId,
  status,
}: {
  fromDate: Date;
  toDate: Date;
  platform?: Platform;
  /** Restrict to one specific store — e.g. one of several TikTok Shop shops
   * under the same account. Orders synced before multi-shop support existed
   * have no shopId and won't match any value here. */
  shopId?: string;
  status?: OrderStatus;
}): Promise<SalesStats> {
  const orders = await prisma.order.findMany({
    where: {
      orderDate: { gte: fromDate, lte: toDate },
      ...(platform ? { platform } : {}),
      ...(shopId ? { shopId } : {}),
      ...(status ? { status } : {}),
    },
    select: {
      orderDate: true,
      totalAmount: true,
      status: true,
      items: { select: { sku: true, productName: true, quantity: true } },
    },
  });

  const byDay = new Map<
    string,
    { orderCount: number; revenue: number; cancelledCount: number; cancelledAmount: number; products: Map<string, ProductQuantity> }
  >();
  let totalRevenue = 0;
  let cancelledOrRefunded = 0;

  for (const order of orders) {
    const key = bangkokDateKey(order.orderDate);
    const entry =
      byDay.get(key) ?? { orderCount: 0, revenue: 0, cancelledCount: 0, cancelledAmount: 0, products: new Map<string, ProductQuantity>() };
    entry.orderCount += 1;
    if (NON_REVENUE_STATUSES.includes(order.status)) {
      cancelledOrRefunded += 1;
      entry.cancelledCount += 1;
      entry.cancelledAmount += order.totalAmount;
    } else {
      entry.revenue += order.totalAmount;
      totalRevenue += order.totalAmount;
      for (const item of order.items) {
        const existing = entry.products.get(item.sku);
        if (existing) existing.quantity += item.quantity;
        else entry.products.set(item.sku, { sku: item.sku, productName: item.productName, quantity: item.quantity });
      }
    }
    byDay.set(key, entry);
  }

  const points: DailySalesPoint[] = [];
  const cursor = new Date(fromDate);
  while (bangkokDateKey(cursor) <= bangkokDateKey(toDate)) {
    const key = bangkokDateKey(cursor);
    const entry =
      byDay.get(key) ?? { orderCount: 0, revenue: 0, cancelledCount: 0, cancelledAmount: 0, products: new Map<string, ProductQuantity>() };
    const products = [...entry.products.values()].sort((a, b) => b.quantity - a.quantity);
    points.push({
      date: key,
      orderCount: entry.orderCount,
      revenue: entry.revenue,
      cancelledCount: entry.cancelledCount,
      cancelledAmount: entry.cancelledAmount,
      products,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return { points, totalOrders: orders.length, totalRevenue, cancelledOrRefunded };
}
