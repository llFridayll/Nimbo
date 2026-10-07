"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MessageCircleIcon } from "@/components/icons";
import { UserAvatar } from "@/components/UserAvatar";
import { avatarSrc } from "@/lib/avatar";

// Two different rhythms on purpose: the badge only has to feel current, while
// an open thread should feel like a conversation. Both pause entirely when the
// tab is hidden — a forgotten tab shouldn't keep hitting a 15-connection pool
// all afternoon.
const CONVERSATIONS_POLL_MS = 5_000;
const MESSAGES_POLL_MS = 3_000;

/** Tallest the composer grows before it starts scrolling instead — keep in
 * step with the max-h-32 class on the textarea (8rem). Past this the panel
 * itself would have no room left for the conversation. */
const COMPOSER_MAX_PX = 128;

/** Grows the textarea to fit what's been typed. A textarea can't size itself
 * to its content in CSS, so the height is cleared first (otherwise
 * scrollHeight only ever reports the current height and the box can never
 * shrink back after deleting a line) and then set from the measurement. */
function autoGrow(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, COMPOSER_MAX_PX)}px`;
}

interface ConversationSummary {
  id: string;
  kind: "TEAM" | "DIRECT";
  title: string;
  otherUserId: string | null;
  otherAvatarUpdatedAt: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  unreadCount: number;
}
interface Partner {
  id: string;
  displayName: string;
  avatarUpdatedAt: string | null;
}
interface ChatMessage {
  id: string;
  body: string;
  senderId: string | null;
  senderName: string;
  senderAvatarUpdatedAt: string | null;
  createdAt: string;
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
}

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [meId, setMeId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPartners, setShowPartners] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const latestAtRef = useRef<string | null>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0);
  const active = conversations.find((c) => c.id === activeId) ?? null;

  const markRead = useCallback(async (conversationId: string) => {
    await fetch("/api/chat/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId }),
    }).catch(() => {});
  }, []);

  // Conversation list + unread badge. Runs even while the panel is closed —
  // the badge is the whole point of the widget when it's shut.
  useEffect(() => {
    let cancelled = false;

    async function poll() {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/chat/conversations");
        if (!res.ok || cancelled) return;
        const data = await res.json();
        setConversations(data.conversations);
        setMeId(data.meId);
      } catch {
        // Offline or the server restarted — the next tick retries.
      }
    }

    poll();
    const id = setInterval(poll, CONVERSATIONS_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // Messages for whichever thread is open.
  useEffect(() => {
    if (!activeId || !open) return;
    let cancelled = false;

    // The thread is emptied in openConversation(), not here: clearing it from
    // inside the effect would be a second render pass every time this runs.
    async function poll() {
      if (document.visibilityState !== "visible") return;
      try {
        const url = latestAtRef.current
          ? `/api/chat/messages?conversationId=${activeId}&since=${encodeURIComponent(latestAtRef.current)}`
          : `/api/chat/messages?conversationId=${activeId}`;
        const res = await fetch(url);
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { messages: ChatMessage[] };
        if (data.messages.length === 0) return;
        latestAtRef.current = data.messages[data.messages.length - 1].createdAt;
        setMessages((prev) => {
          // The first load replaces; polls append. Guard against a message
          // arriving twice if a poll overlaps the optimistic send below.
          const seen = new Set(prev.map((m) => m.id));
          return [...prev, ...data.messages.filter((m) => !seen.has(m.id))];
        });
        // Anything that lands while the thread is on screen has been read.
        if (activeId) markRead(activeId);
      } catch {
        // Same as above — retry on the next tick.
      }
    }

    poll();
    const id = setInterval(poll, MESSAGES_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [activeId, open, markRead]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function openConversation(id: string) {
    // Drop the previous thread's messages and cursor before switching, so the
    // new thread starts from a clean slate and its first poll asks for a full
    // page rather than "anything newer than the other thread's last message".
    setMessages([]);
    latestAtRef.current = null;
    setActiveId(id);
    setShowPartners(false);
    setError(null);
    await markRead(id);
  }

  /** Fetched when the picker is opened rather than on the poll timer — the
   * roster changes when an employee is added, not every five seconds. */
  async function togglePartners() {
    const next = !showPartners;
    setShowPartners(next);
    if (!next || partners.length > 0) return;
    try {
      const res = await fetch("/api/chat/partners");
      if (!res.ok) return;
      const data = (await res.json()) as { partners: Partner[] };
      setPartners(data.partners);
    } catch {
      // Leave the list empty; opening the picker again retries.
    }
  }

  async function startDirect(userId: string) {
    setError(null);
    try {
      const res = await fetch("/api/chat/direct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "เปิดแชทไม่สำเร็จ");
      await openConversation(data.conversationId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "เปิดแชทไม่สำเร็จ");
    }
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || !activeId || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: activeId, body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "ส่งไม่สำเร็จ");
      setDraft("");
      // Clearing the value doesn't shrink a textarea whose height was set
      // inline — collapse it back to one row by hand.
      if (composerRef.current) composerRef.current.style.height = "auto";
      // Show it immediately instead of waiting up to 3s for the next poll.
      setMessages((prev) => (prev.some((m) => m.id === data.message.id) ? prev : [...prev, data.message]));
      latestAtRef.current = data.message.createdAt;
    } catch (err) {
      setError(err instanceof Error ? err.message : "ส่งไม่สำเร็จ");
    } finally {
      setSending(false);
    }
  }

  return (
    // print:hidden — the order/label print pages render this layout too, and a
    // floating chat bubble has no business on a shipping slip.
    <div className="print:hidden fixed bottom-4 right-4 z-40 flex flex-col items-end gap-2">
      {open && (
        <div className="flex h-[28rem] w-80 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-800 sm:w-96">
          <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-4 py-2.5 dark:border-gray-700">
            {active ? (
              <button
                type="button"
                onClick={() => setActiveId(null)}
                className="text-sm font-semibold text-gray-800 hover:underline dark:text-gray-100"
              >
                ← {active.title}
              </button>
            ) : (
              <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">แชททีม</span>
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="ปิดแชท"
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            >
              ✕
            </button>
          </div>

          {!active ? (
            <div className="flex-1 overflow-y-auto">
              {conversations.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => openConversation(c.id)}
                  className="flex w-full items-center gap-2.5 border-b border-gray-50 px-4 py-2.5 text-left hover:bg-gray-50 dark:border-gray-700/50 dark:hover:bg-gray-700/50"
                >
                  <UserAvatar
                    name={c.title}
                    src={c.otherUserId ? avatarSrc(c.otherUserId, c.otherAvatarUpdatedAt) : null}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-gray-800 dark:text-gray-200">{c.title}</span>
                    <span className="block truncate text-xs text-gray-400 dark:text-gray-500">
                      {c.lastMessagePreview ?? "ยังไม่มีข้อความ"}
                    </span>
                  </span>
                  {c.unreadCount > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-[11px] font-semibold text-white">
                      {c.unreadCount > 99 ? "99+" : c.unreadCount}
                    </span>
                  )}
                </button>
              ))}

              <button
                type="button"
                onClick={togglePartners}
                className="w-full px-4 py-2.5 text-left text-xs font-medium text-primary hover:underline"
              >
                {showPartners ? "ซ่อนรายชื่อ" : "+ เริ่มแชทส่วนตัว"}
              </button>
              {showPartners &&
                partners.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => startDirect(p.id)}
                    className="flex w-full items-center gap-2.5 px-4 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50"
                  >
                    <UserAvatar name={p.displayName} src={avatarSrc(p.id, p.avatarUpdatedAt)} className="h-6 w-6 text-[10px]" />
                    <span className="truncate text-sm text-gray-700 dark:text-gray-300">{p.displayName}</span>
                  </button>
                ))}
            </div>
          ) : (
            <>
              <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
                {messages.length === 0 && (
                  <p className="pt-8 text-center text-xs text-gray-400">ยังไม่มีข้อความ — เริ่มพิมพ์ได้เลย</p>
                )}
                {messages.map((m) => {
                  const mine = m.senderId === meId;
                  return (
                    <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[75%] rounded-2xl px-3 py-1.5 ${mine ? "bg-primary text-white" : "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-100"}`}>
                        {!mine && active.kind === "TEAM" && (
                          <span className="block text-[10px] font-medium opacity-70">{m.senderName}</span>
                        )}
                        <span className="whitespace-pre-wrap break-words text-sm">{m.body}</span>
                        <span className={`mt-0.5 block text-[10px] ${mine ? "text-white/70" : "text-gray-400"}`}>
                          {timeLabel(m.createdAt)}
                        </span>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>

              <form onSubmit={send} className="flex shrink-0 items-end gap-2 border-t border-gray-100 p-2.5 dark:border-gray-700">
                <textarea
                  ref={composerRef}
                  value={draft}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    autoGrow(e.currentTarget);
                  }}
                  onKeyDown={(e) => {
                    // Enter sends, Shift+Enter makes a new line — what every
                    // other chat app in the office already does.
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send(e);
                    }
                  }}
                  rows={1}
                  placeholder="พิมพ์ข้อความ..."
                  className="max-h-32 flex-1 resize-none overflow-y-auto rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-primary focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                />
                <button
                  type="submit"
                  disabled={sending || !draft.trim()}
                  className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
                >
                  ส่ง
                </button>
              </form>
            </>
          )}

          {error && <p className="shrink-0 bg-red-50 px-4 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-400">{error}</p>}
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "ปิดแชท" : `เปิดแชท${totalUnread > 0 ? ` (${totalUnread} ข้อความใหม่)` : ""}`}
        className="relative flex h-12 w-12 items-center justify-center rounded-full bg-primary text-white shadow-lg transition-transform hover:scale-105"
      >
        <MessageCircleIcon className="h-5 w-5" />
        {!open && totalUnread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-red-600 px-1 text-[10px] font-semibold text-white dark:border-gray-900">
            {totalUnread > 99 ? "99+" : totalUnread}
          </span>
        )}
      </button>
    </div>
  );
}
