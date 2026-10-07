import Link from "next/link";
import { Platform } from "@prisma/client";
import { BreakdownList } from "@/components/BreakdownList";
import { CancellationFilterBar } from "@/components/CancellationFilterBar";
import { getReturnStats } from "@/lib/returnStats";
import { startOfDaysAgoBangkok } from "@/lib/dateUtils";
import { platformLabel } from "@/lib/labels";

export const dynamic = "force-dynamic";

// Wider than the cancellations page's 30: returns trail the sale by weeks,
// so a 30-day window would show an almost empty report on a shop that is
// actually processing them steadily.
const DEFAULT_DAYS = "90";

interface PageProps {
  searchParams: Promise<{ platform?: string; shop?: string; days?: string; from?: string; to?: string }>;
}

function baht(n: number): string {
  return n.toLocaleString("th-TH", { maximumFractionDigits: 0 });
}

function dateLabel(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "short", timeStyle: "short" });
}

export default async function ReturnsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const platformParam = params.platform ?? "";
  const shopParam = params.shop ?? "";
  const daysParam = params.days ?? DEFAULT_DAYS;
  const fromParam = params.from ?? "";
  const toParam = params.to ?? "";
  const isCustomRange = Boolean(fromParam || toParam);

  const platform = Object.values(Platform).includes(platformParam as Platform) ? (platformParam as Platform) : undefined;

  let fromDate: Date;
  let toDate: Date;
  if (isCustomRange) {
    fromDate = fromParam ? new Date(`${fromParam}T00:00:00+07:00`) : startOfDaysAgoBangkok(89);
    toDate = toParam ? new Date(`${toParam}T23:59:59+07:00`) : new Date();
  } else if (daysParam === "today") {
    fromDate = startOfDaysAgoBangkok(0);
    toDate = new Date();
  } else {
    const days = Number(daysParam);
    fromDate = startOfDaysAgoBangkok(Number.isFinite(days) && days > 0 ? days - 1 : 89);
    toDate = new Date();
  }

  const stats = await getReturnStats({ fromDate, toDate, platform, shop: shopParam || undefined });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">การคืนสินค้า</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          สินค้าที่ลูกค้าส่งคืนหลังได้รับแล้ว — คนละเรื่องกับ
          <Link href="/cancellations" className="mx-1 text-primary hover:underline">
            การยกเลิกออเดอร์
          </Link>
          ซึ่งเกิดก่อนจัดส่ง
        </p>
      </div>

      <CancellationFilterBar
        initialPlatform={platformParam}
        initialShop={shopParam}
        initialInitiator=""
        initialDays={isCustomRange ? "" : daysParam}
        initialFrom={fromParam}
        initialTo={toParam}
        basePath="/returns"
        showInitiator={false}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <p className="text-xs text-gray-500 dark:text-gray-400">คืนสินค้า</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900 dark:text-gray-100">{stats.returnCount.toLocaleString()}</p>
          <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">รายการในช่วงนี้</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <p className="text-xs text-gray-500 dark:text-gray-400">ยอดเงินคืน</p>
          <p className="mt-1 text-2xl font-semibold text-red-600 dark:text-red-400">฿{baht(stats.refundTotal)}</p>
          <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">ที่แพลตฟอร์มคืนให้ลูกค้าจริง</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <p className="text-xs text-gray-500 dark:text-gray-400">อัตราการคืน</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900 dark:text-gray-100">{stats.returnRate.toFixed(2)}%</p>
          <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
            เทียบออเดอร์ที่สั่งในช่วงเดียวกัน {stats.totalOrders.toLocaleString()} รายการ
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <p className="text-xs text-gray-500 dark:text-gray-400">เหตุผลอันดับ 1</p>
          <p className="mt-1 truncate text-base font-semibold text-gray-900 dark:text-gray-100" title={stats.byReason[0]?.label}>
            {stats.byReason[0]?.label ?? "—"}
          </p>
          <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
            {stats.byReason[0] ? `${stats.byReason[0].count.toLocaleString()} รายการ (${stats.byReason[0].share.toFixed(1)}%)` : ""}
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <BreakdownList title="แยกตามร้าน" rows={stats.byShop} />
        <BreakdownList title="แยกตามช่องทาง" rows={stats.byPlatform} />
      </div>

      <BreakdownList
        title="เหตุผลการคืนสินค้า"
        rows={stats.byReason}
        note="ตัวเลขเงินคือยอดที่คืนให้ลูกค้าจริง ไม่ใช่มูลค่าออเดอร์เต็ม"
      />

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-700">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">รายการล่าสุด</h2>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            แสดง {stats.recent.length} รายการล่าสุดจาก {stats.returnCount.toLocaleString()} รายการ
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-500 dark:bg-gray-700/40 dark:text-gray-400">
              <tr>
                <th className="px-4 py-2 font-medium">เลขออเดอร์</th>
                <th className="px-4 py-2 font-medium">ช่องทาง</th>
                <th className="px-4 py-2 font-medium">เหตุผลการคืน</th>
                <th className="px-4 py-2 text-right font-medium">มูลค่าออเดอร์</th>
                <th className="px-4 py-2 text-right font-medium">คืนเงิน</th>
                <th className="px-4 py-2 font-medium">วันที่สั่ง</th>
                <th className="px-4 py-2 font-medium">วันที่คืน</th>
              </tr>
            </thead>
            <tbody>
              {stats.recent.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                    ไม่มีรายการคืนสินค้าในช่วงนี้ — อัปไฟล์รายการคืนสินค้าที่หน้า &quot;นำเข้ารายการยกเลิก / คืนสินค้า&quot;
                  </td>
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
                  <td className="px-4 py-2 text-gray-600 dark:text-gray-400">{o.returnReason ?? "—"}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-gray-700 dark:text-gray-300">฿{baht(o.totalAmount)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-red-600 dark:text-red-400">
                    {o.refundAmount === null ? "—" : `฿${baht(o.refundAmount)}`}
                  </td>
                  <td className="px-4 py-2 text-gray-500 dark:text-gray-400">{dateLabel(o.orderDate)}</td>
                  <td className="px-4 py-2 text-gray-500 dark:text-gray-400">{dateLabel(o.returnedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
