"use client";

import { useState, useTransition } from "react";
import { OrderStatus } from "@prisma/client";
import { setOrderStatus } from "@/lib/orderActions";
import { statusLabel, statusColor } from "@/lib/labels";

const ALL_STATUSES = Object.values(OrderStatus);

export function OrderStatusEditor({ orderId, status }: { orderId: string; status: OrderStatus }) {
  const [current, setCurrent] = useState(status);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleChange(next: OrderStatus) {
    if (next === current) return;
    const previous = current;
    setCurrent(next); // optimistic — revert if the write fails
    setError(null);
    startTransition(async () => {
      try {
        await setOrderStatus(orderId, next);
      } catch {
        setCurrent(previous);
        setError("เปลี่ยนสถานะไม่สำเร็จ ลองใหม่อีกครั้ง");
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={current}
        disabled={pending}
        onChange={(e) => handleChange(e.target.value as OrderStatus)}
        aria-label="เปลี่ยนสถานะออเดอร์"
        className={`rounded-full border px-2.5 py-0.5 text-xs font-medium disabled:opacity-60 ${statusColor[current]}`}
      >
        {ALL_STATUSES.map((s) => (
          <option key={s} value={s}>
            {statusLabel[s]}
          </option>
        ))}
      </select>
      {pending && <span className="text-xs text-gray-400 dark:text-gray-500">กำลังบันทึก...</span>}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
