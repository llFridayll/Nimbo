import Link from "next/link";
import { requireAdmin } from "@/lib/dal";
import { getInventoryOverview, type StockLevel } from "@/lib/inventory";
import { InventoryItemEditor } from "@/components/InventoryItemEditor";
import { NewInventoryItemForm } from "@/components/NewInventoryItemForm";

export const dynamic = "force-dynamic";

const LEVEL: Record<StockLevel, { text: string; cls: string }> = {
  out: {
    text: "หมด",
    cls: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  },
  low: {
    text: "ใกล้หมด",
    cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  },
  ok: {
    text: "พอ",
    cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  },
  untracked: {
    text: "ยังไม่ผูก SKU",
    cls: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300",
  },
};

function fmt(n: number) {
  return n.toLocaleString("th-TH", { maximumFractionDigits: 2 });
}

export default async function InventoryPage() {
  // Stock levels, costs and stock value are admin-only.
  await requireAdmin();
  const o = await getInventoryOverview();
  // Problems first: short today, then out, then low, then the rest by name.
  const rank = (r: (typeof o.rows)[number]) =>
    r.shortToday > 0
      ? 0
      : r.level === "out"
        ? 1
        : r.level === "low"
          ? 2
          : r.level === "untracked"
            ? 4
            : 3;
  const rows = [...o.rows].sort(
    (a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, "th"),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            คลังสินค้า
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            สต็อกถูกตัดเมื่อออเดอร์ได้เลขพัสดุ
            และคืนให้เมื่อออเดอร์ถูกยกเลิกหรือคืนสินค้า
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <Link
            href="/inventory/count"
            className="rounded-md bg-primary px-3 py-2 font-medium text-white hover:opacity-90"
          >
            กรอกสต็อก
          </Link>
          <Link
            href="/admin/inventory-import"
            className="rounded-md border border-gray-300 px-3 py-2 font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            นำเข้าไฟล์สต็อก
          </Link>
          <Link
            href="/inventory/mapping"
            className="rounded-md border border-gray-300 px-3 py-2 font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            ตั้งค่าการตัดสต็อก
          </Link>
        </div>
      </div>

      <NewInventoryItemForm />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          {
            label: "มูลค่าสต็อก",
            value: `฿${o.totalValue.toLocaleString("th-TH", { maximumFractionDigits: 0 })}`,
            note: "เฉพาะรายการที่ใส่ต้นทุนแล้ว",
          },
          { label: "รายการในคลัง", value: fmt(o.rows.length), note: null },
          {
            label: "ใกล้หมด / หมด",
            value: fmt(o.lowCount),
            note: null,
            warn: o.lowCount > 0,
          },
          {
            label: "ไม่พอส่งวันนี้",
            value: fmt(o.shortTodayCount),
            note: "เทียบกับใบจัดส่งวันนี้",
            danger: o.shortTodayCount > 0,
          },
        ].map((t) => (
          <div
            key={t.label}
            className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
          >
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {t.label}
            </p>
            <p
              className={`mt-1 text-2xl font-semibold tabular-nums ${t.danger ? "text-red-600 dark:text-red-400" : t.warn ? "text-amber-600 dark:text-amber-400" : "text-gray-900 dark:text-gray-100"}`}
            >
              {t.value}
            </p>
            {t.note && (
              <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
                {t.note}
              </p>
            )}
          </div>
        ))}
      </div>

      {o.unmappedToday.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <p className="font-medium">
            สินค้าในใบจัดส่งวันนี้ที่ยังไม่ได้ผูกกับคลัง (
            {o.unmappedToday.length}) — จะไม่ถูกตัดสต็อก
          </p>
          <p className="mt-1 text-xs">{o.unmappedToday.join(" · ")}</p>
          <Link
            href="/inventory/mapping"
            className="mt-1 inline-block text-xs font-medium underline"
          >
            ไปตั้งค่าการตัดสต็อก
          </Link>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 px-6 py-12 text-center dark:border-gray-700">
          <p className="font-medium text-gray-700 dark:text-gray-300">
            ยังไม่มีสินค้าในคลัง
          </p>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            กด &ldquo;เพิ่มสินค้าในคลัง&rdquo; ด้านบน
            หรือนำเข้าไฟล์ตั้งต้นทีเดียวทั้งชุด แล้วไปกรอกจำนวนที่หน้า
            &ldquo;กรอกสต็อก&rdquo;
          </p>
          <Link
            href="/admin/inventory-import"
            className="mt-3 inline-block rounded-md bg-primary px-3 py-2 text-sm font-medium text-white"
          >
            ไปหน้านำเข้าไฟล์สต็อก
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          <table className="w-full text-sm">
            <thead className="whitespace-nowrap bg-gray-50 text-left text-xs text-gray-500 dark:bg-gray-800/60 dark:text-gray-400">
              <tr>
                <th className="px-4 py-2 font-medium">สินค้าในคลัง</th>
                <th className="px-4 py-2 font-medium">สถานะ</th>
                <th className="px-4 py-2 text-right font-medium">คงเหลือ</th>
                <th className="px-4 py-2 text-right font-medium">
                  ต้องส่งวันนี้
                </th>
                <th className="px-4 py-2 text-right font-medium">
                  เตือนเมื่อเหลือ
                </th>
                <th className="px-4 py-2 text-right font-medium">มูลค่า</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className={
                    r.shortToday > 0
                      ? "bg-red-50/60 dark:bg-red-950/20"
                      : undefined
                  }
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/inventory/${r.id}`}
                      className="font-medium text-gray-900 hover:underline dark:text-gray-100"
                    >
                      {r.name}
                    </Link>
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      ผูกกับ {r.skuCount} SKU
                    </p>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${LEVEL[r.level].cls}`}
                    >
                      {LEVEL[r.level].text}
                    </span>
                    {r.shortToday > 0 && (
                      <span className="ml-1.5 rounded-full bg-red-600 px-2 py-0.5 text-xs font-medium text-white">
                        ขาด {fmt(r.shortToday)} {r.unit}
                      </span>
                    )}
                  </td>
                  <td
                    className={`whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums ${r.onHand < 0 ? "text-red-600 dark:text-red-400" : "text-gray-900 dark:text-gray-100"}`}
                  >
                    {fmt(r.onHand)}{" "}
                    <span className="font-normal text-gray-500 dark:text-gray-400">
                      {r.unit}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-gray-600 dark:text-gray-300">
                    {r.neededToday ? fmt(r.neededToday) : "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-gray-600 dark:text-gray-300">
                    {r.reorderPoint === null ? "—" : fmt(r.reorderPoint)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-gray-600 dark:text-gray-300">
                    {r.value === null
                      ? "—"
                      : `฿${r.value.toLocaleString("th-TH", { maximumFractionDigits: 0 })}`}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <InventoryItemEditor
                      id={r.id}
                      unit={r.unit}
                      reorderPoint={r.reorderPoint}
                      unitCost={r.unitCost}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-gray-400 dark:text-gray-500">
        &ldquo;ต้องส่งวันนี้&rdquo; คือสินค้าในใบจัดส่งวันนี้ที่ยังไม่มีเลขพัสดุ
        ซึ่งจะถูกตัดสต็อกเมื่อเลขพัสดุเข้ามา
      </p>
    </div>
  );
}
