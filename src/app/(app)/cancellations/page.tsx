import Link from "next/link";
import { Platform } from "@prisma/client";
import { BreakdownList } from "@/components/BreakdownList";
import { CancellationFilterBar } from "@/components/CancellationFilterBar";
import { CancellationTrendChart } from "@/components/CancellationTrendChart";
import { getCancellationStats, initiatorLabel } from "@/lib/cancellationStats";
import { startOfDaysAgoBangkok } from "@/lib/dateUtils";
import { platformLabel } from "@/lib/labels";

export const dynamic = "force-dynamic";

const DEFAULT_DAYS = "30";

interface PageProps {
  searchParams: Promise<{ platform?: string; shop?: string; initiator?: string; days?: string; from?: string; to?: string }>;
}

function baht(n: number): string {
  return n.toLocaleString("th-TH", { maximumFractionDigits: 0 });
}

function dateLabel(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "short", timeStyle: "short" });
}

export default async function CancellationsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const platformParam = params.platform ?? "";
  const shopParam = params.shop ?? "";
  const initiatorParam = params.initiator ?? "";
  const daysParam = params.days ?? DEFAULT_DAYS;
  const fromParam = params.from ?? "";
  const toParam = params.to ?? "";
  const isCustomRange = Boolean(fromParam || toParam);

  const platform = Object.values(Platform).includes(platformParam as Platform) ? (platformParam as Platform) : undefined;
  const initiator = ["BUYER", "SELLER", "SYSTEM"].includes(initiatorParam) ? initiatorParam : undefined;

  let fromDate: Date;
  let toDate: Date;
  if (isCustomRange) {
    fromDate = fromParam ? new Date(`${fromParam}T00:00:00+07:00`) : startOfDaysAgoBangkok(29);
    toDate = toParam ? new Date(`${toParam}T23:59:59+07:00`) : new Date();
  } else if (daysParam === "today") {
    fromDate = startOfDaysAgoBangkok(0);
    toDate = new Date();
  } else if (daysParam === "all") {
    fromDate = new Date(0);
    toDate = new Date();
  } else {
    const days = Number(daysParam);
    fromDate = startOfDaysAgoBangkok(Number.isFinite(days) && days > 0 ? days - 1 : 29);
    toDate = new Date();
  }

  const stats = await getCancellationStats({ fromDate, toDate, platform, initiator, shop: shopParam || undefined });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">การยกเลิกออเดอร์</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">ดูว่าออเดอร์ถูกยกเลิกเพราะอะไร ใครเป็นคนยกเลิก และเสียมูลค่าไปเท่าไหร่</p>
      </div>

      <CancellationFilterBar
        initialPlatform={platformParam}
        initialShop={shopParam}
        initialInitiator={initiatorParam}
        initialDays={isCustomRange ? "" : daysParam}
        initialFrom={fromParam}
        initialTo={toParam}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <p className="text-xs text-gray-500 dark:text-gray-400">ยกเลิกทั้งหมด</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900 dark:text-gray-100">{stats.cancelledCount.toLocaleString()}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <p className="text-xs text-gray-500 dark:text-gray-400">อัตราการยกเลิก</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900 dark:text-gray-100">{stats.cancelRate.toFixed(1)}%</p>
          <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">จากออเดอร์ทั้งหมด {stats.totalOrders.toLocaleString()} รายการ</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <p className="text-xs text-gray-500 dark:text-gray-400">มูลค่าที่เสียไป</p>
          <p className="mt-1 text-2xl font-semibold text-red-600 dark:text-red-400">฿{baht(stats.cancelledAmount)}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <p className="text-xs text-gray-500 dark:text-gray-400">เหตุผลอันดับ 1</p>
          <p className="mt-1 truncate text-base font-semibold text-gray-900 dark:text-gray-100">
            {stats.byReason[0]?.label ?? "—"}
          </p>
          <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
            {stats.byReason[0] ? `${stats.byReason[0].count.toLocaleString()} รายการ (${stats.byReason[0].share.toFixed(1)}%)` : ""}
          </p>
        </div>
      </div>

      <CancellationTrendChart data={stats.trend} granularity={stats.trendGranularity} />

      <div className="grid gap-4 lg:grid-cols-2">
        <BreakdownList
          title="แยกตามร้าน"
          rows={stats.byShop}
          note="ร้านเดียวกันใช้ชื่อต่างกันในแต่ละแพลตฟอร์ม — รวมให้แล้วตาม src/lib/shops.ts"
        />
        <BreakdownList title="แยกตามช่องทาง" rows={stats.byPlatform} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <BreakdownList title="ใครเป็นคนยกเลิก" rows={stats.byInitiator} />
        <BreakdownList
          title="เหตุผลการยกเลิก"
          rows={stats.byReason}
          note={
            stats.missingReasonCount > 0
              ? `${stats.missingReasonCount.toLocaleString()} รายการยังไม่มีเหตุผล — นำเข้าไฟล์ออเดอร์ใหม่อีกครั้งเพื่อดึงจากไฟล์`
              : undefined
          }
        />
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-700">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">รายการล่าสุด</h2>
          <p className="text-xs text-gray-400 dark:text-gray-500">แสดง {stats.recent.length} รายการล่าสุดจาก {stats.cancelledCount.toLocaleString()} รายการ</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-500 dark:bg-gray-700/40 dark:text-gray-400">
              <tr>
                <th className="px-4 py-2 font-medium">เลขออเดอร์</th>
                <th className="px-4 py-2 font-medium">ช่องทาง</th>
                <th className="px-4 py-2 font-medium">ยกเลิกโดย</th>
                <th className="px-4 py-2 font-medium">เหตุผล</th>
                <th className="px-4 py-2 text-right font-medium">มูลค่า</th>
                <th className="px-4 py-2 font-medium">วันที่สั่ง</th>
                <th className="px-4 py-2 font-medium">เวลายกเลิก</th>
              </tr>
            </thead>
            <tbody>
              {stats.recent.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">ไม่มีออเดอร์ที่ยกเลิกในช่วงนี้</td>
                </tr>
              )}
              {stats.recent.map((o) => (
                <tr key={o.id} className="border-t border-gray-100 dark:border-gray-700/60">
                  <td className="px-4 py-2">
                    <Link href={`/orders/${o.id}`} className="font-medium text-primary hover:underline">
                      {o.platformOrderId}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-gray-600 dark:text-gray-400">
                    {platformLabel[o.platform]}
                    {o.shopName ? ` · ${o.shopName}` : ""}
                  </td>
                  <td className="px-4 py-2 text-gray-600 dark:text-gray-400">
                    {o.cancelInitiator ? (initiatorLabel[o.cancelInitiator] ?? o.cancelInitiator) : "—"}
                  </td>
                  <td className="px-4 py-2 text-gray-600 dark:text-gray-400">{o.cancelReason ?? "—"}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-gray-700 dark:text-gray-300">฿{baht(o.totalAmount)}</td>
                  <td className="px-4 py-2 text-gray-500 dark:text-gray-400">{dateLabel(o.orderDate)}</td>
                  <td className="px-4 py-2 text-gray-500 dark:text-gray-400">{dateLabel(o.cancelledAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
