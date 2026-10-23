"use client";

import { useState, useTransition } from "react";
import { autoMapByName } from "@/lib/inventoryActions";

export function AutoMapButton() {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(async () => setMsg(`ผูกให้แล้ว ${(await autoMapByName()).mapped} สินค้า`))}
        className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
      >
        {pending ? "กำลังผูก…" : "ผูกอัตโนมัติ (ชื่อตรงกัน × 1)"}
      </button>
      {msg && <span className="text-sm text-emerald-700 dark:text-emerald-400">{msg}</span>}
    </div>
  );
}
