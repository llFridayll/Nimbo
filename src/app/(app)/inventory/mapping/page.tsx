import Link from "next/link";
import { requireAdmin } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { listSkuMappings } from "@/lib/inventory";
import { SkuComponentEditor } from "@/components/SkuComponentEditor";
import { AutoMapButton } from "@/components/AutoMapButton";

export const dynamic = "force-dynamic";

export default async function InventoryMappingPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  await requireAdmin();
  const { show } = await searchParams;
  const [groups, items] = await Promise.all([
    listSkuMappings(),
    prisma.inventoryItem.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, unit: true } }),
  ]);
  const unmappedOnly = show !== "all";
  const visible = unmappedOnly ? groups.filter((g) => g.components.length === 0) : groups;
  const mappedCount = groups.filter((g) => g.components.length > 0).length;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/inventory" className="text-sm text-primary hover:underline">
          ← คลังสินค้า
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-gray-900 dark:text-gray-100">ตั้งค่าการตัดสต็อก</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          บอกระบบว่าสินค้าที่ขาย 1 ชิ้น ตัดสินค้าในคลังตัวไหนกี่หน่วย เช่น หลังคาถุงละ 16 แผ่น = แผ่นหลังคา × 16 · ชุดที่มีหลายอย่างก็เพิ่มได้หลายแถว
        </p>
      </div>

      {items.length === 0 ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          ยังไม่มีสินค้าในคลัง ให้<Link href="/admin/inventory-import" className="font-medium underline">นำเข้าไฟล์สต็อก</Link>ก่อน แล้วค่อยกลับมาผูก
        </p>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1 rounded-md border border-gray-300 p-0.5 text-sm dark:border-gray-600">
            <Link href="/inventory/mapping" className={`rounded px-3 py-1 ${unmappedOnly ? "bg-primary text-white" : "text-gray-600 dark:text-gray-300"}`}>
              ยังไม่ผูก ({groups.length - mappedCount})
            </Link>
            <Link href="/inventory/mapping?show=all" className={`rounded px-3 py-1 ${!unmappedOnly ? "bg-primary text-white" : "text-gray-600 dark:text-gray-300"}`}>
              ทั้งหมด ({groups.length})
            </Link>
          </div>
          <AutoMapButton />
        </div>
      )}

      {items.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          <table className="w-full text-sm">
            <thead className="whitespace-nowrap bg-gray-50 text-left text-xs text-gray-500 dark:bg-gray-800/60 dark:text-gray-400">
              <tr>
                <th className="px-4 py-2 font-medium">สินค้าที่ขาย (ชื่อในระบบ)</th>
                <th className="px-4 py-2 text-right font-medium">ขายใน 180 วัน</th>
                <th className="min-w-[22rem] px-4 py-2 text-right font-medium">ตัดสต็อกจาก</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {visible.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-gray-400">ผูกครบทุกสินค้าแล้ว</td>
                </tr>
              )}
              {visible.map((g) => (
                <tr key={g.displaySku} className="align-top">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900 dark:text-gray-100">{g.displaySku}</p>
                    <p className="max-w-md truncate text-xs text-gray-400" title={g.productName}>
                      {g.productName}
                    </p>
                    {g.rawSkus.length > 1 && <p className="text-xs text-gray-400">รวม {g.rawSkus.length} SKU: {g.rawSkus.join(", ")}</p>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-gray-600 dark:text-gray-300">{g.soldQuantity.toLocaleString()} ชิ้น</td>
                  <td className="px-4 py-3">
                    <SkuComponentEditor rawSkus={g.rawSkus} initial={g.components} items={items} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
