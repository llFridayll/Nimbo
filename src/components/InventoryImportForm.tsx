"use client";

import { useActionState } from "react";
import { importStockFile, type InventoryImportState } from "@/lib/inventoryActions";

export function InventoryImportForm() {
  const [state, action, pending] = useActionState(importStockFile, {} as InventoryImportState);
  return (
    <div className="space-y-4">
      <form action={action} className="space-y-4 rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-gray-800 dark:text-gray-200">ไฟล์นี้คือ</legend>
          <label className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input type="radio" name="mode" value="receive" defaultChecked className="mt-1" />
            <span>
              <b>รับของเข้า</b> — บวกจำนวนในไฟล์เพิ่มเข้าไปในสต็อก
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input type="radio" name="mode" value="count" className="mt-1" />
            <span>
              <b>ยอดนับจริง</b> — ตั้งสต็อกเป็นจำนวนในไฟล์ (ใช้ตอนเริ่มต้น หรือหลังนับของทั้งคลัง)
            </span>
          </label>
        </fieldset>
        <input
          id="stock-file"
          type="file"
          name="file"
          accept=".xlsx,.xls,.csv"
          required
          className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-gray-100 file:px-3 file:py-2 file:text-sm file:font-medium dark:text-gray-300 dark:file:bg-gray-700"
        />
        <button type="submit" disabled={pending} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
          {pending ? "กำลังนำเข้า…" : "นำเข้า"}
        </button>
      </form>

      {state.error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
          {state.fileName && <p className="font-mono text-xs opacity-70">{state.fileName}</p>}
          <p className="font-medium">{state.error}</p>
          {state.ignoredColumns && state.ignoredColumns.length > 0 && <p className="mt-1 text-xs">คอลัมน์ที่เจอ: {state.ignoredColumns.join(", ")}</p>}
        </div>
      )}
      {state.result && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
          <p className="font-mono text-xs opacity-70">{state.fileName}</p>
          <p className="font-medium">
            {state.mode === "receive" ? "รับเข้า" : "ปรับยอดตามที่นับ"} {state.result.moved} รายการ จาก {state.rows} แถว
          </p>
          <ul className="mt-1 list-inside list-disc text-xs">
            {state.result.created > 0 && (
              <li>
                สร้างสินค้าใหม่ในคลัง {state.result.created} รายการ
                {(state.mappedSkus ?? 0) === 0 && " — อย่าลืมไปผูกกับ SKU ที่หน้าตั้งค่าการตัดสต็อก"}
              </li>
            )}
            {state.result.updated > 0 && <li>อัปเดตหน่วย/ต้นทุน/จุดสั่งซื้อ {state.result.updated} รายการ</li>}
            {state.result.skipped > 0 && <li>ข้าม {state.result.skipped} แถวที่ไม่มีจำนวน</li>}
            {(state.mappedSkus ?? 0) > 0 && (
              <li>
                ผูก SKU ที่ขายกับคลัง {state.mappedSkus} SKU
                {(state.reconciled ?? 0) > 0 && ` · คำนวณสต็อกใหม่ ${state.reconciled} ออเดอร์`}
              </li>
            )}
          </ul>
          {state.ignoredColumns && state.ignoredColumns.length > 0 && <p className="mt-1 text-xs">ไม่ได้ใช้คอลัมน์: {state.ignoredColumns.join(", ")}</p>}
        </div>
      )}
    </div>
  );
}
