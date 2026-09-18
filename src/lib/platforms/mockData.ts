import { OrderStatus, Platform } from "@prisma/client";
import { NormalizedOrder } from "./types";

const STATUSES: OrderStatus[] = [
  "NEW",
  "PENDING_SHIPMENT",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "REFUND_REQUESTED",
  "RETURNED",
  "PROBLEM",
];

const CARRIERS = ["Kerry Express", "Flash Express", "J&T Express", "Thailand Post", "Ninja Van"];
const PRODUCT_NAMES = [
  "เสื้อยืดโอเวอร์ไซส์",
  "กางเกงขาสั้น",
  "หูฟังบลูทูธ",
  "เคสมือถือ",
  "แก้วน้ำสแตนเลส",
  "กระเป๋าสะพายข้าง",
  "รองเท้าผ้าใบ",
  "หน้ากากอนามัย",
];
const FIRST_NAMES = ["สมชาย", "สมหญิง", "วิชัย", "นภา", "ธนกร", "อรทัย", "กิตติ", "พิมพ์ใจ"];

function pick<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length];
}

function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic mock order generator, used for platforms without live API
 * credentials yet (Shopee / Lazada). Swap out for a real adapter once
 * Partner/App credentials are issued — the shape returned matches
 * `NormalizedOrder`, so nothing downstream needs to change. */
export function generateMockOrders(platform: Platform, count: number, seedOffset = 0): NormalizedOrder[] {
  const orders: NormalizedOrder[] = [];
  for (let i = 0; i < count; i++) {
    const seed = seedOffset + i;
    const rand = mulberry32(seed + 1);
    const status = pick(STATUSES, Math.floor(rand() * 1000));
    const itemCount = 1 + Math.floor(rand() * 3);
    const items = Array.from({ length: itemCount }).map((_, idx) => {
      const unitPrice = Math.round((rand() * 800 + 50) * 100) / 100;
      const quantity = 1 + Math.floor(rand() * 3);
      return {
        sku: `${platform.slice(0, 2)}-SKU-${(seed * 7 + idx).toString().padStart(5, "0")}`,
        productName: pick(PRODUCT_NAMES, Math.floor(rand() * 1000) + idx),
        quantity,
        unitPrice,
        imageUrl: undefined,
      };
    });
    const totalAmount = items.reduce((sum, it) => sum + it.unitPrice * it.quantity, 0);
    const daysAgo = Math.floor(rand() * 21);
    const orderDate = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
    const isProblem = status === "PROBLEM" || status === "REFUND_REQUESTED";

    orders.push({
      platform,
      platformOrderId: `${platform}-${(100000000 + seed * 37).toString()}`,
      status,
      buyerName: `${pick(FIRST_NAMES, Math.floor(rand() * 1000))} ${pick(["ใจดี", "รักไทย", "สุขใจ", "มั่งมี"], Math.floor(rand() * 1000))}`,
      buyerPhone: `08${Math.floor(10000000 + rand() * 89999999)}`,
      buyerUsername: `user_${seed}`,
      totalAmount: Math.round(totalAmount * 100) / 100,
      currency: "THB",
      orderDate,
      shippingCarrier: status === "NEW" ? undefined : pick(CARRIERS, Math.floor(rand() * 1000)),
      trackingNumber:
        status === "NEW" || status === "PENDING_SHIPMENT"
          ? undefined
          : `TH${Math.floor(rand() * 900000000 + 100000000)}`,
      shippingStatus: isProblem ? "exception" : status === "DELIVERED" ? "delivered" : "in_transit",
      items,
      rawPayload: { mock: true, platform, seed },
    });
  }
  return orders;
}
