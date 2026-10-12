"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import type { AnnouncementView } from "@/lib/announcements";
import { closeAnnouncement } from "@/lib/announcementActions";
import { formatRelativeThai } from "@/lib/dateUtils";
import {
  ANNOUNCEMENT_LEVEL_LABEL,
  ANNOUNCEMENT_LEVEL_STYLE,
  ANNOUNCEMENTS_CHANGED_EVENT,
} from "@/lib/announcementLevels";

// Slower than chat: a notice only has to reach people within a minute or so.
// Paused while the tab is hidden, like ChatWidget, to spare the small pool.
const POLL_MS = 30_000;
// Past this the strip starts pushing the page itself off screen.
const MAX_VISIBLE = 3;

export function AnnouncementBar({ initial }: { initial: AnnouncementView[] }) {
  const [items, setItems] = useState(initial);
  const [, startTransition] = useTransition();

  const refetch = useCallback(async () => {
    try {
      const res = await fetch("/api/announcements");
      if (!res.ok) return;
      const data = (await res.json()) as { announcements: AnnouncementView[] };
      setItems(data.announcements);
    } catch {
      // Network blip — keep showing what we have; the next poll retries.
    }
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void refetch();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refetch();
    };
    const onChanged = () => void refetch();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(ANNOUNCEMENTS_CHANGED_EVENT, onChanged);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(ANNOUNCEMENTS_CHANGED_EVENT, onChanged);
    };
  }, [refetch]);

  function handleClose(id: string) {
    setItems((prev) => prev.filter((a) => a.id !== id)); // optimistic
    startTransition(async () => {
      try {
        await closeAnnouncement(id);
      } finally {
        await refetch();
      }
    });
  }

  if (items.length === 0) return null;
  const hidden = items.length - MAX_VISIBLE;

  return (
    <div className="print:hidden mb-6 space-y-2">
      {items.slice(0, MAX_VISIBLE).map((a) => {
        const style = ANNOUNCEMENT_LEVEL_STYLE[a.level];
        return (
          <div key={a.id} className={`flex items-start gap-3 rounded-lg border px-4 py-2.5 text-sm ${style.strip}`}>
            <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold ${style.badge}`}>
              {ANNOUNCEMENT_LEVEL_LABEL[a.level]}
            </span>
            <div className="min-w-0 flex-1">
              <p className="whitespace-pre-wrap break-words">{a.message}</p>
              <p className="mt-0.5 text-xs opacity-70" suppressHydrationWarning>
                {a.authorName} · {formatRelativeThai(new Date(a.createdAt))}
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleClose(a.id)}
              title="ปิดประกาศนี้สำหรับทุกคน"
              className="shrink-0 rounded-md border border-current/20 bg-white/60 px-2.5 py-1 text-xs font-medium hover:bg-white dark:bg-black/20 dark:hover:bg-black/40"
            >
              เสร็จแล้ว
            </button>
          </div>
        );
      })}
      {hidden > 0 && (
        <Link href="/announcements" className="block text-right text-xs font-medium text-gray-500 hover:underline dark:text-gray-400">
          ดูประกาศอีก {hidden} รายการ →
        </Link>
      )}
    </div>
  );
}
