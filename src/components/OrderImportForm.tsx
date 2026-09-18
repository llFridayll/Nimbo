"use client";

import { useActionState } from "react";
import { importOrderFile, type OrderImportState } from "@/lib/orderImportActions";
import { platformLabel } from "@/lib/labels";

const initialState: OrderImportState = {};

export function OrderImportForm() {
  const [state, formAction, isPending] = useActionState(importOrderFile, initialState);

  return (
    <div className="space-y-4">
      <form action={formAction} className="flex flex-col gap-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 sm:flex-row sm:items-center">
        <input
          type="file"
          name="file"
          accept=".xlsx,.xls,.csv"
          required
          className="flex-1 text-sm text-gray-700 dark:text-gray-300 file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:opacity-90"
        />
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? "กำลังนำเข้า..." : "นำเข้าไฟล์"}
        </button>
      </form>

      {state.error && (
        <p className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {state.error}
        </p>
      )}

      {state.result && (
        <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-300">
          <p>
            {platformLabel[state.result.platform]} ร้าน <span className="font-semibold">{state.result.shopName}</span> — นำเข้าสำเร็จ{" "}
            {state.result.orderCount} ออเดอร์ ({state.result.itemCount} รายการสินค้า)
            {state.result.skippedRows > 0 && ` — ข้ามแถวว่าง ${state.result.skippedRows} แถว`}
          </p>
          {state.result.unrecognizedStatuses.length > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-3 py-2 text-amber-800 dark:text-amber-300">
              <p className="font-medium">พบสถานะที่ระบบยังไม่รู้จัก (ถูกตั้งเป็น &quot;มีปัญหา&quot; ไว้ก่อน):</p>
              <ul className="mt-1 list-inside list-disc">
                {state.result.unrecognizedStatuses.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
              <p className="mt-1 text-xs">แจ้งข้อความนี้ให้ผู้ดูแลระบบทราบ เพื่อเพิ่มการแปลงสถานะให้ถูกต้อง</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
