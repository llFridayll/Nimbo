import Link from "next/link";
import { redirect } from "next/navigation";
import { OrderStatus, Platform } from "@prisma/client";
import { listOrderRows } from "@/lib/orderQueries";
import { searchOrdersAcrossPlatforms } from "@/lib/orderSearch";
import { startOfDaysAgoBangkok } from "@/lib/dateUtils";
import { prisma } from "@/lib/db";
import { StatusBadge, PlatformBadge } from "@/components/Badges";
import { OrdersFilterBar } from "@/components/OrdersFilterBar";
import { OrderRowCheckbox } from "@/components/OrderRowCheckbox";
import { SelectAllCheckbox } from "@/components/SelectAllCheckbox";
import { PrintSelectedButton } from "@/components/PrintSelectedButton";

export const dynamic = "force-dynamic";

interface OrdersPageProps {
  searchParams: Promise<{
    q?: string;
    status?: string;
    platform?: string;
    days?: string;
    from?: string;
    to?: string;
    shopId?: string;
    page?: string;
  }>;
}

const DEFAULT_DAYS = "30";
// 50 keeps a page well under a second even on "ทั้งหมด" (5,700+ orders), and
// is small enough to scan; the old fixed cap of 100 had no pager at all, so
// anything past row 100 was simply invisible.
const PAGE_SIZE = 50;

export default async function OrdersPage({ searchParams }: OrdersPageProps) {
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const statusParam = params.status ?? "";
  const platformParam = params.platform ?? "";
  const daysParam = params.days ?? DEFAULT_DAYS;
  const fromParam = params.from ?? "";
  const toParam = params.to ?? "";
  const shopIdParam = params.shopId ?? "";
  const pageParam = Number(params.page);
  const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1;
  // An explicit custom date range (picked via the calendar popover) overrides
  // the "days" preset entirely.
  const isCustomRange = Boolean(fromParam || toParam);

  const status = Object.values(OrderStatus).includes(statusParam as OrderStatus)
    ? (statusParam as OrderStatus)
    : undefined;
  const platform = Object.values(Platform).includes(platformParam as Platform)
    ? (platformParam as Platform)
    : undefined;
  const shopId =
    (platform === Platform.TIKTOK || platform === Platform.SHOPEE || platform === Platform.LAZADA) && shopIdParam ? shopIdParam : undefined;
  let fromDate: Date | undefined;
  let toDate: Date | undefined;
  if (isCustomRange) {
    if (fromParam) fromDate = new Date(`${fromParam}T00:00:00+07:00`);
    if (toParam) toDate = new Date(`${toParam}T23:59:59+07:00`);
  } else if (daysParam === "today") {
    fromDate = startOfDaysAgoBangkok(0);
  } else if (daysParam !== "all") {
    const n = Number(daysParam);
    if (Number.isFinite(n) && n > 0) fromDate = startOfDaysAgoBangkok(n - 1);
  }

  // Server-side data fetch — runs on every request/navigation, no client fetch() involved.
  // The table below renders neither line items nor problem tickets, so this
  // deliberately fetches only the row columns (see listOrderRows) rather than
  // the full order graph — that alone took this query from ~2.4s to ~0.2s.
  const [pageResult, tiktokShops, shopeeShops, lazadaShops] = await Promise.all([
    q
      // Search is a "find this one order" flow capped at 25 matches, so it is
      // deliberately not paginated — it's shaped like a page only so the
      // rendering below can treat both modes identically.
      ? searchOrdersAcrossPlatforms(q).then((orders) => ({ orders, total: orders.length, page: 1, pageSize: orders.length }))
      : listOrderRows({ status, platform, shopId, fromDate, toDate, page, pageSize: PAGE_SIZE }),
    prisma.tikTokShop.findMany({ select: { shopId: true, shopName: true } }),
    prisma.order.findMany({
      where: { platform: Platform.SHOPEE, shopId: { not: null } },
      select: { shopId: true, shopName: true },
      distinct: ["shopId"],
    }),
    prisma.order.findMany({
      where: { platform: Platform.LAZADA, shopId: { not: null } },
      select: { shopId: true, shopName: true },
      distinct: ["shopId"],
    }),
  ]);
  const { orders, total } = pageResult;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const firstRow = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastRow = Math.min(page * PAGE_SIZE, total);
  // Page links must carry every active filter, or clicking "next" would
  // silently drop the status/platform/date the user had narrowed to.
  const pageHref = (n: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v && k !== "page") sp.set(k, Array.isArray(v) ? v[0] : v);
    if (n > 1) sp.set("page", String(n));
    const qs = sp.toString();
    return qs ? `/orders?${qs}` : "/orders";
  };
  // A stale or hand-typed ?page= past the end (a bookmark from before orders
  // were cancelled, say) would render an empty table under a caption like
  // "แสดง 49,901–5,715" — send it to the real last page instead. Search mode
  // is always a single page, so it can never be out of range.
  if (!q && total > 0 && page > totalPages) redirect(pageHref(totalPages));
  const title = q ? `ผลการค้นหา "${q}"` : "รายการ Order";

  // Lets the table header say exactly what window of orders it's showing —
  // no fromDate means "all time" (the "ทั้งหมด" preset); no toDate means the
  // range runs up to now (every preset except a custom range with an
  // explicit end date).
  const rangeLabel = !q
    ? `ข้อมูลตั้งแต่วันที่ ${fromDate ? fromDate.toLocaleDateString("th-TH") : "เริ่มเปิดร้าน"} ถึงวันที่ ${
        toDate ? toDate.toLocaleDateString("th-TH") : "วันนี้"
      } — ทั้งหมด ${total.toLocaleString()} รายการ`
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">ค้นหา Order จากจุดเดียว</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          พิมพ์เลขคำสั่งซื้อ, เลข Tracking, เบอร์โทร หรือชื่อลูกค้า — ระบบค้นหาให้ทุกช่องทางขายอัตโนมัติ ไม่ต้องเดาว่าลูกค้าซื้อจากที่ไหน
        </p>
      </div>

      <OrdersFilterBar
        initialQuery={q}
        initialStatus={statusParam}
        initialPlatform={platformParam}
        initialDays={daysParam}
        initialFrom={fromParam}
        initialTo={toParam}
        initialShopId={shopIdParam}
        shops={tiktokShops}
        shopeeShops={shopeeShops.filter((s): s is { shopId: string; shopName: string | null } => s.shopId !== null)}
        lazadaShops={lazadaShops.filter((s): s is { shopId: string; shopName: string | null } => s.shopId !== null)}
      />

      <form id="orders-select-form" method="GET" action="/orders/print" className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
            {rangeLabel && <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{rangeLabel}</p>}
          </div>
          {orders.length > 0 && <PrintSelectedButton />}
        </div>
        {orders.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-gray-400 dark:text-gray-500">ไม่พบ Order</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800/60 text-left text-xs text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="w-10 px-4 py-2">
                    <SelectAllCheckbox />
                  </th>
                  <th className="px-4 py-2 font-medium">ช่องทางขาย</th>
                  <th className="px-4 py-2 font-medium">เลขคำสั่งซื้อ</th>
                  <th className="px-4 py-2 font-medium">ลูกค้า</th>
                  <th className="px-4 py-2 font-medium">ยอดชำระ</th>
                  <th className="px-4 py-2 font-medium">Tracking</th>
                  <th className="whitespace-nowrap px-4 py-2 font-medium">วันที่/เวลาสั่ง</th>
                  <th className="px-4 py-2 font-medium">สถานะ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {orders.map((order) => (
                  <tr key={order.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                    <td className="px-4 py-3">
                      <OrderRowCheckbox orderId={order.id} />
                    </td>
                    <td className="px-4 py-3">
                      <PlatformBadge platform={order.platform} />
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/orders/${order.id}`} className="font-medium text-gray-900 dark:text-gray-100 hover:underline">
                        #{order.platformOrderId}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{order.buyerName ?? "-"}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                      {Number(order.totalAmount).toLocaleString()} {order.currency}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                      {order.trackingNumber ? order.trackingNumber.split(" / ").map((code) => <div key={code}>{code}</div>) : "-"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-600 dark:text-gray-400">
                      {new Date(order.orderDate).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={order.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!q && total > 0 && (
          <nav
            aria-label="แบ่งหน้า"
            className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-4 py-3 text-sm dark:border-gray-800"
          >
            <p className="text-gray-500 dark:text-gray-400">
              แสดง {firstRow.toLocaleString()}–{lastRow.toLocaleString()} จาก {total.toLocaleString()} รายการ
            </p>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                {page > 1 ? (
                  <Link href={pageHref(page - 1)} className="rounded-md border border-gray-300 px-3 py-1.5 font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">
                    ← ก่อนหน้า
                  </Link>
                ) : (
                  <span className="rounded-md border border-gray-200 px-3 py-1.5 text-gray-300 dark:border-gray-700 dark:text-gray-600">← ก่อนหน้า</span>
                )}
                <span className="px-2 text-gray-500 dark:text-gray-400">
                  หน้า {page.toLocaleString()} / {totalPages.toLocaleString()}
                </span>
                {page < totalPages ? (
                  <Link href={pageHref(page + 1)} className="rounded-md border border-gray-300 px-3 py-1.5 font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">
                    ถัดไป →
                  </Link>
                ) : (
                  <span className="rounded-md border border-gray-200 px-3 py-1.5 text-gray-300 dark:border-gray-700 dark:text-gray-600">ถัดไป →</span>
                )}
              </div>
            )}
          </nav>
        )}
      </form>
    </div>
  );
}
