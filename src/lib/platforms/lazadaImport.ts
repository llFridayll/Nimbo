import "server-only";
import * as XLSX from "xlsx";
import { OrderStatus, Platform } from "@prisma/client";
import type { NormalizedOrder, NormalizedOrderItem } from "@/lib/platforms/types";

// Column headers from Lazada Seller Center's order-export file (verified
// against a real ~10,000-row export, Sept 2026), looked up by NAME rather
// than position — see the matching comment in shopeeImport.ts for why
// (some rows omit a column entirely rather than leaving it blank, which
// left-shifts every later column when read positionally). Unlike Shopee's
// export, Lazada has no quantity column at all — each row is ONE UNIT, so
// buying 3 of the same SKU produces 3 rows with the same orderNumber +
// sellerSku, which parseLazadaExport collapses back into a quantity of 3.
const HEADER = {
  SELLER_SKU: "sellerSku",
  CREATE_TIME: "createTime",
  ORDER_NUMBER: "orderNumber",
  CUSTOMER_NAME: "customerName", // Lazada account handle, not the delivery recipient
  SHIPPING_NAME: "shippingName", // actual recipient name
  SHIPPING_PROVINCE: "shippingAddress3", // e.g. "สงขลา/ Songkhla"
  SHIPPING_DISTRICT: "shippingAddress4", // e.g. "เมืองสงขลา/ Mueang Songkhla"
  BILLING_PHONE: "billingPhone", // shippingPhone is always blank in this export; billingPhone carries the real number
  PAID_PRICE: "paidPrice", // per-unit price actually paid, after discounts
  UNIT_PRICE: "unitPrice", // per-unit listed price, before discounts
  SHIPPING_FEE: "shippingFee",
  ITEM_NAME: "itemName",
  VARIATION: "variation",
  SHIPPING_PROVIDER: "shippingProvider",
  TRACKING_CODE: "trackingCode",
  STATUS: "status",
} as const;

// Every status value seen in a real export, plus the couple of others
// Lazada's own status-tab UI is known to use. Anything not listed here falls
// back to PROBLEM (never silently mis-filed) and is surfaced in the import
// result so the exact raw string can be added here once confirmed.
const KNOWN_STATUS_MAP: Record<string, OrderStatus> = {
  pending: OrderStatus.NEW,
  unpaid: OrderStatus.NEW,
  confirmed: OrderStatus.PENDING_SHIPMENT,
  ready_to_ship: OrderStatus.PENDING_SHIPMENT,
  packed: OrderStatus.PENDING_SHIPMENT,
  shipped: OrderStatus.SHIPPED,
  delivered: OrderStatus.DELIVERED,
  canceled: OrderStatus.CANCELLED,
  cancelled: OrderStatus.CANCELLED,
  returned: OrderStatus.RETURNED,
  "package returned": OrderStatus.RETURNED,
  "lost by 3pl": OrderStatus.PROBLEM,
  "damaged by 3pl": OrderStatus.PROBLEM,
};

// Split from a plain lookup so "unrecognized" means "not a key in the map at
// all" — some known statuses (Lost/Damaged by 3PL) deliberately map TO
// PROBLEM, and those aren't unrecognized, just genuinely problem orders.
function mapLazadaStatus(raw: string): { status: OrderStatus; recognized: boolean } {
  const key = raw.trim().toLowerCase();
  const status = KNOWN_STATUS_MAP[key];
  return status ? { status, recognized: true } : { status: OrderStatus.PROBLEM, recognized: false };
}

// Address fields come as "ไทย/ English", e.g. "สงขลา/ Songkhla" — keep only
// the Thai half, matching the plain-Thai buyerRegion convention already used
// for TikTok/Shopee (e.g. "เกาะลันตา, กระบี่").
function thaiPart(value: string): string {
  return value.split("/")[0].trim();
}

const MONTH_INDEX: Record<string, number> = {
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11,
};

// "07 Sep 2026 12:53" — parsed explicitly (rather than new Date(string)) so
// it's always read as Bangkok local time regardless of the server's own
// timezone, same reasoning as parseShopeeDate in shopeeImport.ts.
function parseLazadaDate(value: string): Date | null {
  const match = value.trim().match(/^(\d{1,2}) (\w{3}) (\d{4}) (\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const [, dd, mon, yyyy, hh, mm] = match;
  const month = MONTH_INDEX[mon];
  if (month === undefined) return null;
  const date = new Date(Date.UTC(Number(yyyy), month, Number(dd), Number(hh), Number(mm)) - 7 * 60 * 60 * 1000);
  return Number.isNaN(date.getTime()) ? null : date;
}

type LazadaRow = Record<string, unknown>;

function cell(row: LazadaRow, header: string): string {
  const value = row[header];
  return value === undefined || value === null ? "" : String(value).trim();
}

export interface LazadaImportResult {
  orders: NormalizedOrder[];
  unrecognizedStatuses: string[];
  skippedRows: number;
}

/** Parses a Lazada Seller Center order-export file (.xlsx, also tolerates
 * .csv) into NormalizedOrder objects ready for upsertOrder — same DB-writing
 * path TikTok/Shopee use. */
export function parseLazadaExport(buffer: Buffer, shopName: string): LazadaImportResult {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const dataRows = XLSX.utils.sheet_to_json<LazadaRow>(sheet, { defval: "" });

  const byOrderNumber = new Map<string, LazadaRow[]>();
  let skippedRows = 0;
  for (const row of dataRows) {
    const orderNumber = cell(row, HEADER.ORDER_NUMBER);
    if (!orderNumber) {
      skippedRows++;
      continue;
    }
    if (!byOrderNumber.has(orderNumber)) byOrderNumber.set(orderNumber, []);
    byOrderNumber.get(orderNumber)!.push(row);
  }

  const unrecognizedStatuses = new Set<string>();
  const orders: NormalizedOrder[] = [];

  for (const [orderNumber, itemRows] of byOrderNumber) {
    const first = itemRows[0];
    const rawStatus = cell(first, HEADER.STATUS);
    const { status, recognized } = mapLazadaStatus(rawStatus);
    if (!recognized && rawStatus) unrecognizedStatuses.add(rawStatus);

    const orderDate = parseLazadaDate(cell(first, HEADER.CREATE_TIME)) ?? new Date();

    const province = thaiPart(cell(first, HEADER.SHIPPING_PROVINCE));
    const district = thaiPart(cell(first, HEADER.SHIPPING_DISTRICT));
    const buyerRegion = district || province ? [district, province].filter(Boolean).join(", ") : undefined;

    // Collapse repeated one-unit-per-row entries for the same SKU into a quantity.
    const bySku = new Map<string, { productName: string; quantity: number; unitPrice: number }>();
    for (const row of itemRows) {
      const productNameRaw = cell(row, HEADER.ITEM_NAME);
      const sku = cell(row, HEADER.SELLER_SKU) || productNameRaw || "ไม่ระบุ SKU";
      const variation = cell(row, HEADER.VARIATION);
      const productName = variation ? `${productNameRaw} (${variation})` : productNameRaw;
      const unitPrice = Number(cell(row, HEADER.UNIT_PRICE)) || 0;

      const existing = bySku.get(sku);
      if (existing) {
        existing.quantity += 1;
      } else {
        bySku.set(sku, { productName, quantity: 1, unitPrice });
      }
    }
    const items: NormalizedOrderItem[] = Array.from(bySku.entries()).map(([sku, v]) => ({
      sku,
      productName: v.productName,
      quantity: v.quantity,
      unitPrice: v.unitPrice,
    }));

    // No single grand-total column like Shopee's "จำนวนเงินทั้งหมด" — best
    // estimate is what was actually paid per unit (already net of discounts)
    // summed across every row, plus the order's shipping fee.
    const paidTotal = itemRows.reduce((sum, row) => sum + (Number(cell(row, HEADER.PAID_PRICE)) || 0), 0);
    const shippingFee = Number(cell(first, HEADER.SHIPPING_FEE)) || 0;

    // An order split into multiple packages has a different trackingCode per
    // row instead of one shared value — reading only `first`'s would silently
    // drop every tracking number but the first package's.
    const trackingCodes = Array.from(new Set(itemRows.map((row) => cell(row, HEADER.TRACKING_CODE)).filter(Boolean)));

    orders.push({
      platform: Platform.LAZADA,
      platformOrderId: orderNumber,
      status,
      isUnpaid: rawStatus.trim().toLowerCase() === "unpaid",
      buyerName: cell(first, HEADER.SHIPPING_NAME) || undefined,
      buyerPhone: cell(first, HEADER.BILLING_PHONE) || undefined,
      buyerUsername: cell(first, HEADER.CUSTOMER_NAME) || undefined,
      buyerRegion,
      totalAmount: paidTotal + shippingFee,
      currency: "THB",
      orderDate,
      shippingCarrier: cell(first, HEADER.SHIPPING_PROVIDER) || undefined,
      trackingNumber: trackingCodes.length > 0 ? trackingCodes.join(" / ") : undefined,
      shopId: shopName,
      shopName,
      items,
      rawPayload: itemRows,
    });
  }

  return { orders, unrecognizedStatuses: Array.from(unrecognizedStatuses), skippedRows };
}
