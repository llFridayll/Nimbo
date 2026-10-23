"use client";

import { useState, useTransition } from "react";
import { setSkuComponents } from "@/lib/inventoryActions";

interface Item {
  id: string;
  name: string;
  unit: string;
}

/** Sets which stock items one product takes off the shelf, and how many of
 * each per unit sold — e.g. a bag SKU = 16 แผ่น of the roof-sheet item. */
export function SkuComponentEditor({
  rawSkus,
  initial,
  items,
}: {
  rawSkus: string[];
  initial: { inventoryItemId: string; quantity: number }[];
  items: Item[];
}) {
  const [rows, setRows] = useState(initial.length ? initial.map((r) => ({ id: r.inventoryItemId, qty: String(r.quantity) })) : []);
  const [editing, setEditing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const byId = new Map(items.map((i) => [i.id, i]));

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center justify-end gap-2">
        {initial.length === 0 ? (
          <span className="text-xs text-gray-400">ไม่ตัดสต็อก</span>
        ) : (
          initial.map((c) => (
            <span key={c.inventoryItemId} className="rounded bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
              {byId.get(c.inventoryItemId)?.name ?? "?"} × {c.quantity.toLocaleString("th-TH")} {byId.get(c.inventoryItemId)?.unit}
            </span>
          ))
        )}
        <button type="button" onClick={() => setEditing(true)} className="rounded px-2 py-1 text-xs font-medium text-primary hover:bg-gray-100 dark:hover:bg-gray-800">
          แก้ไข
        </button>
        {msg && <span className="w-full text-right text-xs text-emerald-700 dark:text-emerald-400">{msg}</span>}
      </div>
    );
  }

  const select =
    "min-w-0 flex-1 rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100";
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-2">
          <select
            id={`comp-${rawSkus[0]}-${i}`}
            aria-label="สินค้าในคลัง"
            value={r.id}
            onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, id: e.target.value } : x)))}
            className={select}
          >
            <option value="">เลือกสินค้าในคลัง…</option>
            {items.map((it) => (
              <option key={it.id} value={it.id}>
                {it.name}
              </option>
            ))}
          </select>
          <span className="text-xs text-gray-500">×</span>
          <input
            id={`qty-${rawSkus[0]}-${i}`}
            aria-label="จำนวนต่อชิ้นที่ขาย"
            inputMode="decimal"
            value={r.qty}
            onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))}
            className="w-16 rounded border border-gray-300 bg-white px-2 py-1 text-right text-sm tabular-nums text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          />
          <span className="w-10 text-xs text-gray-500">{byId.get(r.id)?.unit ?? ""}</span>
          <button type="button" onClick={() => setRows(rows.filter((_, j) => j !== i))} className="text-xs text-red-600 hover:underline">
            ลบ
          </button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setRows([...rows, { id: "", qty: "1" }])} className="rounded border border-dashed border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300">
          + เพิ่มสินค้าในคลัง
        </button>
        <span className="flex-1" />
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const r = await setSkuComponents(
                rawSkus,
                rows.map((x) => ({ inventoryItemId: x.id, quantity: Number(x.qty) })),
              );
              if (r.error) setMsg(r.error);
              else {
                setMsg(r.reconciled ? `บันทึกแล้ว · คำนวณสต็อกใหม่ ${r.reconciled} ออเดอร์` : "บันทึกแล้ว");
                setEditing(false);
              }
            })
          }
          className="rounded bg-primary px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
        >
          {pending ? "กำลังบันทึก…" : "บันทึก"}
        </button>
        <button type="button" onClick={() => setEditing(false)} className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800">
          ยกเลิก
        </button>
      </div>
    </div>
  );
}
