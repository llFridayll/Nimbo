import Link from "next/link";
import { OrderStatus, Platform } from "@prisma/client";
import { listOrders } from "@/lib/orderQueries";
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
  }>;
}

const DEFAULT_DAYS = "30";

export default async function OrdersPage({ searchParams }: OrdersPageProps) {
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const statusParam = params.status ?? "";
  const platformParam = params.platform ?? "";
  const daysParam = params.days ?? DEFAULT_DAYS;
  const fromParam = params.from ?? "";
  const toParam = params.to ?? "";
  const shopIdParam = params.shopId ?? "";
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
  const [orders, tiktokShops, shopeeShops, lazadaShops] = await Promise.all([
    q
      ? searchOrdersAcrossPlatforms(q)
      : listOrders({ status, platform, shopId, fromDate, toDate, pageSize: 100 }).then((r) => r.orders),
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
  const title = q ? `ผลการค้นหา "${q}"` : "รายการ Order";

  // Lets the table header say exactly what window of orders it's showing —
  // no fromDate means "all time" (the "ทั้งหมด" preset); no toDate means the
  // range runs up to now (every preset except a custom range with an
  // explicit end date).
  const rangeLabel = !q
    ? `ข้อมูลตั้งแต่วันที่ ${fromDate ? fromDate.toLocaleDateString("th-TH") : "เริ่มเปิดร้าน"} ถึงวันที่ ${
        toDate ? toDate.toLocaleDateString("th-TH") : "วันนี้"
      }`
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
      </form>
    </div>
  );
}
