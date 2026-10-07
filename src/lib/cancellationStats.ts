import "server-only";
import { OrderStatus, Platform, Prisma } from "@prisma/client";
import { prisma } from "./db";
import { brandForShopName, shopNamesForKey } from "./shops";

/** How many reasons the breakdown lists before folding the rest into "อื่นๆ".
 * The tail is long (20+ distinct strings, several one-offs and a couple in
 * other languages) and adds noise rather than insight. */
const TOP_REASONS = 8;
const RECENT_LIMIT = 50;

export interface CancellationFilter {
  fromDate: Date;
  toDate: Date;
  platform?: Platform;
  initiator?: string;
  /** A key from SHOP_BRANDS, or a raw shopName for a shop not listed there. */
  shop?: string;
}

export interface CancellationBreakdownRow {
  key: string;
  label: string;
  count: number;
  amount: number;
  /** Share of cancellations in this view, 0–100. */
  share: number;
}

/** One column of the trend chart. The three initiators are kept as their own
 * fields rather than a map so the chart component can name them directly. */
export interface CancellationTrendPoint {
  key: string;
  label: string;
  buyer: number;
  seller: number;
  system: number;
  unknown: number;
  total: number;
}

export interface CancellationStats {
  cancelledCount: number;
  cancelledAmount: number;
  /** Every order in the window regardless of status — the denominator behind
   * the cancellation rate. */
  totalOrders: number;
  cancelRate: number;
  byInitiator: CancellationBreakdownRow[];
  byReason: CancellationBreakdownRow[];
  byPlatform: CancellationBreakdownRow[];
  byShop: CancellationBreakdownRow[];
  /** Cancellations in view with no reason recorded at all. Every platform
   * reports one — Shopee and Lazada inside the order export, TikTok over the
   * API — so a non-zero count here means orders imported before that was
   * read, not a platform that stays silent. */
  missingReasonCount: number;
  trend: CancellationTrendPoint[];
  /** "รายวัน" / "รายสัปดาห์" / "รายเดือน" — shown under the chart title so the
   * reader knows what one bar covers. */
  trendGranularity: string;
  recent: {
    id: string;
    platformOrderId: string;
    platform: Platform;
    shopName: string | null;
    totalAmount: number;
    orderDate: Date;
    cancelledAt: Date | null;
    cancelReason: string | null;
    cancelInitiator: string | null;
  }[];
}


export const initiatorLabel: Record<string, string> = {
  BUYER: "ลูกค้ายกเลิก",
  SELLER: "ร้านยกเลิก",
  SYSTEM: "ระบบยกเลิกอัตโนมัติ",
};

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

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Calendar parts of an instant as seen in Bangkok — the whole app reports on
 * Bangkok days, and bucketing on UTC would move every evening order into the
 * next day's bar. */
function bangkokParts(d: Date) {
  const shifted = new Date(d.getTime() + BANGKOK_OFFSET_MS);
  return { y: shifted.getUTCFullYear(), m: shifted.getUTCMonth(), d: shifted.getUTCDate(), dow: shifted.getUTCDay() };
}

const THAI_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

/** Groups cancellations into as many bars as the window can carry legibly:
 * a day each up to ~6 weeks, then a week each, then a month. Without this,
 * "ทั้งหมด" would render hundreds of one-pixel bars. */
function buildTrend(
  rows: { orderDate: Date; cancelInitiator: string | null }[],
  fromDate: Date,
  toDate: Date,
): { trend: CancellationTrendPoint[]; trendGranularity: string } {
  const spanDays = Math.max(1, Math.round((toDate.getTime() - fromDate.getTime()) / 86_400_000));
  const mode = spanDays <= 45 ? "day" : spanDays <= 210 ? "week" : "month";

  const buckets = new Map<string, CancellationTrendPoint>();
  for (const row of rows) {
    const p = bangkokParts(row.orderDate);
    let key: string;
    let label: string;
    if (mode === "day") {
      key = `${p.y}-${String(p.m + 1).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
      label = `${p.d} ${THAI_MONTHS[p.m]}`;
    } else if (mode === "week") {
      // Monday-based week start, so a bar lines up with a working week.
      const start = new Date(Date.UTC(p.y, p.m, p.d - ((p.dow + 6) % 7)));
      const sp = { y: start.getUTCFullYear(), m: start.getUTCMonth(), d: start.getUTCDate() };
      key = `${sp.y}-${String(sp.m + 1).padStart(2, "0")}-${String(sp.d).padStart(2, "0")}`;
      label = `${sp.d} ${THAI_MONTHS[sp.m]}`;
    } else {
      key = `${p.y}-${String(p.m + 1).padStart(2, "0")}`;
      label = `${THAI_MONTHS[p.m]} ${String(p.y + 543).slice(2)}`;
    }

    const bucket = buckets.get(key) ?? { key, label, buyer: 0, seller: 0, system: 0, unknown: 0, total: 0 };
    if (row.cancelInitiator === "BUYER") bucket.buyer++;
    else if (row.cancelInitiator === "SELLER") bucket.seller++;
    else if (row.cancelInitiator === "SYSTEM") bucket.system++;
    else bucket.unknown++;
    bucket.total++;
    buckets.set(key, bucket);
  }

  const trend = [...buckets.values()].sort((a, b) => a.key.localeCompare(b.key));
  const granularity = mode === "day" ? "รายวัน" : mode === "week" ? "รายสัปดาห์" : "รายเดือน";
  return { trend, trendGranularity: granularity };
}

/** Turns a ?shop= key into a where-clause fragment. A known shop matches all
 * of its per-platform spellings; an unknown key is treated as a raw shopName
 * so a newly connected store can still be filtered before it's listed. */
function shopCondition(shop: string | undefined): Prisma.OrderWhereInput {
  if (!shop) return {};
  const names = shopNamesForKey(shop);
  return { shopName: names ? { in: names } : shop };
}

export async function getCancellationStats(filter: CancellationFilter): Promise<CancellationStats> {
  const dateWindow = { gte: filter.fromDate, lte: filter.toDate };
  const cancelledWhere: Prisma.OrderWhereInput = {
    status: OrderStatus.CANCELLED,
    orderDate: dateWindow,
    ...(filter.platform ? { platform: filter.platform } : {}),
    ...(filter.initiator ? { cancelInitiator: filter.initiator } : {}),
    ...shopCondition(filter.shop),
  };
  // The rate's denominator deliberately ignores the initiator filter — "5% of
  // orders were cancelled by the buyer" only means anything against ALL
  // orders, not against the cancelled ones.
  const totalWhere: Prisma.OrderWhereInput = {
    orderDate: dateWindow,
    ...(filter.platform ? { platform: filter.platform } : {}),
    ...shopCondition(filter.shop),
  };

  // Five independent aggregates, so fire them together rather than stacking
  // five cross-region round trips end to end.
  const [totals, totalOrders, initiatorGroups, reasonGroups, platformGroups, shopGroups, trendRows, recent] = await Promise.all([
    prisma.order.aggregate({ where: cancelledWhere, _count: { _all: true }, _sum: { totalAmount: true } }),
    prisma.order.count({ where: totalWhere }),
    prisma.order.groupBy({ by: ["cancelInitiator"], where: cancelledWhere, _count: { _all: true }, _sum: { totalAmount: true } }),
    prisma.order.groupBy({ by: ["cancelReason"], where: cancelledWhere, _count: { _all: true }, _sum: { totalAmount: true } }),
    prisma.order.groupBy({ by: ["platform"], where: cancelledWhere, _count: { _all: true }, _sum: { totalAmount: true } }),
    prisma.order.groupBy({ by: ["shopName"], where: cancelledWhere, _count: { _all: true }, _sum: { totalAmount: true } }),
    // Two columns for every cancellation in the window, bucketed in JS below.
    // Postgres could group by a date_trunc, but the filters above are Prisma
    // where-clauses and duplicating them in raw SQL is how the two drift
    // apart; a few hundred two-field rows costs less than that risk.
    prisma.order.findMany({
      where: cancelledWhere,
      select: { orderDate: true, cancelInitiator: true },
    }),
    prisma.order.findMany({
      where: cancelledWhere,
      orderBy: { orderDate: "desc" },
      take: RECENT_LIMIT,
      select: {
        id: true,
        platformOrderId: true,
        platform: true,
        shopName: true,
        totalAmount: true,
        orderDate: true,
        cancelledAt: true,
        cancelReason: true,
        cancelInitiator: true,
      },
    }),
  ]);

  const cancelledCount = totals._count._all;
  const cancelledAmount = totals._sum.totalAmount ?? 0;

  const byInitiator = toRows(
    initiatorGroups.map((g) => ({ key: g.cancelInitiator, count: g._count._all, amount: g._sum.totalAmount ?? 0 })),
    cancelledCount,
    (k) => (k ? (initiatorLabel[k] ?? k) : "ไม่ระบุ"),
  );

  const allReasons = toRows(
    reasonGroups.map((g) => ({ key: g.cancelReason, count: g._count._all, amount: g._sum.totalAmount ?? 0 })),
    cancelledCount,
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

  const missingReasonCount = reasonGroups.find((g) => g.cancelReason === null)?._count._all ?? 0;

  const byPlatform = toRows(
    platformGroups.map((g) => ({ key: g.platform, count: g._count._all, amount: g._sum.totalAmount ?? 0 })),
    cancelledCount,
    (k) => k ?? "ไม่ระบุ",
  );

  // Folded in JS rather than grouped in SQL: one shop is several different
  // shopName strings (see shops.ts), and the rows per window are in the
  // hundreds, so collapsing them here costs nothing and keeps the mapping in
  // one place instead of half in a query.
  const byShopTotals = new Map<string, { label: string; count: number; amount: number }>();
  for (const g of shopGroups) {
    const brand = brandForShopName(g.shopName);
    const entry = byShopTotals.get(brand.key) ?? { label: brand.label, count: 0, amount: 0 };
    entry.count += g._count._all;
    entry.amount += g._sum.totalAmount ?? 0;
    byShopTotals.set(brand.key, entry);
  }
  const byShop = toRows(
    [...byShopTotals.entries()].map(([key, v]) => ({ key, count: v.count, amount: v.amount })),
    cancelledCount,
    (k) => byShopTotals.get(k ?? "")?.label ?? "ไม่ระบุร้าน",
  );

  const { trend, trendGranularity } = buildTrend(trendRows, filter.fromDate, filter.toDate);

  return {
    cancelledCount,
    cancelledAmount,
    totalOrders,
    cancelRate: totalOrders > 0 ? (cancelledCount / totalOrders) * 100 : 0,
    byInitiator,
    byReason,
    byPlatform,
    byShop,
    missingReasonCount,
    trend,
    trendGranularity,
    recent,
  };
}
