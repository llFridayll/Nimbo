import Link from "next/link";
import { Platform } from "@prisma/client";
import { listProductSummaries } from "@/lib/productStats";
import { PlatformBadge } from "@/components/Badges";
import { ProductsFilterBar } from "@/components/ProductsFilterBar";

export const dynamic = "force-dynamic";

interface ProductsPageProps {
  searchParams: Promise<{ q?: string; platform?: string }>;
}

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const platformParam = params.platform ?? "";
  const platform = Object.values(Platform).includes(platformParam as Platform) ? (platformParam as Platform) : undefined;

  const products = await listProductSummaries({ q: q || undefined, platform });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">สินค้าที่เคยขาย</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">คลิกเข้าไปดูประวัติราคาย้อนหลังของแต่ละ SKU</p>
      </div>

      <ProductsFilterBar initialQuery={q} initialPlatform={platformParam} />

      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        {products.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-gray-400 dark:text-gray-500">ไม่พบสินค้า</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800/60 text-left text-xs text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="px-4 py-2 font-medium">SKU</th>
                  <th className="px-4 py-2 font-medium">ชื่อสินค้า</th>
                  <th className="px-4 py-2 font-medium">ช่องทางขาย</th>
                  <th className="px-4 py-2 font-medium">ขายไปแล้ว</th>
                  <th className="px-4 py-2 font-medium">ขายล่าสุด</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {products.map((p) => (
                  <tr key={p.sku} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{p.sku}</td>
                    <td className="max-w-xs truncate px-4 py-3 text-gray-600 dark:text-gray-400" title={p.productName}>
                      {p.productName}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {p.platforms.map((pl) => (
                          <PlatformBadge key={pl} platform={pl} />
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{p.totalQuantitySold.toLocaleString()} ชิ้น</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{new Date(p.lastSoldAt).toLocaleDateString("th-TH")}</td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/products/${encodeURIComponent(p.sku)}`} className="text-sm font-medium text-indigo-600 hover:underline">
                        ดูประวัติราคา
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
