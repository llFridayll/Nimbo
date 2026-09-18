"use client";

import { useState, useTransition } from "react";
import { resetLineTarget } from "@/lib/lineTargetActions";

export function ResetLineTargetButton({ disabled }: { disabled: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleReset() {
    if (!confirm("รีเซ็ตกลุ่ม LINE ปลายทางใช่ไหม? หลังจากนี้กลุ่มเดิมจะไม่ได้รับสรุปออเดอร์อีกจนกว่าจะส่งข้อความเข้าบอทใหม่")) return;
    setError(null);
    startTransition(async () => {
      try {
        await resetLineTarget();
      } catch (err) {
        setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
      }
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleReset}
        disabled={disabled || isPending}
        className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
      >
        {isPending ? "กำลังรีเซ็ต..." : "รีเซ็ตกลุ่ม LINE ปลายทาง"}
      </button>
      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
