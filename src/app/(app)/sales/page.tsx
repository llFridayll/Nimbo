import { OrderStatus, Platform } from "@prisma/client";
import { getDailySales } from "@/lib/salesStats";
import { startOfDaysAgoBangkok } from "@/lib/dateUtils";
import { prisma } from "@/lib/db";
import { SalesFilterBar } from "@/components/SalesFilterBar";
import { SalesChart } from "@/components/SalesChart";

export const dynamic = "force-dynamic";

interface SalesPageProps {
  searchParams: Promise<{ status?: string; platform?: string; days?: string; from?: string; to?: string; shop?: string }>;
}

const DEFAULT_DAYS = "30";

function formatBaht(n: number): string {
  return n.toLocaleString("th-TH", { maximumFractionDigits: 0 });
}

export default async function SalesPage({ searchParams }: SalesPageProps) {
  const params = await searchParams;
  const statusParam = params.status ?? "";
  const platformParam = params.platform ?? "";
  const daysParam = params.days ?? DEFAULT_DAYS;
  const fromParam = params.from ?? "";
  const toParam = params.to ?? "";
  const shopParam = params.shop ?? "";
  const isCustomRange = Boolean(fromParam || toParam);

  const status = Object.values(OrderStatus).includes(statusParam as OrderStatus) ? (statusParam as OrderStatus) : undefined;
  const platform = Object.values(Platform).includes(platformParam as Platform) ? (platformParam as Platform) : undefined;
  // Shop filtering only makes sense scoped to TikTok right now (the only
  // platform with multi-shop support), so ignore a stray ?shop= otherwise.
  const shopId = platform === Platform.TIKTOK && shopParam ? shopParam : undefined;
  const tiktokShops = await prisma.tikTokShop.findMany({ select: { shopId: true, shopName: true }, orderBy: { createdAt: "asc" } });

  let fromDate: Date;
  let toDate: Date;
  if (isCustomRange) {
    fromDate = fromParam ? new Date(`${fromParam}T00:00:00+07:00`) : startOfDaysAgoBangkok(29);
    toDate = toParam ? new Date(`${toParam}T23:59:59+07:00`) : new Date();
  } else if (daysParam === "today") {
    fromDate = startOfDaysAgoBangkok(0);
    toDate = new Date();
  } else if (daysParam === "all") {
    fromDate = startOfDaysAgoBangkok(365);
    toDate = new Date();
  } else {
    const n = Number(daysParam);
    fromDate = startOfDaysAgoBangkok(Number.isFinite(n) && n > 0 ? n - 1 : 29);
    toDate = new Date();
  }

  const stats = await getDailySales({ fromDate, toDate, platform, shopId, status });
  const daysInRange = stats.points.length || 1;
  const avgPerDay = stats.totalRevenue / daysInRange;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">ประวัติการขาย</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">ดูยอดขายสุทธิและจำนวนออเดอร์ย้อนหลัง เลือกวันหรือช่วงวันที่ต้องการดูได้</p>
      </div>

      <SalesFilterBar
        initialStatus={statusParam}
        initialPlatform={platformParam}
        initialDays={daysParam}
        initialFrom={fromParam}
        initialTo={toParam}
        initialShop={shopParam}
        shops={tiktokShops}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400">ยอดขายสุทธิ</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900 dark:text-gray-100">฿{formatBaht(stats.totalRevenue)}</p>
        </div>
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400">จำนวนออเดอร์</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900 dark:text-gray-100">{stats.totalOrders.toLocaleString()}</p>
          <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">ยกเลิก/คืนเงิน/คืนสินค้า {stats.cancelledOrRefunded.toLocaleString()} รายการ</p>
        </div>
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400">ยอดขายสุทธิเฉลี่ย/วัน</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900 dark:text-gray-100">฿{formatBaht(avgPerDay)}</p>
        </div>
      </div>

      <SalesChart points={stats.points} />
    </div>
  );
}
