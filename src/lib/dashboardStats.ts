import { cache } from "react";
import { OrderStatus, Platform } from "@prisma/client";
import { prisma } from "./db";
import {
  currentShippingCutoffWindow,
  shippingCutoffWindowForDate,
  startOfDaysAgoBangkok,
  formatBangkokDateYMD,
  formatRelativeThai,
  formatShortThaiDateTime,
} from "./dateUtils";
import { NEEDS_SHIPPING_STATUSES, shippingWindowWhere } from "./shippingSummary";
import { platformLabel, platformHexColor } from "./labels";
import { maskBuyerName } from "./mask";

// --- KPI cards -----------------------------------------------------------

export interface DashboardKpi {
  value: number;
  /** null when there's no meaningful baseline to compare against (yesterday
   * was zero) — render as "ใหม่"/no badge instead of a fake ±Infinity%. */
  changePct: number | null;
  direction: "up" | "down" | "flat";
}

export interface DashboardKpis {
  newOrders: DashboardKpi;
  pendingShipment: DashboardKpi;
  shipped: DashboardKpi;
  cancelledOrReturned: DashboardKpi;
  revenueToday: DashboardKpi;
}

function computeKpi(current: number, previous: number): DashboardKpi {
  if (previous === 0) {
    return { value: current, changePct: current === 0 ? 0 : null, direction: current > 0 ? "up" : "flat" };
  }
  const changePct = ((current - previous) / previous) * 100;
  return { value: current, changePct, direction: changePct > 0 ? "up" : changePct < 0 ? "down" : "flat" };
}

/** The five headline cards. Two kinds of number live here, and each is
 * compared against something that makes sense for it:
 *
 * - Order flow (ออเดอร์ใหม่, ยกเลิก/คืน, ยอดขาย) — orders PLACED today,
 *   compared with yesterday up to the same time of day. Comparing "so far
 *   today" with "all of yesterday" made every card read -100% each morning
 *   however normal trading was.
 * - Shipping (จัดส่งแล้ว, รอจัดส่ง) — the same orders the packing list shows,
 *   not orders placed today. These used to count only orders placed today
 *   that happened to be in that status, so they sat at 0 almost every day
 *   while the packing list had work on it.
 *
 * ออเดอร์ใหม่ counts every order placed today whatever its status: TikTok
 * moves an order out of NEW within minutes, so counting status NEW alone
 * undercounted the day's orders. */
export async function getDashboardKpis(now: Date = new Date()): Promise<DashboardKpis> {
  const todayStart = startOfDaysAgoBangkok(0);
  const yesterdayStart = startOfDaysAgoBangkok(1);
  const yesterdaySameTime = new Date(yesterdayStart.getTime() + (now.getTime() - todayStart.getTime()));

  const window = currentShippingCutoffWindow(now);
  const previous = shippingCutoffWindowForDate(new Date(window.from.getTime() - 1));
  const elapsedInWindow = now.getTime() - window.from.getTime();
  const previousSameTime = new Date(Math.min(previous.from.getTime() + elapsedInWindow, previous.to.getTime()));

  // Order flow in one scan, not four: every order since yesterday's start
  // that is either from today or from yesterday before this time of day.
  // (Four parallel queries measured 2923ms against the live database, this
  // single scan 657ms — each is a ~205ms round trip in its own transaction.)
  const [rows, shippedNow, shippedBefore, backlog] = await Promise.all([
    prisma.$queryRaw<{ isToday: boolean; status: OrderStatus; count: number; revenue: number | null }[]>`
      SELECT "orderDate" >= ${todayStart} AS "isToday",
             "status",
             COUNT(*)::int        AS "count",
             SUM("totalAmount")   AS "revenue"
      FROM "Order"
      WHERE "orderDate" >= ${todayStart}
         OR ("orderDate" >= ${yesterdayStart} AND "orderDate" < ${yesterdaySameTime})
      GROUP BY 1, 2
    `,
    // Tracking number arrived in the current shipping window — the
    // warehouse's "shipped today" (the day the tracking number arrives is
    // the day it ships). Same filter as the packing list and the donut.
    prisma.order.count({ where: { AND: [shippingWindowWhere(window, { now }), { printedAt: { not: null } }] } }),
    prisma.order.count({
      where: { AND: [shippingWindowWhere(previous, { now }), { printedAt: { gte: previous.from, lt: previousSameTime } }] },
    }),
    // Still waiting for a tracking number, from any day. Not tied to the
    // window on purpose: after 14:00 the packing list moves these to the
    // next round, but they are still undone work and shouldn't read as 0.
    prisma.order.count({
      where: { printedAt: null, status: { in: NEEDS_SHIPPING_STATUSES }, isUnpaid: false },
    }),
  ]);

  const countOf = (isToday: boolean, statuses?: OrderStatus[]) =>
    rows
      .filter((r) => r.isToday === isToday && (!statuses || statuses.includes(r.status)))
      .reduce((sum, r) => sum + r.count, 0);
  const revenueOf = (isToday: boolean) =>
    rows.filter((r) => r.isToday === isToday).reduce((sum, r) => sum + (r.revenue ?? 0), 0);

  return {
    newOrders: computeKpi(countOf(true), countOf(false)),
    // A backlog is a snapshot, not a flow — "12 waiting" has no sensible
    // "vs yesterday", so no trend badge (changePct null hides it).
    pendingShipment: { value: backlog, changePct: null, direction: "flat" },
    shipped: computeKpi(shippedNow, shippedBefore),
    cancelledOrReturned: computeKpi(
      countOf(true, ["CANCELLED", "RETURNED"]),
      countOf(false, ["CANCELLED", "RETURNED"])
    ),
    revenueToday: computeKpi(revenueOf(true), revenueOf(false)),
  };
}

// --- 30-day combo chart ----------------------------------------------------

const THAI_MONTHS_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

export interface SalesChartPoint {
  date: string; // "YYYY-MM-DD" (Bangkok calendar day)
  dateLabel: string; // "12 ก.ย."
  sales: number;
  orders: number;
  returns: number;
}

export async function getDailySalesSeries(days: number = 30): Promise<SalesChartPoint[]> {
  const rangeStart = startOfDaysAgoBangkok(days - 1);
  const orders = await prisma.order.findMany({
    where: { orderDate: { gte: rangeStart } },
    select: { orderDate: true, totalAmount: true, status: true },
  });

  // Pre-seed every day in the window (oldest first) so the chart never
  // silently skips a day with zero orders.
  const buckets = new Map<string, SalesChartPoint>();
  for (let i = days - 1; i >= 0; i--) {
    const dayStart = startOfDaysAgoBangkok(i);
    const key = formatBangkokDateYMD(dayStart);
    const bangkok = new Date(dayStart.getTime() + 7 * 60 * 60 * 1000);
    const dateLabel = `${bangkok.getUTCDate()} ${THAI_MONTHS_SHORT[bangkok.getUTCMonth()]}`;
    buckets.set(key, { date: key, dateLabel, sales: 0, orders: 0, returns: 0 });
  }

  for (const order of orders) {
    const bucket = buckets.get(formatBangkokDateYMD(order.orderDate));
    if (!bucket) continue;
    bucket.sales += order.totalAmount;
    bucket.orders += 1;
    if (order.status === "RETURNED") bucket.returns += 1;
  }

  return Array.from(buckets.values());
}

// --- Channel-share donut ---------------------------------------------------

export interface PlatformSharePoint {
  platform: Platform;
  label: string;
  count: number;
  pct: number;
  colorHex: string;
}

/** Today's shipments by channel: exactly the orders on today's packing list
 * (the current 14:00-cutoff window — see shippingWindowWhere), so the donut
 * and the shipping summary page can never disagree about what "today" is.
 * Keyed on when the tracking number arrived, not when the order was placed:
 * an order placed today isn't necessarily shipped today, and one shipped
 * today may have been placed days earlier. */
export async function getShippedTodayByPlatform(): Promise<{ data: PlatformSharePoint[]; total: number }> {
  const rows = await prisma.order.groupBy({
    by: ["platform"],
    _count: { _all: true },
    where: shippingWindowWhere(currentShippingCutoffWindow()),
  });
  const total = rows.reduce((sum, r) => sum + r._count._all, 0);
  const data: PlatformSharePoint[] = Object.values(Platform).map((platform) => {
    const count = rows.find((r) => r.platform === platform)?._count._all ?? 0;
    return {
      platform,
      label: platformLabel[platform],
      count,
      pct: total > 0 ? Math.round((count / total) * 100) : 0,
      colorHex: platformHexColor[platform],
    };
  });
  return { data, total };
}

// --- Recent-orders table ---------------------------------------------------

export interface RecentOrderRow {
  id: string;
  platform: Platform;
  platformOrderId: string;
  buyerNameMasked: string;
  totalAmount: number;
  currency: string;
  status: OrderStatus;
  orderDate: Date;
}

export async function getRecentOrders(limit: number = 8): Promise<RecentOrderRow[]> {
  const orders = await prisma.order.findMany({
    orderBy: { orderDate: "desc" },
    take: limit,
    select: {
      id: true,
      platform: true,
      platformOrderId: true,
      buyerName: true,
      totalAmount: true,
      currency: true,
      status: true,
      orderDate: true,
    },
  });
  return orders.map((o) => ({
    id: o.id,
    platform: o.platform,
    platformOrderId: o.platformOrderId,
    buyerNameMasked: maskBuyerName(o.buyerName),
    totalAmount: o.totalAmount,
    currency: o.currency,
    status: o.status,
    orderDate: o.orderDate,
  }));
}

// --- Channel connection/import status cards --------------------------------

export interface ChannelStatus {
  platform: Platform;
  label: string;
  /** "oauth" = a real connected/disconnected state (TikTok Shop);
   * "manual-import" = orders arrive via file upload, so there's no
   * "connected" concept — only ever show honest "last imported" wording. */
  kind: "oauth" | "manual-import";
  connected: boolean;
  statusText: string;
  lastUpdatedLabel: string;
  /** Present only when there's a real action to take (TikTok OAuth entry
   * point when disconnected) — Shopee/Lazada have no equivalent since they
   * only ever receive orders via the /admin/order-import upload form. */
  actionHref?: string;
  actionLabel?: string;
}

/** Shopee/Lazada orders only ever arrive via manual file import
 * (src/lib/orderImportActions.ts calls upsertOrder() directly, writing no
 * SyncLog row) — so the most recent Order.createdAt for that platform is the
 * only honest "last activity" signal available, and is deliberately NOT
 * labeled "เชื่อมต่อแล้ว" the way TikTok's real OAuth connection is. */
export async function getChannelStatuses(): Promise<ChannelStatus[]> {
  // Every query here costs a full round trip to the database region (~205ms
  // of pure network, versus ~0.1ms of actual query execution), so the two
  // per-platform "last imported" aggregates are folded into one groupBy
  // rather than issued as two separate calls.
  const [tiktokShops, tiktokSyncLog, lastImportByPlatform] = await Promise.all([
    prisma.tikTokShop.findMany({ select: { id: true } }),
    prisma.syncLog.findFirst({
      where: { platform: "TIKTOK", success: true },
      orderBy: { finishedAt: "desc" },
      select: { finishedAt: true },
    }),
    prisma.order.groupBy({
      by: ["platform"],
      where: { platform: { in: [Platform.SHOPEE, Platform.LAZADA] } },
      _max: { createdAt: true },
    }),
  ]);

  const lastImportedAt = (platform: Platform): Date | null =>
    lastImportByPlatform.find((row) => row.platform === platform)?._max.createdAt ?? null;
  const shopeeLastImportedAt = lastImportedAt(Platform.SHOPEE);
  const lazadaLastImportedAt = lastImportedAt(Platform.LAZADA);

  const tiktokConnected = tiktokShops.length > 0;

  const manualImportStatus = (lastImportedAt: Date | null): { statusText: string; lastUpdatedLabel: string } =>
    lastImportedAt
      ? { statusText: "นำเข้าไฟล์ด้วยมือ", lastUpdatedLabel: `นำเข้าล่าสุด ${formatRelativeThai(lastImportedAt)}` }
      : { statusText: "ยังไม่เคยนำเข้าไฟล์", lastUpdatedLabel: "-" };

  return [
    { platform: "SHOPEE", label: platformLabel.SHOPEE, kind: "manual-import", connected: !!shopeeLastImportedAt, ...manualImportStatus(shopeeLastImportedAt) },
    { platform: "LAZADA", label: platformLabel.LAZADA, kind: "manual-import", connected: !!lazadaLastImportedAt, ...manualImportStatus(lazadaLastImportedAt) },
    {
      platform: "TIKTOK",
      label: platformLabel.TIKTOK,
      kind: "oauth",
      connected: tiktokConnected,
      statusText: tiktokConnected ? "เชื่อมต่อแล้ว" : "ยังไม่ได้เชื่อมต่อ",
      lastUpdatedLabel: tiktokSyncLog?.finishedAt
        ? `sync ล่าสุด ${formatRelativeThai(tiktokSyncLog.finishedAt)}`
        : tiktokConnected
          ? "ยังไม่เคย sync สำเร็จ"
          : "-",
      actionHref: "/api/tiktok/authorize",
      actionLabel: tiktokConnected ? "+ เพิ่มร้าน" : "เชื่อมต่อ",
    },
  ];
}

// --- Shared with layout.tsx (top-bar bell/refresh caption) and page.tsx
// (problem banner) --------------------------------------------------------

/** Memoized per request (React `cache`): the (app) layout renders this in the
 * top-bar bell on every page, and the dashboard page asks for it again for
 * its problem banner — without this, loading the dashboard ran the exact same
 * COUNT twice, one full round trip of pure duplication. */
export const getOpenProblemsCount = cache(async (): Promise<number> => {
  return prisma.problemTicket.count({ where: { isResolved: false } });
});

/** Most recent successful sync across any platform — powers the top bar's
 * "อัปเดตล่าสุด" caption on the refresh button. */
export const getLastSyncedLabel = cache(async (): Promise<string> => {
  const lastSync = await prisma.syncLog.findFirst({
    where: { success: true },
    orderBy: { finishedAt: "desc" },
    // Without an explicit select this pulled every column (including
    // errorMessage) for a row we only read one timestamp from.
    select: { finishedAt: true },
  });
  return formatShortThaiDateTime(lastSync?.finishedAt ?? null);
});
