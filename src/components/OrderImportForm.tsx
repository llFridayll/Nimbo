"use client";

import { useActionState } from "react";
import { importOrderFile, type OrderImportState } from "@/lib/orderImportActions";
import { platformLabel } from "@/lib/labels";

const initialState: OrderImportState = {};

export function OrderImportForm() {
  const [state, formAction, isPending] = useActionState(importOrderFile, initialState);
  const totals = state.totals;

  return (
    <div className="space-y-4">
      <form action={formAction} className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 sm:flex-row sm:items-center">
        <input
          type="file"
          name="file"
          accept=".xlsx,.xls,.csv"
          multiple
          required
          className="flex-1 text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:opacity-90 dark:text-gray-300"
        />
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? "กำลังนำเข้า..." : "นำเข้าไฟล์"}
        </button>
      </form>

      <p className="text-xs text-gray-400 dark:text-gray-500">
        เลือกได้หลายไฟล์พร้อมกัน (กด Cmd/Ctrl ค้างไว้ตอนเลือก) — แต่ละไฟล์อ่านร้านและช่องทางจากชื่อไฟล์ของตัวเอง
      </p>

      {state.error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
          {state.error}
        </p>
      )}

      {totals && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
            นำเข้า {totals.files} ไฟล์ — สำเร็จ {totals.succeeded}
            {totals.failed > 0 && `, ไม่สำเร็จ ${totals.failed}`} · รวม {totals.orderCount.toLocaleString()} ออเดอร์ (
            {totals.itemCount.toLocaleString()} รายการสินค้า)
          </p>

          {state.results?.map((r) => (
            <div
              key={r.fileName}
              className={
                r.error
                  ? "space-y-1 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400"
                  : "space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300"
              }
            >
              <p className="font-mono text-xs opacity-70">{r.fileName}</p>
              {r.error ? (
                <p>{r.error}</p>
              ) : (
                <>
                  <p>
                    {r.platform && platformLabel[r.platform]} ร้าน <span className="font-semibold">{r.shopName}</span> — นำเข้าสำเร็จ{" "}
                    {r.orderCount?.toLocaleString()} ออเดอร์ ({r.itemCount?.toLocaleString()} รายการสินค้า)
                    {(r.skippedRows ?? 0) > 0 && ` — ข้ามแถวว่าง ${r.skippedRows} แถว`}
                  </p>
                  {(r.unrecognizedStatuses?.length ?? 0) > 0 && (
                    <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                      <p className="font-medium">พบสถานะที่ระบบยังไม่รู้จัก (ถูกตั้งเป็น &quot;มีปัญหา&quot; ไว้ก่อน):</p>
                      <ul className="mt-1 list-inside list-disc">
                        {r.unrecognizedStatuses?.map((s) => (
                          <li key={s}>{s}</li>
                        ))}
                      </ul>
                      <p className="mt-1 text-xs">แจ้งข้อความนี้ให้ผู้ดูแลระบบทราบ เพื่อเพิ่มการแปลงสถานะให้ถูกต้อง</p>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
