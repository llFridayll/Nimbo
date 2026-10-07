"use client";

import { useActionState } from "react";
import {
  importCancellationFile,
  type CancellationFileOutcome,
  type CancellationImportState,
} from "@/lib/cancellationImportActions";

const initialState: CancellationImportState = {};

function FileResult({ r }: { r: CancellationFileOutcome }) {
  const isReturn = r.kind === "return";
  if (r.error) {
    return (
      <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
        <p className="font-mono text-xs opacity-70">{r.fileName}</p>
        <p className="font-medium">{r.error}</p>
        {r.foundHeaders && r.foundHeaders.length > 0 && (
          <>
            <p className="text-xs">คอลัมน์ที่เจอในไฟล์นี้ — ส่งรายการนี้ให้ผู้ดูแลระบบเพิ่มเข้าไปได้:</p>
            <ul className="max-h-40 list-inside list-disc overflow-y-auto rounded bg-white/60 px-3 py-2 text-xs dark:bg-black/20">
              {r.foundHeaders.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
      <div className="flex items-center gap-2">
        <span className="rounded bg-emerald-600/15 px-1.5 py-0.5 text-[11px] font-medium">
          {isReturn ? "รายการคืนสินค้า" : "รายการยกเลิก"}
        </span>
        <span className="truncate font-mono text-xs opacity-70">{r.fileName}</span>
      </div>
      <p className="font-medium">
        อัปเดต{isReturn ? "ข้อมูลการคืนสินค้า" : "เหตุผลการยกเลิก"} {r.updated?.toLocaleString()} ออเดอร์ (จาก{" "}
        {r.rowsInFile?.toLocaleString()} รายการในไฟล์)
        {isReturn && (r.refundTotal ?? 0) > 0
          ? ` · คืนเงินรวม ฿${(r.refundTotal ?? 0).toLocaleString("th-TH", { maximumFractionDigits: 0 })}`
          : ""}
      </p>

      <div className="rounded bg-white/60 px-3 py-2 text-xs dark:bg-black/20">
        <p className="font-medium">อ่านจากคอลัมน์:</p>
        <ul className="mt-1 space-y-0.5">
          {r.matchedHeaders?.map((m) => (
            <li key={m.field}>
              {m.field} → <span className="font-mono">{m.header}</span>
            </li>
          ))}
        </ul>
      </div>

      {(r.skippedRows ?? 0) > 0 && <p className="text-xs">ข้ามแถวที่ไม่มีเลขคำสั่งซื้อ {r.skippedRows} แถว</p>}
      {(r.noReason ?? 0) > 0 && (
        <p className="text-xs">
          มีเลขออเดอร์แต่ไม่มีข้อมูล{isReturn ? "การคืนสินค้า" : "การยกเลิก"} {r.noReason} รายการ
        </p>
      )}

      {(r.notFoundCount ?? 0) > 0 && (
        <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
          <p className="font-medium">ไม่พบในระบบ {r.notFoundCount} ออเดอร์ — ข้ามไปแล้ว</p>
          <p className="mt-1 break-all font-mono">
            {r.notFound?.join(", ")}
            {(r.notFoundCount ?? 0) > (r.notFound?.length ?? 0) ? " …" : ""}
          </p>
          <p className="mt-1">ส่วนใหญ่แปลว่าออเดอร์ยังไม่ถูกนำเข้า — ลองนำเข้าไฟล์ออเดอร์ของร้านนั้นก่อนแล้วอัปไฟล์นี้ซ้ำ</p>
        </div>
      )}

      {(r.notCancelledCount ?? 0) > 0 && (
        <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
          <p className="font-medium">
            มี {r.notCancelledCount} ออเดอร์ที่ในระบบยังไม่ได้เป็นสถานะ &quot;{isReturn ? "คืนสินค้า" : "ยกเลิก"}&quot;
          </p>
          <p className="mt-1 break-all font-mono">
            {r.notCancelledHere?.join(", ")}
            {(r.notCancelledCount ?? 0) > (r.notCancelledHere?.length ?? 0) ? " …" : ""}
          </p>
          <p className="mt-1">
            บันทึกข้อมูลให้แล้ว แต่ <span className="font-medium">ไม่ได้เปลี่ยนสถานะให้</span> — สถานะมาจากการ sync
            ถ้าเปลี่ยนตามไฟล์ ออเดอร์จะหลุดออกจากยอดขายและใบจัดส่งทันทีทั้งที่ไฟล์อาจเป็นข้อมูลเก่า
          </p>
        </div>
      )}
    </div>
  );
}

export function CancellationImportForm() {
  const [state, formAction, isPending] = useActionState(importCancellationFile, initialState);
  const totals = state.totals;

  return (
    <div className="space-y-4">
      <form
        action={formAction}
        className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 sm:flex-row sm:items-center"
      >
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
        เลือกได้หลายไฟล์พร้อมกัน (กด Cmd/Ctrl ค้างไว้ตอนเลือก) — ไฟล์ที่อ่านไม่ได้จะถูกรายงานแยก ไม่ทำให้ไฟล์อื่นตกไปด้วย
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
            {totals.failed > 0 && `, ไม่สำเร็จ ${totals.failed}`} · อัปเดตรวม {totals.updated.toLocaleString()} ออเดอร์
            {totals.notFound > 0 && `, ไม่พบในระบบ ${totals.notFound.toLocaleString()}`}
          </p>
          {state.results?.map((r) => (
            <FileResult key={r.fileName} r={r} />
          ))}
        </div>
      )}
    </div>
  );
}
