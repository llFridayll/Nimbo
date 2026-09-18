"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RefreshCwIcon } from "@/components/icons";

export function SyncButton({ lastUpdatedLabel }: { lastUpdatedLabel?: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSync() {
    setLoading(true);
    try {
      await fetch("/api/sync", { method: "POST" });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleSync}
      disabled={loading}
      className="flex items-center gap-2.5 rounded-xl border border-gray-100 bg-white px-3.5 py-2 text-left shadow-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700"
    >
      <RefreshCwIcon className={`h-5 w-5 shrink-0 text-accent ${loading ? "animate-spin" : ""}`} />
      <span className="leading-tight">
        <span className="block text-sm font-semibold text-gray-900 dark:text-gray-100">
          {loading ? "กำลังอัปเดต..." : "อัปเดตข้อมูลทุกช่องทาง"}
        </span>
        {lastUpdatedLabel && <span className="block text-xs text-gray-400 dark:text-gray-500">อัปเดตล่าสุด {lastUpdatedLabel}</span>}
      </span>
    </button>
  );
}
