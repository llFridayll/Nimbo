"use client";

import { useActionState, useState, useTransition } from "react";
import {
  sendShippingSummaryToLine,
  getShippingSummaryPreviewItems,
  previewShippingSummaryLineMessages,
  type SendLineSummaryState,
  type ShippingPreviewItem,
} from "@/lib/shippingSummaryActions";
import { ExportSummaryButton } from "@/components/ExportSummaryButton";
import { ShippingItemExclusionList } from "@/components/ShippingItemExclusionList";
import { PreviewDialog, DialogLoadingState } from "@/components/PreviewDialog";
import { MessageCircleIcon } from "@/components/icons";

const initialState: SendLineSummaryState = {};

export function SendLineSummaryButton({ date }: { date: string }) {
  const [state, formAction, isSending] = useActionState(sendShippingSummaryToLine, initialState);
  const [isLoading, startTransition] = useTransition();
  const [isOpen, setIsOpen] = useState(false);
  const [tab, setTab] = useState<"items" | "preview">("items");
  const [items, setItems] = useState<ShippingPreviewItem[] | null>(null);
  const [messages, setMessages] = useState<string[] | null>(null);
  const [excludedKeys, setExcludedKeys] = useState<Set<string>>(new Set());
  const [loadError, setLoadError] = useState<string | null>(null);

  const open = () => {
    setIsOpen(true);
    setTab("items");
    setLoadError(null);
    startTransition(async () => {
      try {
        const [fetchedItems, fetchedMessages] = await Promise.all([getShippingSummaryPreviewItems(date), previewShippingSummaryLineMessages(date, [])]);
        setItems(fetchedItems);
        setMessages(fetchedMessages);
        setExcludedKeys(new Set());
      } catch {
        setLoadError("โหลดตัวอย่างไม่สำเร็จ ลองใหม่อีกครั้ง");
      }
    });
  };

  const close = () => {
    setIsOpen(false);
    setItems(null);
    setMessages(null);
    setExcludedKeys(new Set());
  };

  const recompute = (next: Set<string>) => {
    setExcludedKeys(next);
    startTransition(async () => {
      setMessages(await previewShippingSummaryLineMessages(date, Array.from(next)));
    });
  };

  const toggleItem = (key: string) => {
    const next = new Set(excludedKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    recompute(next);
  };

  const setAll = (excluded: boolean) => {
    recompute(excluded ? new Set(items?.map((i) => i.key)) : new Set());
  };

  // Once a send succeeds, close the whole dialog rather than let it linger
  // showing already-sent content.
  if (state.success && isOpen) close();

  const excludedKeysJson = JSON.stringify(Array.from(excludedKeys));

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={open}
        className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
      >
        📲 ส่งเข้า LINE
      </button>
      {state.success && <p className="text-xs text-emerald-600 dark:text-emerald-400">ส่งเข้า LINE สำเร็จ</p>}
      {state.error && <p className="text-xs text-red-600 dark:text-red-400">{state.error}</p>}

      {isOpen && (
        <PreviewDialog
          icon={<MessageCircleIcon className="h-4 w-4" />}
          title="ส่งสรุปออเดอร์จัดส่งเข้า LINE"
          subtitle="ตรวจสอบรายการและข้อความก่อนกดยืนยัน"
          headerExtra={<ExportSummaryButton date={date} excludedKeys={Array.from(excludedKeys)} compact />}
          tabs={[
            { key: "items", label: `รายการสินค้า${items ? ` (${items.length})` : ""}` },
            { key: "preview", label: "ตัวอย่างข้อความ" },
          ]}
          activeTab={tab}
          onTabChange={(k) => setTab(k as "items" | "preview")}
          onClose={close}
          footer={
            <>
              <p className="text-xs text-gray-400 dark:text-gray-500">{excludedKeys.size > 0 ? `ตัดออก ${excludedKeys.size} รายการ` : " "}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={close}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  ยกเลิก
                </button>
                <form action={formAction}>
                  <input type="hidden" name="date" value={date} />
                  <input type="hidden" name="excludedKeys" value={excludedKeysJson} />
                  <button
                    type="submit"
                    disabled={isSending || !messages}
                    className="rounded-md bg-[#06C755] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#05b34c] disabled:opacity-50"
                  >
                    {isSending ? "กำลังส่ง..." : "ยืนยันส่งเข้า LINE"}
                  </button>
                </form>
              </div>
            </>
          }
        >
          {loadError ? (
            <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p>
          ) : !items || !messages ? (
            <DialogLoadingState />
          ) : tab === "items" ? (
            <ShippingItemExclusionList items={items} excludedKeys={excludedKeys} onToggle={toggleItem} onSetAll={setAll} />
          ) : (
            <MessagePreview messages={messages} isUpdating={isLoading} />
          )}
        </PreviewDialog>
      )}
    </div>
  );
}

function isFrameLine(msg: string): boolean {
  return /^-+$/.test(msg.trim()) || /^-{3,}.*-{3,}$/.test(msg.trim());
}

function MessagePreview({ messages, isUpdating }: { messages: string[]; isUpdating: boolean }) {
  if (messages.length === 0) {
    return <p className="py-10 text-center text-sm text-gray-400 dark:text-gray-500">ไม่มีเนื้อหาจะส่ง</p>;
  }

  const contentCount = messages.filter((m) => !isFrameLine(m)).length;
  // Pair each real message with its 1-based position among content messages
  // (frame lines get null) without mutating a counter across render — each
  // step's accumulator is a fresh array.
  const withContentIdx = messages.reduce<{ msg: string; contentIdx: number | null }[]>((acc, msg) => {
    const seenSoFar = acc.filter((a) => a.contentIdx !== null).length;
    acc.push({ msg, contentIdx: isFrameLine(msg) ? null : seenSoFar + 1 });
    return acc;
  }, []);

  return (
    <div className={`space-y-3 transition-opacity ${isUpdating ? "opacity-40" : "opacity-100"}`}>
      {withContentIdx.map(({ msg, contentIdx }, i) => {
        if (contentIdx === null) {
          return (
            <div key={i} className="flex items-center gap-2 text-[11px] text-gray-400 dark:text-gray-500">
              <span className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
              <span className="shrink-0">{msg.replace(/-/g, "").trim() || "・・・"}</span>
              <span className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
            </div>
          );
        }
        return (
          <div key={i}>
            <p className="mb-1 text-[11px] font-medium text-gray-400 dark:text-gray-500">
              ข้อความที่ {contentIdx}/{contentCount}
            </p>
            <div className="whitespace-pre-wrap break-words rounded-2xl rounded-tl-sm border border-emerald-100 bg-emerald-50/60 px-3.5 py-2.5 text-xs leading-relaxed text-gray-800 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-gray-200">
              {msg}
            </div>
          </div>
        );
      })}
    </div>
  );
}
