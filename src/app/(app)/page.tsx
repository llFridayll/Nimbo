import Link from "next/link";
import {
  getDashboardKpis,
  getDailySalesSeries,
  getShippedTodayByPlatform,
  getRecentOrders,
  getChannelStatuses,
  getOpenProblemsCount,
} from "@/lib/dashboardStats";
import { getPendingShipmentProducts } from "@/lib/productStats";
import { KpiCard } from "@/components/KpiCard";
import { ChannelStatusCard } from "@/components/ChannelStatusCard";
import { RecentOrdersTable } from "@/components/RecentOrdersTable";
import { QuickTipCard } from "@/components/QuickTipCard";
import { LazyDashboardSalesChart, LazyOrderChannelDonut } from "@/components/LazyCharts";
import { DashboardSalesChartPeriodSelect } from "@/components/DashboardSalesChart";
import { AlertTriangleIcon, CheckCircleIcon, ShoppingBagIcon, ClockIcon, TruckIcon, XCircleIcon, BanknoteIcon, PackageIcon } from "@/components/icons";

export const dynamic = "force-dynamic";

interface DashboardPageProps {
  searchParams: Promise<{ chartDays?: string }>;
}

function formatThb(value: number): string {
  return `฿${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function kpiCaption(changePct: number | null): string {
  if (changePct === null) return "ยังไม่มีข้อมูลเทียบเมื่อวาน";
  if (changePct === 0) return "เท่ากับเมื่อวาน";
  return "จากเมื่อวาน";
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const params = await searchParams;
  const chartDays = params.chartDays === "7" || params.chartDays === "90" ? Number(params.chartDays) : 30;

  const [kpis, salesSeries, shippedToday, recentOrders, channelStatuses, openProblems, pendingShipmentProducts] = await Promise.all([
    getDashboardKpis(),
    getDailySalesSeries(chartDays),
    getShippedTodayByPlatform(),
    getRecentOrders(6),
    getChannelStatuses(),
    getOpenProblemsCount(),
    getPendingShipmentProducts(),
  ]);

  const now = new Date();
  const dateLabel = now.toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });
  const timeLabel = now.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">สวัสดีครับ 👋</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            ภาพรวมออเดอร์จากทุกช่องทาง วันนี้ {dateLabel} เวลา {timeLabel}
          </p>
        </div>
      </div>

      {/* Channel status — TikTok Shop is the only real OAuth connection this
          system has; Shopee/Lazada only ever receive orders via manual file
          import (/admin/order-import), so their cards deliberately say
          "นำเข้าไฟล์ล่าสุด" rather than a fabricated "เชื่อมต่อแล้ว". */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {channelStatuses.map((channel) => (
          <ChannelStatusCard key={channel.platform} channel={channel} />
        ))}
      </section>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard
          label="ออเดอร์ใหม่"
          value={kpis.newOrders.value.toLocaleString()}
          icon={ShoppingBagIcon}
          iconBgClass="bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
          changePct={kpis.newOrders.changePct}
          direction={kpis.newOrders.direction}
          caption={kpiCaption(kpis.newOrders.changePct)}
          href="/orders?days=today&status=NEW"
        />
        <KpiCard
          label="รอจัดส่ง"
          value={kpis.pendingShipment.value.toLocaleString()}
          icon={ClockIcon}
          iconBgClass="bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
          changePct={kpis.pendingShipment.changePct}
          direction={kpis.pendingShipment.direction}
          caption={kpiCaption(kpis.pendingShipment.changePct)}
          href="/orders?status=PENDING_SHIPMENT"
        />
        <KpiCard
          label="จัดส่งแล้ว"
          value={kpis.shipped.value.toLocaleString()}
          icon={TruckIcon}
          iconBgClass="bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400"
          changePct={kpis.shipped.changePct}
          direction={kpis.shipped.direction}
          caption={kpiCaption(kpis.shipped.changePct)}
          href="/orders?days=today&status=SHIPPED"
        />
        <KpiCard
          label="ยกเลิก / คืนสินค้า"
          value={kpis.cancelledOrReturned.value.toLocaleString()}
          icon={XCircleIcon}
          iconBgClass="bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400"
          changePct={kpis.cancelledOrReturned.changePct}
          direction={kpis.cancelledOrReturned.direction}
          positiveDirection="down"
          caption={kpiCaption(kpis.cancelledOrReturned.changePct)}
          href="/orders?days=today&status=CANCELLED"
        />
        <KpiCard
          label="ยอดขายวันนี้"
          value={formatThb(kpis.revenueToday.value)}
          icon={BanknoteIcon}
          iconBgClass="bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
          changePct={kpis.revenueToday.changePct}
          direction={kpis.revenueToday.direction}
          caption={kpiCaption(kpis.revenueToday.changePct)}
          href="/orders?days=today"
        />
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 shadow-sm lg:col-span-2">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">ยอดขายและจำนวนออเดอร์ ({chartDays} วันที่ผ่านมา)</h2>
            <DashboardSalesChartPeriodSelect value={String(chartDays)} />
          </div>
          <LazyDashboardSalesChart data={salesSeries} />
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-gray-900 dark:text-gray-100">ยอดส่งวันนี้ตามช่องทาง</h2>
          <LazyOrderChannelDonut data={shippedToday.data} total={shippedToday.total} />
          <ul className="mt-4 space-y-1.5">
            {shippedToday.data.map((p) => (
              <li key={p.platform} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.colorHex }} />
                  {p.label}
                </span>
                <span className="text-gray-400 dark:text-gray-500">
                  {p.count.toLocaleString()} <span className="text-gray-300 dark:text-gray-600">({p.pct}%)</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 shadow-sm lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">ออเดอร์ล่าสุด</h2>
            <Link href="/orders" className="text-xs font-medium text-primary hover:underline">
              ดูทั้งหมด →
            </Link>
          </div>
          <RecentOrdersTable orders={recentOrders} />
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              สินค้าที่ต้องส่ง{" "}
              <span className="font-normal text-gray-400 dark:text-gray-500">(ทั้งหมด {pendingShipmentProducts.length.toLocaleString()} รายการ)</span>
            </h2>
            <Link href="/orders?status=PENDING_SHIPMENT" className="text-xs font-medium text-primary hover:underline">
              ดูทั้งหมด →
            </Link>
          </div>
          {pendingShipmentProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <CheckCircleIcon className="h-8 w-8 text-emerald-400" />
              <p className="mt-2 text-sm text-gray-400 dark:text-gray-500">ไม่มีสินค้าที่ต้องรอจัดส่ง</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {pendingShipmentProducts.slice(0, 5).map((product) => (
                <li key={product.sku} className="flex items-center gap-3 rounded-lg border border-gray-100 dark:border-gray-800 px-3 py-2">
                  {product.imageUrl ? (
                    // Plain <img>, not next/image — platform CDN hosts vary
                    // and are unpredictable, so allowlisting remotePatterns
                    // ahead of time isn't practical here.
                    <img src={product.imageUrl} alt="" loading="lazy" className="h-10 w-10 shrink-0 rounded-md border border-gray-100 object-cover dark:border-gray-700" />
                  ) : (
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-300 dark:bg-gray-700 dark:text-gray-500">
                      <PackageIcon className="h-5 w-5" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-800 dark:text-gray-200">{product.productName}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">{product.sku}</p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-gray-900 dark:text-gray-100">{product.totalQuantity.toLocaleString()} ชิ้น</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {openProblems > 0 ? (
          <Link
            href="/problems"
            className="flex items-center justify-between gap-4 rounded-xl border border-red-200 bg-red-50 p-4 shadow-sm transition-colors hover:bg-red-100 lg:col-span-2"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600">
                <AlertTriangleIcon className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm text-red-800">
                  มี <span className="font-semibold">{openProblems}</span> ออเดอร์ที่กำลังมีปัญหาและยังไม่ได้แก้ไข
                </p>
                <p className="text-xs text-red-500">เช่น ที่อยู่ไม่ครบ, ติดต่อไม่ได้, สินค้าหมด</p>
              </div>
            </div>
            <span className="shrink-0 rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white">ไปที่ Problem Center →</span>
          </Link>
        ) : (
          <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm lg:col-span-2">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <CheckCircleIcon className="h-4 w-4" />
            </span>
            <p className="text-sm text-emerald-800">ไม่มีออเดอร์ที่กำลังมีปัญหาในขณะนี้</p>
          </div>
        )}
        <QuickTipCard />
      </section>
    </div>
  );
}
