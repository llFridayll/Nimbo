"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { OrderStatus, Platform } from "@prisma/client";
import { StatusBadge, PlatformBadge } from "@/components/Badges";
import { statusLabel } from "@/lib/labels";
import { setManyOrderStatusByOrderIds } from "@/lib/orderActions";

export interface FeedEvent {
  id: string;
  orderId: string;
  platform: Platform;
  platformOrderId: string;
  shopName: string | null;
  buyerName: string | null;
  totalAmount: number;
  currency: string;
  status: OrderStatus;
  occurredAt: string;
  createdAt: string;
}

const POLL_INTERVAL_MS = 15_000;
const MAX_ITEMS = 50;
// Kept in sync with NOTABLE_EVENT_STATUSES in src/lib/events.ts — duplicated
// (rather than imported) so this client component doesn't pull in that
// server-only module's Prisma import. Narrows the feed to statuses that
// actually need a human to look, cutting out the routine happy-path
// (NEW → PENDING_SHIPMENT → SHIPPED → DELIVERED) that used to drown them out.
const NOTABLE_STATUSES = ["PROBLEM", "CANCELLED", "REFUND_REQUESTED", "RETURNED"] as const;
const ALL_STATUSES = Object.values(OrderStatus);

function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "เมื่อสักครู่";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} นาทีที่แล้ว`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ชั่วโมงที่แล้ว`;
  const days = Math.floor(hours / 24);
  return `${days} วันที่แล้ว`;
}

export function EventsFeed({ initialEvents }: { initialEvents: FeedEvent[] }) {
  const [events, setEvents] = useState(initialEvents);
  const [, forceTick] = useState(0);
  const latestCreatedAtRef = useRef(initialEvents[0]?.createdAt ?? null);

  // Selection is keyed by orderId, not event id — an order can show up as
  // more than one event row (e.g. PROBLEM then later RETURNED), and a bulk
  // status change targets the order, so both rows should reflect one shared
  // checked state instead of tracking each occurrence separately.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pendingStatus, setPendingStatus] = useState<OrderStatus | "">("");
  const [applying, startApplyTransition] = useTransition();

  useEffect(() => {
    // Re-render every 30s just to refresh the "x นาทีที่แล้ว" labels, even
    // between polls.
    const tick = setInterval(() => forceTick((n) => n + 1), 30_000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const url = latestCreatedAtRef.current
          ? `/api/events?statuses=${NOTABLE_STATUSES.join(",")}&since=${encodeURIComponent(latestCreatedAtRef.current)}`
          : `/api/events?statuses=${NOTABLE_STATUSES.join(",")}`;
        const res = await fetch(url);
        if (!res.ok) return;
        const data = (await res.json()) as { events: FeedEvent[] };
        if (cancelled || data.events.length === 0) return;

        // `since` results come oldest-first; newest-first everywhere else.
        const newest = [...data.events].reverse();
        latestCreatedAtRef.current = newest[0].createdAt;
        setEvents((prev) => [...newest, ...prev].slice(0, MAX_ITEMS));
      } catch {
        // Offline or the tab lost the tunnel — just try again next tick.
      }
    }

    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const orderIds = [...new Set(events.map((e) => e.orderId))];
  const allSelected = orderIds.length > 0 && orderIds.every((id) => selected.has(id));

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(orderIds) : new Set());
  }
  function toggleOne(orderId: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(orderId);
      else next.delete(orderId);
      return next;
    });
  }
  function applyStatus() {
    if (!pendingStatus || selected.size === 0) return;
    const targetIds = [...selected];
    const targetStatus = pendingStatus;
    startApplyTransition(async () => {
      await setManyOrderStatusByOrderIds(targetIds, targetStatus);
      // Reflect the change immediately in the feed instead of waiting for
      // the next 15s poll — the server-rendered order/problems pages behind
      // it already revalidate on their own via the action's revalidatePath.
      setEvents((prev) => prev.map((e) => (targetIds.includes(e.orderId) ? { ...e, status: targetStatus } : e)));
      setSelected(new Set());
      setPendingStatus("");
    });
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-800">
        <div>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">กิจกรรมล่าสุด</h2>
          <p className="text-xs text-gray-400 dark:text-gray-500">เฉพาะออเดอร์ที่มีปัญหา ยกเลิก ขอคืนเงิน หรือคืนสินค้า</p>
        </div>
        <span className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
          อัปเดตสด
        </span>
      </div>
      {events.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-gray-400 dark:text-gray-500">ไม่มีความเคลื่อนไหวที่ต้องสนใจตอนนี้ 🎉</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-4 py-2 dark:border-gray-800">
            <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={(e) => toggleAll(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 dark:border-gray-600"
              />
              เลือกทั้งหมด
            </label>
            <select
              value={pendingStatus}
              onChange={(e) => setPendingStatus(e.target.value as OrderStatus)}
              disabled={applying}
              aria-label="เปลี่ยนสถานะออเดอร์ที่เลือกเป็น"
              className="ml-auto rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2.5 py-1.5 text-xs text-gray-700 dark:text-gray-200 disabled:opacity-60"
            >
              <option value="">เปลี่ยนสถานะเป็น...</option>
              {ALL_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {statusLabel[s]}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={applyStatus}
              disabled={selected.size === 0 || !pendingStatus || applying}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              {applying ? "กำลังบันทึก..." : `เปลี่ยนสถานะที่เลือก${selected.size > 0 ? ` (${selected.size})` : ""}`}
            </button>
          </div>
          <ul className="max-h-[28rem] divide-y divide-gray-100 overflow-y-auto dark:divide-gray-800">
            {events.map((e) => (
              <li key={e.id} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700">
                <input
                  type="checkbox"
                  checked={selected.has(e.orderId)}
                  onChange={(ev) => toggleOne(e.orderId, ev.target.checked)}
                  aria-label="เลือกรายการนี้"
                  className="h-4 w-4 shrink-0 rounded border-gray-300 dark:border-gray-600"
                />
                <Link href={`/orders/${e.orderId}`} className="flex min-w-0 flex-1 items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <PlatformBadge platform={e.platform} />
                    <span className="truncate text-sm font-medium text-gray-800 dark:text-gray-200">
                      #{e.platformOrderId}
                    </span>
                    {e.buyerName && (
                      <span className="hidden truncate text-xs text-gray-400 dark:text-gray-500 sm:inline">
                        {e.buyerName}
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <StatusBadge status={e.status} />
                    <span className="w-20 text-right text-xs text-gray-400 dark:text-gray-500">{timeAgo(e.createdAt)}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
