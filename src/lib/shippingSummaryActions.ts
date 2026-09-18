"use server";

import { currentShippingCutoffWindow, shippingCutoffWindowForDate } from "@/lib/dateUtils";
import { getShippingSummary, excludeShippingSummaryLines, shippingLineItemKey } from "@/lib/shippingSummary";
import { filterRedundantTieWireFreebies } from "@/lib/shippingSummaryDisplay";
import { pushLineMessage, buildShippingSummaryLineMessages } from "@/lib/line";
import { previewShippingSummarySlip as buildSlipPreview, type SlipPreviewCarrier } from "@/lib/shippingSummaryExcel";
import { getCurrentUser } from "@/lib/dal";
import { logActivity } from "@/lib/activityLog";

export interface SendLineSummaryState {
  success?: boolean;
  error?: string;
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
        key: shippingLineItemKey(line.orderId, line.rawSku),
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

/** Builds the exact LINE message texts a real send would push, without
 * actually pushing them — lets staff review the content (SKUs, bundling
 * notes, carrier grouping) before committing, since this data ultimately
 * comes from platform sync/import and isn't always right. `excludedKeys`
 * (see ShippingPreviewItem.key) drops items a customer cancelled. */
export async function previewShippingSummaryLineMessages(dateStr: string, excludedKeys: string[] = []): Promise<string[]> {
  await getCurrentUser();
  const carriers = await getFilteredCarriers(dateStr, excludedKeys);
  return buildShippingSummaryLineMessages({ window: resolveWindow(dateStr), totalOrders: 0, carriers, unpaidExcludedCount: 0 });
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
  const carriers = await getFilteredCarriers(dateStr, excludedKeys);
  const messages = buildShippingSummaryLineMessages({ window: resolveWindow(dateStr), totalOrders: 0, carriers, unpaidExcludedCount: 0 });
  const result = await pushLineMessage(messages);

  if (!result.ok) return { success: false, error: result.error };

  await logActivity({
    userId: user.id,
    username: user.username,
    action: "LINE_SUMMARY_SENT",
    detail: `สรุปออเดอร์จัดส่งวันที่ ${dateStr || "วันนี้"}${excludedKeys.length > 0 ? ` (ตัดออก ${excludedKeys.length} รายการ)` : ""}`,
  });

  return { success: true };
}
