"use client";

import { useActionState, useRef, useState } from "react";
import { createInventoryItem, type NewItemState } from "@/lib/inventoryActions";

const INPUT = "rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100";

export function NewInventoryItemForm() {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(async (prev: NewItemState, fd: FormData) => {
    const r = await createInventoryItem(prev, fd);
    if (r.createdName) formRef.current?.reset();
    return r;
  }, {} as NewItemState);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800">
        + เพิ่มสินค้าในคลัง
      </button>
    );
  }
  return (
    <form ref={formRef} action={action} className="flex w-full flex-wrap items-end gap-2 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <label className="flex min-w-[14rem] flex-1 flex-col gap-1 text-xs text-gray-500">
        ชื่อสินค้า
        <input id="new-item-name" name="name" required className={INPUT} placeholder="เช่น SS 16-150-5 (2x4) 30ม." />
      </label>
      <label className="flex w-24 flex-col gap-1 text-xs text-gray-500">
        หน่วย
        <input id="new-item-unit" name="unit" defaultValue="ม้วน" className={INPUT} />
      </label>
      <label className="flex w-28 flex-col gap-1 text-xs text-gray-500">
        ทุน/หน่วย
        <input id="new-item-cost" name="unitCost" inputMode="decimal" className={INPUT} />
      </label>
      <label className="flex w-28 flex-col gap-1 text-xs text-gray-500">
        เตือนเมื่อเหลือ
        <input id="new-item-reorder" name="reorderPoint" inputMode="decimal" className={INPUT} />
      </label>
      <button type="submit" disabled={pending} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
        {pending ? "กำลังเพิ่ม…" : "เพิ่ม"}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="rounded-md px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800">
        ปิด
      </button>
      {state.error && <p className="w-full text-sm text-red-600 dark:text-red-400">{state.error}</p>}
      {state.createdName && !state.error && (
        <p className="w-full text-sm text-emerald-700 dark:text-emerald-400">
          เพิ่ม &ldquo;{state.createdName}&rdquo; แล้ว — ไปผูก SKU ได้ที่หน้าตั้งค่าการตัดสต็อก
        </p>
      )}
    </form>
  );
}
