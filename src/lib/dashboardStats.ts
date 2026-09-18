import { OrderStatus, Platform } from "@prisma/client";
import { prisma } from "./db";
import { startOfDaysAgoBangkok, formatBangkokDateYMD, formatRelativeThai, formatShortThaiDateTime } from "./dateUtils";
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

/** All 5 headline KPIs compare "orders placed today" against "orders placed
 * yesterday" for a consistent visual treatment. Note รอจัดส่ง (pending
 * shipment) is naturally a backlog metric (current outstanding count), not a
 * daily-flow one like the other 4 — it's measured here as "today's
 * newly-placed orders currently pending" rather than the raw backlog total,
 * a deliberate simplification so all 5 cards share the same trend-badge
 * shape (see plan doc). The raw current backlog is still shown elsewhere on
 * the page via getPendingShipmentProducts(). */
export async function getDashboardKpis(): Promise<DashboardKpis> {
  const todayStart = startOfDaysAgoBangkok(0);
  const yesterdayStart = startOfDaysAgoBangkok(1);

  const [byStatusToday, byStatusYesterday, revenueToday, revenueYesterday] = await Promise.all([
    prisma.order.groupBy({ by: ["status"], _count: { _all: true }, where: { orderDate: { gte: todayStart } } }),
    prisma.order.groupBy({
      by: ["status"],
      _count: { _all: true },
      where: { orderDate: { gte: yesterdayStart, lt: todayStart } },
    }),
    prisma.order.aggregate({ _sum: { totalAmount: true }, where: { orderDate: { gte: todayStart } } }),
    prisma.order.aggregate({ _sum: { totalAmount: true }, where: { orderDate: { gte: yesterdayStart, lt: todayStart } } }),
  ]);

  const countOf = (rows: { status: OrderStatus; _count: { _all: number } }[], statuses: OrderStatus[]) =>
    rows.filter((r) => statuses.includes(r.status)).reduce((sum, r) => sum + r._count._all, 0);

  return {
    newOrders: computeKpi(countOf(byStatusToday, ["NEW"]), countOf(byStatusYesterday, ["NEW"])),
    pendingShipment: computeKpi(countOf(byStatusToday, ["PENDING_SHIPMENT"]), countOf(byStatusYesterday, ["PENDING_SHIPMENT"])),
    shipped: computeKpi(countOf(byStatusToday, ["SHIPPED"]), countOf(byStatusYesterday, ["SHIPPED"])),
    cancelledOrReturned: computeKpi(
      countOf(byStatusToday, ["CANCELLED", "RETURNED"]),
      countOf(byStatusYesterday, ["CANCELLED", "RETURNED"])
    ),
    revenueToday: computeKpi(revenueToday._sum.totalAmount ?? 0, revenueYesterday._sum.totalAmount ?? 0),
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

/** Today's actual shipments by channel — keyed off `printedAt` (when a
 * tracking number first appeared), the same "this order went out today"
 * definition src/lib/shippingSummary.ts uses for the packing list, rather
 * than `orderDate` (when it was placed). An order placed today isn't
 * necessarily shipped today, and an order shipped today may well have been
 * placed days earlier — this tracks actual outbound volume per channel. */
export async function getShippedTodayByPlatform(): Promise<{ data: PlatformSharePoint[]; total: number }> {
  const todayStart = startOfDaysAgoBangkok(0);
  const rows = await prisma.order.groupBy({ by: ["platform"], _count: { _all: true }, where: { printedAt: { gte: todayStart } } });
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
  const [tiktokShops, tiktokSyncLog, shopeeLast, lazadaLast] = await Promise.all([
    prisma.tikTokShop.findMany(),
    prisma.syncLog.findFirst({ where: { platform: "TIKTOK", success: true }, orderBy: { finishedAt: "desc" } }),
    prisma.order.aggregate({ where: { platform: "SHOPEE" }, _max: { createdAt: true } }),
    prisma.order.aggregate({ where: { platform: "LAZADA" }, _max: { createdAt: true } }),
  ]);

  const tiktokConnected = tiktokShops.length > 0;

  const manualImportStatus = (lastImportedAt: Date | null): { statusText: string; lastUpdatedLabel: string } =>
    lastImportedAt
      ? { statusText: "นำเข้าไฟล์ด้วยมือ", lastUpdatedLabel: `นำเข้าล่าสุด ${formatRelativeThai(lastImportedAt)}` }
      : { statusText: "ยังไม่เคยนำเข้าไฟล์", lastUpdatedLabel: "-" };

  return [
    { platform: "SHOPEE", label: platformLabel.SHOPEE, kind: "manual-import", connected: !!shopeeLast._max.createdAt, ...manualImportStatus(shopeeLast._max.createdAt) },
    { platform: "LAZADA", label: platformLabel.LAZADA, kind: "manual-import", connected: !!lazadaLast._max.createdAt, ...manualImportStatus(lazadaLast._max.createdAt) },
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

export async function getOpenProblemsCount(): Promise<number> {
  return prisma.problemTicket.count({ where: { isResolved: false } });
}

/** Most recent successful sync across any platform — powers the top bar's
 * "อัปเดตล่าสุด" caption on the refresh button. */
export async function getLastSyncedLabel(): Promise<string> {
  const lastSync = await prisma.syncLog.findFirst({ where: { success: true }, orderBy: { finishedAt: "desc" } });
  return formatShortThaiDateTime(lastSync?.finishedAt ?? null);
}
