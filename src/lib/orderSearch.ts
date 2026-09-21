import { Platform, Prisma } from "@prisma/client";
import { prisma } from "./db";
import { adapters } from "./platforms";
import { upsertOrder } from "./sync";

/** Every Order scalar except `rawPayload` (~2.3KB/row of untouched platform
 * response, holding unmasked buyer details), plus the relations callers of
 * this function actually read. Nothing downstream of a search reads
 * rawPayload — only productStats.getProductPriceHistory does, and it asks
 * for it explicitly. */
const SEARCH_RESULT_SELECT = {
  id: true,
  platform: true,
  platformOrderId: true,
  status: true,
  buyerName: true,
  buyerPhone: true,
  buyerUsername: true,
  buyerRegion: true,
  totalAmount: true,
  currency: true,
  orderDate: true,
  shippingCarrier: true,
  trackingNumber: true,
  shippingStatus: true,
  printedAt: true,
  shopId: true,
  shopName: true,
  isUnpaid: true,
  createdAt: true,
  updatedAt: true,
  items: true,
  problem: true,
} satisfies Prisma.OrderSelect;

export type OrderSearchResult = Prisma.OrderGetPayload<{ select: typeof SEARCH_RESULT_SELECT }>;

/** The core "search once, find it anywhere" flow: a support agent pastes
 * whatever the customer gave them (order number, tracking number, phone) and
 * this checks it against every platform without asking which one the order
 * came from. Shared by the SSR orders page and the /api/orders/search route. */
export async function searchOrdersAcrossPlatforms(q: string): Promise<OrderSearchResult[]> {
  let orders = await prisma.order.findMany({
    where: {
      OR: [
        { platformOrderId: { contains: q } },
        { trackingNumber: { contains: q } },
        { buyerPhone: { contains: q } },
        { buyerName: { contains: q } },
      ],
    },
    select: SEARCH_RESULT_SELECT,
    orderBy: { orderDate: "desc" },
    take: 25,
  });

  // Not found locally and looks like a raw order id: live-check every platform
  // in case it just hasn't synced yet, so the agent never has to ask "which platform?"
  if (orders.length === 0) {
    const liveResults = await Promise.allSettled(
      (Object.values(Platform) as Platform[]).map((p) => adapters[p].fetchOrderById(q))
    );
    for (const result of liveResults) {
      if (result.status === "fulfilled" && result.value) {
        await upsertOrder(result.value);
      }
    }
    orders = await prisma.order.findMany({
      where: {
        OR: [{ platformOrderId: { contains: q } }, { trackingNumber: { contains: q } }],
      },
      select: SEARCH_RESULT_SELECT,
      orderBy: { orderDate: "desc" },
      take: 25,
    });
  }

  return orders;
}
