import "server-only";
import { getSetting } from "@/lib/settings";
import type { ShippingSummaryResult, ShippingSummarySkuLine } from "@/lib/shippingSummary";
import {
  formatSkuSummaryText,
  filterRedundantTieWireFreebies,
  groupLinesForDisplay,
  aggregateGroupLines,
  needsOwnFreebieTie,
  countRealProductRows,
  buildGroupBundleNote,
  BUNDLE_TOGETHER_LABEL,
} from "@/lib/shippingSummaryDisplay";

const LINE_PUSH_URL = "https://api.line.me/v2/bot/message/push";
const LINE_CONTENT_URL = "https://api-data.line.me/v2/bot/message";
const MAX_MESSAGE_LENGTH = 4500; // LINE's text message cap is 5000 chars — leave headroom
const MAX_MESSAGES_PER_PUSH = 5; // LINE API limit per push call

/** Key in AppSetting for the LINE group (or user) the shipping summary gets
 * pushed to — captured automatically by the webhook the first time someone
 * messages the bot from that group, not typed in by hand. */
export const LINE_TARGET_SETTING_KEY = "line_target_id";

function formatSkuLine(sku: string, quantity: number, promoQuantity: number, needsOwnTie: boolean): string {
  const suffix = needsOwnTie ? BUNDLE_TOGETHER_LABEL : "";
  return `- ${formatSkuSummaryText(sku, quantity, promoQuantity)}${suffix}`;
}

export function shippingSummaryDateLabel(shipDate: Date): string {
  return shipDate.toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: "Asia/Bangkok" });
}

/** Header/footer dash rule wraps a whole batch of messages sent together in
 * one push (e.g. one per carrier) — as their own separate message bubbles,
 * not appended into the first/last carrier message's text. The header
 * (carrying the send date/time, so multiple checkpoints during the day are
 * distinguishable) becomes its own message before the batch, and the footer
 * (a plain dash line the same length as the header, so it stays on one line
 * even on a narrow phone screen) becomes its own message after the batch. */
export function applyDashFrame(texts: string[]): string[] {
  if (texts.length === 0) return texts;
  const now = new Date();
  const date = now.toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: "Asia/Bangkok" });
  const time = now.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Bangkok" });
  const header = `----- ${date} ${time} -----`;
  const footer = "-".repeat(header.length);
  return [header, ...texts, footer];
}

/** Groups lines into one block per physical shipment (see
 * groupLinesForDisplay — same tracking number, or else one order each) so a
 * packer never sees two different customers' orders collapsed into one "SKU
 * x N" line, only genuinely-merged shipments. No order number is printed
 * (packers don't need it here — a blank line is enough to keep each
 * shipment's items visually separate). */
function buildOrderGroupsText(lines: ShippingSummarySkuLine[]): string[] {
  const out: string[] = [];
  for (const group of groupLinesForDisplay(lines)) {
    out.push("");
    const rows = aggregateGroupLines(group.lines);
    const realProductCount = countRealProductRows(rows);
    rows.forEach((row) => {
      const rawSku = row.sourceLines[0].rawSku;
      const needsOwnTie = needsOwnFreebieTie(rawSku, row.productName, row.promoQuantity);
      out.push(formatSkuLine(row.sku, row.quantity, row.promoQuantity, needsOwnTie));
    });
    // On top of any per-row note above (that row's own freebie), a shipment
    // with more than one real product gets one extra trailing note (with a
    // count) that the whole box needs tying together.
    if (realProductCount > 1) out.push(buildGroupBundleNote(realProductCount));
  }
  return out;
}

/** The first message posted for a carrier on a given day — "กองที่ N
 * {carrier} (dd/mm/yy)" followed by one block per order (see
 * buildOrderGroupsText) for every order reported so far. */
export function buildCarrierBaselineMessage(kongNumber: number, carrier: string, dateLabel: string, lines: ShippingSummarySkuLine[]): string {
  const out = [`กองที่ ${kongNumber} ${carrier} (${dateLabel})`, ...buildOrderGroupsText(lines)];
  return out.join("\n");
}

/** A same-day follow-up for a carrier that already has a baseline message —
 * meant to be sent as a quote-reply (see quoteToken on LineMessageSpec) to
 * that original message, so it reads as "เพิ่ม" onto the existing pile
 * instead of restating everything already reported. `lines` is only the
 * orders/lines that weren't part of an earlier message for this carrier
 * (see shippingSummaryScheduler.ts). */
export function buildCarrierDeltaMessage(lines: ShippingSummarySkuLine[]): string {
  const out = ["เพิ่ม", ...buildOrderGroupsText(lines)];
  return out.join("\n");
}

/** One LINE message per carrier — used by the manual "ส่งเข้า LINE" button
 * for a one-off full resend. The automatic checkpoint scheduler
 * (shippingSummaryScheduler.ts) builds messages itself via
 * buildCarrierBaselineMessage/buildCarrierDeltaMessage instead, since it
 * needs to track quote tokens per carrier. */
export function buildShippingSummaryLineMessages(summary: ShippingSummaryResult): string[] {
  const dateLabel = shippingSummaryDateLabel(summary.window.shipDate);

  if (summary.carriers.length === 0) {
    return applyDashFrame([`ไม่มีออเดอร์จัดส่งสำหรับวันที่ (${dateLabel})`]);
  }

  return applyDashFrame(
    summary.carriers.map((group, idx) => buildCarrierBaselineMessage(idx + 1, group.carrier, dateLabel, filterRedundantTieWireFreebies(group.lines)))
  );
}

/** Splits on line boundaries so no single LINE message exceeds the length
 * cap — never cuts a "SKU x qty" entry in half. */
function chunkText(text: string, maxLen: number): string[] {
  const lines = text.split("\n");
  const chunks: string[] = [];
  let current = "";
  for (const line of lines) {
    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length > maxLen && current) {
      chunks.push(current);
      current = line;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export type PushLineResult = { ok: true } | { ok: false; error: string };

export interface LineMessageSpec {
  text: string;
  /** Makes this message render as a quoted reply to an earlier message —
   * from LINE's push-message response (sentMessages[].quoteToken). */
  quoteToken?: string;
}

export interface SentLineMessage {
  id: string;
  quoteToken?: string;
}

export type PushLineMessagesResult = { ok: true; sentMessages: SentLineMessage[] } | { ok: false; error: string };

/** Like pushLineMessage, but each entry can carry its own quoteToken and the
 * per-message send results (including the quoteToken LINE assigns to each
 * one) are returned so the caller can thread later replies onto them. */
export async function pushLineMessageSpecs(specs: LineMessageSpec[]): Promise<PushLineMessagesResult> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) return { ok: false, error: "ยังไม่ได้ตั้งค่า LINE_CHANNEL_ACCESS_TOKEN ในระบบ" };

  const targetId = await getSetting(LINE_TARGET_SETTING_KEY);
  if (!targetId) {
    return {
      ok: false,
      error: "ยังไม่ได้ลงทะเบียนกลุ่ม LINE ปลายทาง — เชิญบอทเข้ากลุ่มแล้วส่งข้อความอะไรก็ได้ 1 ครั้งก่อน ระบบจะจดจำกลุ่มนั้นให้อัตโนมัติ",
    };
  }

  const sentMessages: SentLineMessage[] = [];
  for (let i = 0; i < specs.length; i += MAX_MESSAGES_PER_PUSH) {
    const batch = specs.slice(i, i + MAX_MESSAGES_PER_PUSH);
    const res = await fetch(LINE_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        to: targetId,
        messages: batch.map((s) => (s.quoteToken ? { type: "text", text: s.text, quoteToken: s.quoteToken } : { type: "text", text: s.text })),
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `LINE API error ${res.status}: ${body.slice(0, 300)}` };
    }
    const body = (await res.json().catch(() => null)) as { sentMessages?: SentLineMessage[] } | null;
    sentMessages.push(...(body?.sentMessages ?? []));
  }
  return { ok: true, sentMessages };
}

/** Downloads the binary content of a file/image/etc. a user sent the bot,
 * given the message id from a webhook "message" event — used to pull down a
 * order-export file someone sends in chat (see orderFileLineImport.ts). */
export async function fetchLineMessageContent(messageId: string): Promise<Buffer | null> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) return null;
  const res = await fetch(`${LINE_CONTENT_URL}/${messageId}/content`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}

/** Each entry becomes its own message bubble in the chat — pass one string
 * per carrier so the group sees them as separate "กองที่ N" posts, matching
 * how a single push call with multiple `messages` renders in LINE. */
export async function pushLineMessage(texts: string | string[]): Promise<PushLineResult> {
  const messageTexts = Array.isArray(texts) ? texts : [texts];
  // Chunking still applies per-message in case one carrier's SKU list alone exceeds the length cap.
  const chunks = messageTexts.flatMap((t) => chunkText(t, MAX_MESSAGE_LENGTH));
  const result = await pushLineMessageSpecs(chunks.map((text) => ({ text })));
  if (!result.ok) return result;
  return { ok: true };
}
