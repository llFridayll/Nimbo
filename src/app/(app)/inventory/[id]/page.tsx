import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/dal";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const TYPE_LABEL = {
  RECEIVE: { text: "รับเข้า", cls: "text-emerald-700 dark:text-emerald-400" },
  COUNT: { text: "นับสต็อก", cls: "text-sky-700 dark:text-sky-400" },
  SALE: { text: "ส่งออก", cls: "text-gray-700 dark:text-gray-300" },
  SALE_REVERSAL: { text: "คืนสต็อก", cls: "text-amber-700 dark:text-amber-400" },
} as const;

export default async function InventoryItemPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const item = await prisma.inventoryItem.findUnique({
    where: { id },
    include: { components: true, movements: { orderBy: { createdAt: "desc" }, take: 200 } },
  });
  if (!item) notFound();
  const orderIds = item.movements.map((m) => m.orderId).filter((x): x is string => Boolean(x));
  const orders = new Map(
    (await prisma.order.findMany({ where: { id: { in: orderIds } }, select: { id: true, platformOrderId: true } })).map((o) => [o.id, o.platformOrderId]),
  );
  const fmt = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 2 });

  return (
    <div className="space-y-6">
      <div>
        <Link href="/inventory" className="text-sm text-primary hover:underline">
          ← คลังสินค้า
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-gray-900 dark:text-gray-100">{item.name}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          คงเหลือ <span className="font-semibold text-gray-900 dark:text-gray-100">{fmt(item.onHand)} {item.unit}</span>
          {item.unitCost !== null && ` · ทุน ฿${fmt(item.unitCost)}/${item.unit}`}
          {item.reorderPoint !== null && ` · เตือนเมื่อเหลือ ${fmt(item.reorderPoint)}`}
        </p>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">SKU ที่ตัดจากรายการนี้</h2>
        {item.components.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">ยังไม่ผูกกับ SKU ไหน สต็อกนี้จึงยังไม่ถูกตัดตามออเดอร์</p>
        ) : (
          <ul className="flex flex-wrap gap-2 text-sm">
            {item.components.map((c) => (
              <li key={c.id} className="rounded border border-gray-200 bg-white px-2 py-1 dark:border-gray-700 dark:bg-gray-800">
                <span className="font-mono text-xs">{c.rawSku}</span> <span className="text-gray-500">→ {fmt(c.quantity)} {item.unit}/ชิ้นที่ขาย</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">ประวัติการเคลื่อนไหว (ล่าสุด 200 รายการ)</h2>
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          <table className="w-full text-sm">
            <thead className="whitespace-nowrap bg-gray-50 text-left text-xs text-gray-500 dark:bg-gray-800/60 dark:text-gray-400">
              <tr>
                <th className="px-4 py-2 font-medium">เวลา</th>
                <th className="px-4 py-2 font-medium">ประเภท</th>
                <th className="px-4 py-2 text-right font-medium">จำนวน</th>
                <th className="px-4 py-2 text-right font-medium">คงเหลือหลังจากนั้น</th>
                <th className="px-4 py-2 font-medium">รายละเอียด</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {item.movements.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-400">ยังไม่มีการเคลื่อนไหว</td>
                </tr>
              )}
              {item.movements.map((m) => (
                <tr key={m.id}>
                  <td className="whitespace-nowrap px-4 py-2 text-gray-500 dark:text-gray-400">
                    {m.createdAt.toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Bangkok" })}
                  </td>
                  <td className={`whitespace-nowrap px-4 py-2 font-medium ${TYPE_LABEL[m.type].cls}`}>{TYPE_LABEL[m.type].text}</td>
                  <td className={`whitespace-nowrap px-4 py-2 text-right tabular-nums ${m.quantity < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400"}`}>
                    {m.quantity > 0 ? "+" : ""}
                    {fmt(m.quantity)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">{fmt(m.balanceAfter)}</td>
                  <td className="px-4 py-2 text-gray-600 dark:text-gray-300">
                    {m.orderId && orders.get(m.orderId) ? (
                      <Link href={`/orders/${m.orderId}`} className="text-primary hover:underline">
                        {m.note}
                      </Link>
                    ) : (
                      m.note
                    )}
                    {m.fileName && <span className="ml-1 text-xs text-gray-400">({m.fileName})</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
