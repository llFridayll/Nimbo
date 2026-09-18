"use client";

import Link from "next/link";
import { useState } from "react";
import { MoreHorizontalIcon } from "@/components/icons";

export function OrderRowMenu({ orderId }: { orderId: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  return (
    <div
      className="relative"
      // Closes the menu once focus leaves the whole wrapper (button + panel)
      // rather than on every individual blur — letting focus move from the
      // toggle button to a menu item without the panel disappearing first.
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="ตัวเลือกเพิ่มเติม"
        aria-expanded={open}
        className="flex h-6 w-6 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
      >
        <MoreHorizontalIcon className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-1 w-44 rounded-md border border-gray-200 bg-white py-1 text-left shadow-lg dark:border-gray-700 dark:bg-gray-800">
          <Link
            href={`/orders/${orderId}`}
            className="block px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700"
            onClick={() => setOpen(false)}
          >
            ดูรายละเอียด
          </Link>
          <button
            type="button"
            className="block w-full px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(orderId);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              } catch {
                // clipboard access denied — silently no-op, nothing to fall back to
              }
            }}
          >
            {copied ? "คัดลอกแล้ว ✓" : "คัดลอกเลขคำสั่งซื้อ"}
          </button>
        </div>
      )}
    </div>
  );
}
