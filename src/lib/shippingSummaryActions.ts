"use server";

import { currentShippingCutoffWindow, shippingCutoffWindowForDate } from "@/lib/dateUtils";
import { getShippingSummary, excludeShippingSummaryLines, shippingLineItemKey } from "@/lib/shippingSummary";
import { filterRedundantTieWireFreebies } from "@/lib/shippingSummaryDisplay";
import { pushLineMessage, buildShippingSummaryLineMessages } from "@/lib/line";
import { previewShippingSummarySlip as buildSlipPreview, type SlipPreviewCarrier } from "@/lib/shippingSummaryExcel";
import { getCurrentUser } from "@/lib/dal";
import { logActivity } from "@/lib/activityLog";
import { getLineSendLog, recordLineSend, orderCarriers } from "@/lib/lineSendLog";

export interface SendLineSummaryState {
  success?: boolean;
  error?: string;
}

/** "all": every item on the day's list. "new": only items not sent to LINE
 * earlier for the same ship date (see lineSendLog.ts). */
export type LineSendMode = "all" | "new";

export interface LineSendInfo {
  /** Item keys (ShippingPreviewItem.key) already sent for this ship date. */
  sentKeys: string[];
  lastSentAt: string | null;
}

export interface ShippingPreviewItem {
  /** Pass back in `excludedKeys` on any preview/send/export call to drop this item. */
  key: string;
  carrier: string;
  shop: string;
  platformOrderId: string;
  sku: string;
  productName: string;
  quantity: number;
}

function resolveWindow(dateStr: string) {
  return dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
    ? shippingCutoffWindowForDate(new Date(`${dateStr}T12:00:00+07:00`))
    : currentShippingCutoffWindow();
}

async function getFilteredCarriers(dateStr: string, excludedKeys: string[]) {
  const summary = await getShippingSummary(resolveWindow(dateStr));
  return excludeShippingSummaryLines(summary.carriers, new Set(excludedKeys));
}

/** Every real product line for one ship date, flattened across carriers —
 * the checklist a staff member picks items OUT of (a customer cancelling
 * just one item in an otherwise-still-shipping order) on the LINE/Excel
 * preview screens. Fetched once per preview open; previewShippingSummaryLineMessages
 * and previewShippingSummarySlip below are then re-called with the current
 * excludedKeys on every toggle so the text/rows always match what a real
 * send/download would produce. */
export async function getShippingSummaryPreviewItems(dateStr: string): Promise<ShippingPreviewItem[]> {
  await getCurrentUser();
  const summary = await getShippingSummary(resolveWindow(dateStr));
  const items: ShippingPreviewItem[] = [];
  for (const group of summary.carriers) {
    for (const line of filterRedundantTieWireFreebies(group.lines)) {
      items.push({
        key: shippingLineItemKey(line),
        carrier: group.carrier,
        shop: line.shop,
        platformOrderId: line.platformOrderId,
        sku: line.sku,
        productName: line.productName,
        quantity: line.quantity,
      });
    }
  }
  return items;
}

/** What has already gone to LINE for this ship date — the send dialog uses
 * it to offer "เฉพาะรายการใหม่" and to list only the new items. */
export async function getLineSendInfo(dateStr: string): Promise<LineSendInfo> {
  await getCurrentUser();
  const log = await getLineSendLog(resolveWindow(dateStr).shipDate);
  return { sentKeys: log.keys, lastSentAt: log.lastSentAt };
}

/** The one place a LINE send is assembled, for the preview and the real
 * send alike. Already-sent items are dropped server-side for "new", so the
 * result never depends on what the browser thinks was sent. */
async function buildLineSend(dateStr: string, excludedKeys: string[], mode: LineSendMode) {
  const window = resolveWindow(dateStr);
  const [summary, log] = await Promise.all([getShippingSummary(window), getLineSendLog(window.shipDate)]);

  // Pile numbers: couriers already numbered today keep theirs; any courier
  // new today is numbered after them, busiest first.
  const kongNumbers = new Map(log.carriers.map((c, i) => [c, i + 1]));
  const allPiles = orderCarriers(summary.carriers, log.carriers);
  for (const g of allPiles) if (!kongNumbers.has(g.carrier)) kongNumbers.set(g.carrier, kongNumbers.size + 1);

  const skip = new Set(excludedKeys);
  if (mode === "new") for (const k of log.keys) skip.add(k);
  const carriers = orderCarriers(excludeShippingSummaryLines(summary.carriers, skip), log.carriers);
  const messages = buildShippingSummaryLineMessages(
    { window, totalOrders: 0, carriers, unpaidExcludedCount: 0 },
    { kongNumbers, newOnly: mode === "new" },
  );
  return { window, carriers, messages, pileOrder: [...kongNumbers.entries()].sort((a, b) => a[1] - b[1]).map(([c]) => c) };
}

function parseMode(value: unknown): LineSendMode {
  return value === "new" ? "new" : "all";
}

/** Builds the exact LINE message texts a real send would push, without
 * actually pushing them — lets staff review the content (SKUs, bundling
 * notes, carrier grouping) before committing, since this data ultimately
 * comes from platform sync/import and isn't always right. `excludedKeys`
 * (see ShippingPreviewItem.key) drops items a customer cancelled. */
export async function previewShippingSummaryLineMessages(dateStr: string, excludedKeys: string[] = [], mode: LineSendMode = "all"): Promise<string[]> {
  await getCurrentUser();
  return (await buildLineSend(dateStr, excludedKeys, parseMode(mode))).messages;
}

/** Preview of the Excel packing-slip content (tracking numbers + product
 * text, carrier by carrier) before actually downloading the file — same
 * source data as previewShippingSummaryLineMessages above, so staff can spot
 * bad data once instead of catching it separately in each export format. */
export async function previewShippingSummarySlip(dateStr: string, excludedKeys: string[] = []): Promise<SlipPreviewCarrier[]> {
  await getCurrentUser();
  const carriers = await getFilteredCarriers(dateStr, excludedKeys);
  return buildSlipPreview({ window: resolveWindow(dateStr), totalOrders: 0, carriers, unpaidExcludedCount: 0 });
}

export async function sendShippingSummaryToLine(_prevState: SendLineSummaryState, formData: FormData): Promise<SendLineSummaryState> {
  const user = await getCurrentUser();
  const dateStr = String(formData.get("date") ?? "");
  const excludedKeys = JSON.parse(String(formData.get("excludedKeys") ?? "[]")) as string[];
  const mode = parseMode(formData.get("mode"));
  const { window, carriers, messages, pileOrder } = await buildLineSend(dateStr, excludedKeys, mode);
  if (mode === "new" && carriers.length === 0) return { success: false, error: "ไม่มีรายการใหม่ตั้งแต่ส่งครั้งก่อน" };

  const result = await pushLineMessage(messages);

  if (!result.ok) return { success: false, error: result.error };

  const sentKeys = carriers.flatMap((g) => g.lines.map((line) => shippingLineItemKey(line)));
  await recordLineSend(window.shipDate, sentKeys, pileOrder);

  await logActivity({
    userId: user.id,
    username: user.username,
    action: "LINE_SUMMARY_SENT",
    detail: `สรุปออเดอร์จัดส่งวันที่ ${dateStr || "วันนี้"} (${mode === "new" ? `เฉพาะรายการใหม่ ${sentKeys.length} รายการ` : "ทั้งหมด"})${excludedKeys.length > 0 ? ` (ตัดออก ${excludedKeys.length} รายการ)` : ""}`,
  });

  return { success: true };
}
