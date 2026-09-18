import Link from "next/link";
import { notFound } from "next/navigation";
import { getProductPriceHistory } from "@/lib/productStats";
import { PlatformBadge } from "@/components/Badges";
import { PriceHistoryChart, ChartPricePoint } from "@/components/PriceHistoryChart";

export const dynamic = "force-dynamic";

interface ProductDetailPageProps {
  params: Promise<{ sku: string }>;
}

function formatBaht(n: number): string {
  return n.toLocaleString("th-TH", { maximumFractionDigits: 0 });
}

export default async function ProductDetailPage({ params }: ProductDetailPageProps) {
  const { sku: encodedSku } = await params;
  const sku = decodeURIComponent(encodedSku);
  const history = await getProductPriceHistory(sku);

  if (history.length === 0) notFound();

  const prices = history.map((p) => p.unitPrice);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const totalQuantity = history.reduce((sum, p) => sum + p.quantity, 0);
  // Most recent sales first for both the header's product name and the transaction table below.
  const recentFirst = [...history].sort((a, b) => b.orderDate.getTime() - a.orderDate.getTime());

  const chartPoints: ChartPricePoint[] = history.map((p) => ({
    orderDate: p.orderDate.toISOString(),
    unitPrice: p.unitPrice,
    quantity: p.quantity,
    platform: p.platform,
  }));

  return (
    <div className="space-y-6">
      <div>
        <Link href="/products" className="text-sm text-gray-500 dark:text-gray-400 hover:underline">
          &larr; กลับไปหน้าสินค้า
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-gray-900 dark:text-gray-100">{recentFirst[0].productName}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">SKU: {sku}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400">ราคาล่าสุด</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900 dark:text-gray-100">฿{formatBaht(recentFirst[0].unitPrice)}</p>
        </div>
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400">ช่วงราคาที่เคยขาย</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900 dark:text-gray-100">
            {minPrice === maxPrice ? `฿${formatBaht(minPrice)}` : `฿${formatBaht(minPrice)} - ฿${formatBaht(maxPrice)}`}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400">ขายไปแล้วรวม</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900 dark:text-gray-100">{totalQuantity.toLocaleString()} ชิ้น</p>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">ประวัติราคา</p>
        <PriceHistoryChart points={chartPoints} />
      </div>

      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="border-b border-gray-100 dark:border-gray-800 px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">รายการขายทั้งหมด</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800/60 text-left text-xs text-gray-500 dark:text-gray-400">
              <tr>
                <th className="px-4 py-2 font-medium">วันที่</th>
                <th className="px-4 py-2 font-medium">ช่องทางขาย</th>
                <th className="px-4 py-2 font-medium">Order</th>
                <th className="px-4 py-2 font-medium">ราคาเต็ม</th>
                <th className="px-4 py-2 font-medium">ราคาที่ขายจริง</th>
                <th className="px-4 py-2 font-medium">จำนวน</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {recentFirst.map((p, i) => (
                <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{p.orderDate.toLocaleDateString("th-TH")}</td>
                  <td className="px-4 py-3">
                    <PlatformBadge platform={p.platform} />
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/orders/${p.orderId}`} className="font-medium text-gray-900 dark:text-gray-100 hover:underline">
                      #{p.platformOrderId}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-400 dark:text-gray-500 line-through">
                    {p.originalUnitPrice != null ? `฿${formatBaht(p.originalUnitPrice)}` : "-"}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">฿{formatBaht(p.unitPrice)}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{p.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
