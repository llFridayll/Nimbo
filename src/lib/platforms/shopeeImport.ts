import "server-only";
import * as XLSX from "xlsx";
import { OrderStatus, Platform } from "@prisma/client";
import type { NormalizedOrder, NormalizedOrderItem } from "@/lib/platforms/types";
import { parseShopeeCancellation } from "@/lib/platforms/cancellationFields";

// Column headers from Shopee Seller Center's order-export file (verified
// against a real "Order.all.<from>_<to>.xlsx" export, Sept 2026), looked up
// by NAME rather than position. Shopee's own export omits some columns
// entirely (not even as a blank cell) on certain rows — e.g. the refund-
// status column is missing whenever an order never had a refund — which
// left-shifts every later column if read positionally. Reading by header
// name instead resolves each column from its real cell address, so a
// missing column earlier in the row can't misalign the ones after it.
const HEADER = {
  ORDER_ID: "หมายเลขคำสั่งซื้อ",
  STATUS: "สถานะการสั่งซื้อ",
  BUYER_USERNAME: "ชื่อผู้ใช้ (ผู้ซื้อ)",
  ORDER_DATE: "วันที่ทำการสั่งซื้อ",
  SHIPPING_OPTION: "ตัวเลือกการจัดส่ง",
  TRACKING_NUMBER: "*หมายเลขติดตามพัสดุ",
  PRODUCT_NAME: "ชื่อสินค้า",
  SKU: "เลขอ้างอิง SKU (SKU Reference No.)",
  VARIANT: "ชื่อตัวเลือก",
  UNIT_PRICE: "ราคาขาย",
  QUANTITY: "จำนวน",
  GRAND_TOTAL: "จำนวนเงินทั้งหมด",
  RECIPIENT_NAME: "ชื่อผู้รับ",
  RECIPIENT_PHONE: "หมายเลขโทรศัพท์",
  PROVINCE: "จังหวัด",
  DISTRICT: "เขต/อำเภอ",
  CANCEL_REASON: "เหตุผลในการยกเลิกคำสั่งซื้อ",
  SHIP_TIME: "เวลาส่งสินค้า",
} as const;

// Only "ที่ต้องจัดส่ง" and "สำเร็จแล้ว" have been seen in a real export so
// far — the rest are the other status-tab labels Shopee TH Seller Center is
// known to use, included defensively. Anything not listed here falls back to
// PROBLEM (never silently mis-filed) and is surfaced in the import result so
// the exact raw string can be added here once confirmed.
const KNOWN_STATUS_MAP: Record<string, OrderStatus> = {
  ยังไม่ชำระ: OrderStatus.NEW,
  รอดำเนินการ: OrderStatus.NEW,
  ที่ต้องจัดส่ง: OrderStatus.PENDING_SHIPMENT,
  รอการจัดส่ง: OrderStatus.PENDING_SHIPMENT,
  กำลังจัดส่ง: OrderStatus.SHIPPED,
  จัดส่งแล้ว: OrderStatus.SHIPPED,
  สำเร็จแล้ว: OrderStatus.DELIVERED,
  จัดส่งสำเร็จ: OrderStatus.DELIVERED,
  // Seen in real exports (Oct 2026) and previously falling through to
  // PROBLEM — 16 delivered orders and 7 in-transit ones were sitting in the
  // Problem Center and on packing lists as if they hadn't gone out.
  จัดส่งสำเร็จแล้ว: OrderStatus.DELIVERED,
  การจัดส่ง: OrderStatus.SHIPPED,
  ยกเลิก: OrderStatus.CANCELLED,
  ยกเลิกแล้ว: OrderStatus.CANCELLED,
  "คืนสินค้า/คืนเงิน": OrderStatus.REFUND_REQUESTED,
  ขอคืนเงิน: OrderStatus.REFUND_REQUESTED,
  คืนสินค้าแล้ว: OrderStatus.RETURNED,
};

// Split from a plain lookup so "unrecognized" means "not a key in the map at
// all" — a status that's deliberately mapped TO PROBLEM (none currently, but
// keeps this consistent with lazadaImport.ts) still counts as recognized.
// Statuses Shopee writes as a sentence with a date in it, so they can't be
// exact-match keys: "ผู้ซื้อได้รับสินค้าแล้ว โปรดทราบว่าผู้ซื้อสามารถยื่นคำขอ
// คืนเงิน/คืนสินค้าได้จนถึง 2026-10-10" — delivered, inside the buyer's
// return window.
const STATUS_PREFIX_MAP: [string, OrderStatus][] = [["ผู้ซื้อได้รับสินค้าแล้ว", OrderStatus.DELIVERED]];

function mapShopeeStatus(raw: string): { status: OrderStatus; recognized: boolean } {
  const trimmed = raw.trim();
  const status = KNOWN_STATUS_MAP[trimmed] ?? STATUS_PREFIX_MAP.find(([prefix]) => trimmed.startsWith(prefix))?.[1];
  return status ? { status, recognized: true } : { status: OrderStatus.PROBLEM, recognized: false };
}

// Matches the district/province formatting already used for TikTok's
// buyerRegion (e.g. "เกาะลันตา, กระบี่") — Shopee's own export prefixes both
// with อำเภอ/เขต/จังหวัด, which this strips for consistency across platforms.
function stripRegionPrefix(value: string): string {
  return value.replace(/^(อำเภอ|เขต|จังหวัด)/, "").trim();
}

function parseShopeeDate(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const date = new Date(`${trimmed.replace(" ", "T")}+07:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

type ShopeeRow = Record<string, unknown>;

function cell(row: ShopeeRow, header: string): string {
  const value = row[header];
  return value === undefined || value === null ? "" : String(value).trim();
}

export interface ShopeeImportResult {
  orders: NormalizedOrder[];
  /** Unique raw status strings that didn't match a known mapping (mapped to PROBLEM). */
  unrecognizedStatuses: string[];
  /** Data rows with no order number at all (blank rows, footer rows, etc.). */
  skippedRows: number;
}

/** Parses a Shopee Seller Center order-export file (.xlsx, also tolerates
 * .csv since the same reader handles both) into NormalizedOrder objects
 * ready for upsertOrder — the same DB-writing path TikTok/Lazada API syncing
 * already uses, so a manual import behaves identically once parsed.
 *
 * `shopName` identifies which physical Shopee shop the file came from —
 * required because the export itself carries no shop identifier (each
 * Seller Center login can only export its own shop's orders), and without
 * it every import would collapse into one indistinguishable "Shopee" bucket
 * for a seller running more than one shop. Used as both Order.shopId and
 * Order.shopName so the orders list's existing shopId filter (previously
 * TikTok-only) works for Shopee too. */
export function parseShopeeExport(buffer: Buffer, shopName: string): ShopeeImportResult {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const dataRows = XLSX.utils.sheet_to_json<ShopeeRow>(sheet, { defval: "" });

  const byOrderId = new Map<string, ShopeeRow[]>();
  let skippedRows = 0;
  for (const row of dataRows) {
    const orderId = cell(row, HEADER.ORDER_ID);
    if (!orderId) {
      skippedRows++;
      continue;
    }
    if (!byOrderId.has(orderId)) byOrderId.set(orderId, []);
    byOrderId.get(orderId)!.push(row);
  }

  const unrecognizedStatuses = new Set<string>();
  const orders: NormalizedOrder[] = [];

  for (const [orderId, orderRows] of byOrderId) {
    const first = orderRows[0];
    const rawStatus = cell(first, HEADER.STATUS);
    const { status, recognized } = mapShopeeStatus(rawStatus);
    if (!recognized && rawStatus) unrecognizedStatuses.add(rawStatus);

    const orderDate = parseShopeeDate(cell(first, HEADER.ORDER_DATE)) ?? new Date();

    // e.g. "Standard Delivery Bulky - ส่งสินค้าขนาดใหญ่-Best Express Bulky" -> "Best Express Bulky"
    const shippingOptionRaw = cell(first, HEADER.SHIPPING_OPTION);
    const shippingCarrier = shippingOptionRaw.includes("-") ? shippingOptionRaw.split("-").pop()!.trim() : shippingOptionRaw || undefined;

    const province = stripRegionPrefix(cell(first, HEADER.PROVINCE));
    const district = stripRegionPrefix(cell(first, HEADER.DISTRICT));
    const buyerRegion = district || province ? [district, province].filter(Boolean).join(", ") : undefined;

    const items: NormalizedOrderItem[] = orderRows.map((row) => {
      const productName = cell(row, HEADER.PRODUCT_NAME);
      const variant = cell(row, HEADER.VARIANT);
      return {
        sku: cell(row, HEADER.SKU) || productName || "ไม่ระบุ SKU",
        productName: variant ? `${productName} (${variant})` : productName,
        quantity: Number(cell(row, HEADER.QUANTITY)) || 0,
        unitPrice: Number(cell(row, HEADER.UNIT_PRICE)) || 0,
      };
    });

    const totalAmount = Number(cell(first, HEADER.GRAND_TOTAL)) || items.reduce((sum, it) => sum + it.unitPrice * it.quantity, 0);

    // Only read for cancelled orders: Shopee leaves this column populated on
    // orders that were cancelled and then reinstated, and carrying that
    // across would attach a cancellation reason to a live order.
    const cancellation = status === OrderStatus.CANCELLED ? parseShopeeCancellation(cell(first, HEADER.CANCEL_REASON)) : {};

    orders.push({
      platform: Platform.SHOPEE,
      platformOrderId: orderId,
      status,
      isUnpaid: rawStatus.trim() === "ยังไม่ชำระ",
      buyerName: cell(first, HEADER.RECIPIENT_NAME) || undefined,
      buyerPhone: cell(first, HEADER.RECIPIENT_PHONE) || undefined,
      buyerUsername: cell(first, HEADER.BUYER_USERNAME) || undefined,
      buyerRegion,
      totalAmount,
      currency: "THB",
      orderDate,
      shippingCarrier,
      trackingNumber: cell(first, HEADER.TRACKING_NUMBER) || undefined,
      shopId: shopName,
      shopName,
      ...cancellation,
      shippedAt: parseShopeeDate(cell(first, HEADER.SHIP_TIME)) ?? undefined,
      items,
      rawPayload: orderRows,
    });
  }

  return { orders, unrecognizedStatuses: Array.from(unrecognizedStatuses), skippedRows };
}
