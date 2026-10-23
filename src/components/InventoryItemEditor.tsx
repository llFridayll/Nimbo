"use client";

import { useState, useTransition } from "react";
import { updateInventoryItem } from "@/lib/inventoryActions";

const INPUT =
  "w-20 rounded border border-gray-300 bg-white px-2 py-1 text-right text-sm tabular-nums text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100";

/** Admin-only inline edit of an item's unit, reorder point and unit cost. */
export function InventoryItemEditor({
  id,
  unit,
  reorderPoint,
  unitCost,
}: {
  id: string;
  unit: string;
  reorderPoint: number | null;
  unitCost: number | null;
}) {
  const [open, setOpen] = useState(false);
  const [u, setU] = useState(unit);
  const [rp, setRp] = useState(reorderPoint === null ? "" : String(reorderPoint));
  const [cost, setCost] = useState(unitCost === null ? "" : String(unitCost));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="rounded px-2 py-1 text-xs font-medium text-primary hover:bg-gray-100 dark:hover:bg-gray-800">
        ตั้งค่า
      </button>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5 text-xs">
      <label className="flex items-center gap-1">
        หน่วย
        <input id={`unit-${id}`} value={u} onChange={(e) => setU(e.target.value)} className={`${INPUT} w-16 text-left`} />
      </label>
      <label className="flex items-center gap-1">
        เตือนเมื่อเหลือ
        <input id={`rp-${id}`} inputMode="decimal" value={rp} onChange={(e) => setRp(e.target.value)} className={INPUT} />
      </label>
      <label className="flex items-center gap-1">
        ทุน/หน่วย
        <input id={`cost-${id}`} inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} className={INPUT} />
      </label>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await updateInventoryItem(id, { unit: u, reorderPoint: rp, unitCost: cost });
            if (r.error) setError(r.error);
            else {
              setError(null);
              setOpen(false);
            }
          })
        }
        className="rounded bg-primary px-2.5 py-1 font-medium text-white disabled:opacity-50"
      >
        {pending ? "บันทึก…" : "บันทึก"}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="rounded px-2 py-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800">
        ยกเลิก
      </button>
      {error && <p className="w-full text-right text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
