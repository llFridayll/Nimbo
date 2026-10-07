import "server-only";
import { Platform, Prisma } from "@prisma/client";
import { prisma } from "./db";
import type { CancellationBreakdownRow } from "./cancellationStats";
import { brandForShopName, shopNamesForKey } from "./shops";

const TOP_REASONS = 8;
const RECENT_LIMIT = 50;

export interface ReturnFilter {
  fromDate: Date;
  toDate: Date;
  platform?: Platform;
  /** A key from SHOP_BRANDS, or a raw shopName for a shop not listed there. */
  shop?: string;
}

export interface ReturnStats {
  returnCount: number;
  /** What the platforms actually refunded — not the orders' original value,
   * which a partial return would overstate. */
  refundTotal: number;
  /** Orders placed in the same window, as the denominator for the rate. */
  totalOrders: number;
  returnRate: number;
  byReason: CancellationBreakdownRow[];
  byShop: CancellationBreakdownRow[];
  byPlatform: CancellationBreakdownRow[];
  recent: {
    id: string;
    platformOrderId: string;
    platform: Platform;
    shopName: string | null;
    totalAmount: number;
    refundAmount: number | null;
    orderDate: Date;
    returnedAt: Date | null;
    returnReason: string | null;
  }[];
}

/** Rows are ranked by count, and the "amount" column shows money REFUNDED
 * rather than the order total — a return's cost to the shop is what went
 * back out, which is the number this report exists to show. */
function toRows(
  raw: { key: string | null; count: number; amount: number }[],
  total: number,
  labelFor: (key: string | null) => string,
): CancellationBreakdownRow[] {
  return raw
    .map((r) => ({
      key: r.key ?? "UNKNOWN",
      label: labelFor(r.key),
      count: r.count,
      amount: r.amount,
      share: total > 0 ? (r.count / total) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);
}

function shopCondition(shop: string | undefined): Prisma.OrderWhereInput {
  if (!shop) return {};
  const names = shopNamesForKey(shop);
  return { shopName: names ? { in: names } : shop };
}

export async function getReturnStats(filter: ReturnFilter): Promise<ReturnStats> {
  // Windowed on returnedAt, not orderDate: a return is the event being
  // reported, and an order bought in March and returned in June belongs in
  // June. (The cancellations report has to key on orderDate instead, because
  // Shopee and Lazada don't give a cancellation timestamp at all.)
  const returnedWhere: Prisma.OrderWhereInput = {
    returnedAt: { gte: filter.fromDate, lte: filter.toDate },
    ...(filter.platform ? { platform: filter.platform } : {}),
    ...shopCondition(filter.shop),
  };
  const totalWhere: Prisma.OrderWhereInput = {
    orderDate: { gte: filter.fromDate, lte: filter.toDate },
    ...(filter.platform ? { platform: filter.platform } : {}),
    ...shopCondition(filter.shop),
  };

  const [totals, totalOrders, reasonGroups, shopGroups, platformGroups, recent] = await Promise.all([
    prisma.order.aggregate({ where: returnedWhere, _count: { _all: true }, _sum: { refundAmount: true } }),
    prisma.order.count({ where: totalWhere }),
    prisma.order.groupBy({ by: ["returnReason"], where: returnedWhere, _count: { _all: true }, _sum: { refundAmount: true } }),
    prisma.order.groupBy({ by: ["shopName"], where: returnedWhere, _count: { _all: true }, _sum: { refundAmount: true } }),
    prisma.order.groupBy({ by: ["platform"], where: returnedWhere, _count: { _all: true }, _sum: { refundAmount: true } }),
    prisma.order.findMany({
      where: returnedWhere,
      orderBy: { returnedAt: "desc" },
      take: RECENT_LIMIT,
      select: {
        id: true,
        platformOrderId: true,
        platform: true,
        shopName: true,
        totalAmount: true,
        refundAmount: true,
        orderDate: true,
        returnedAt: true,
        returnReason: true,
      },
    }),
  ]);

  const returnCount = totals._count._all;

  const allReasons = toRows(
    reasonGroups.map((g) => ({ key: g.returnReason, count: g._count._all, amount: g._sum.refundAmount ?? 0 })),
    returnCount,
    (k) => k ?? "ไม่ระบุ",
  );
  const head = allReasons.slice(0, TOP_REASONS);
  const tail = allReasons.slice(TOP_REASONS);
  const byReason = tail.length
    ? [
        ...head,
        {
          key: "OTHER",
          label: `อื่นๆ (${tail.length} เหตุผล)`,
          count: tail.reduce((s, r) => s + r.count, 0),
          amount: tail.reduce((s, r) => s + r.amount, 0),
          share: tail.reduce((s, r) => s + r.share, 0),
        },
      ]
    : head;

  // Folded in JS for the same reason as the cancellations report: one shop is
  // several different shopName strings across platforms (see shops.ts).
  const byShopTotals = new Map<string, { label: string; count: number; amount: number }>();
  for (const g of shopGroups) {
    const brand = brandForShopName(g.shopName);
    const entry = byShopTotals.get(brand.key) ?? { label: brand.label, count: 0, amount: 0 };
    entry.count += g._count._all;
    entry.amount += g._sum.refundAmount ?? 0;
    byShopTotals.set(brand.key, entry);
  }
  const byShop = toRows(
    [...byShopTotals].map(([key, v]) => ({ key, count: v.count, amount: v.amount })),
    returnCount,
    (k) => byShopTotals.get(k ?? "")?.label ?? "ไม่ระบุ",
  );

  const byPlatform = toRows(
    platformGroups.map((g) => ({ key: g.platform, count: g._count._all, amount: g._sum.refundAmount ?? 0 })),
    returnCount,
    (k) => k ?? "ไม่ระบุ",
  );

  return {
    returnCount,
    refundTotal: totals._sum.refundAmount ?? 0,
    totalOrders,
    returnRate: totalOrders > 0 ? (returnCount / totalOrders) * 100 : 0,
    byReason,
    byShop,
    byPlatform,
    recent,
  };
}
