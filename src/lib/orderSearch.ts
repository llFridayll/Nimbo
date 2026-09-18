import { Platform } from "@prisma/client";
import { prisma } from "./db";
import { adapters } from "./platforms";
import { upsertOrder } from "./sync";

/** The core "search once, find it anywhere" flow: a support agent pastes
 * whatever the customer gave them (order number, tracking number, phone) and
 * this checks it against every platform without asking which one the order
 * came from. Shared by the SSR orders page and the /api/orders/search route. */
export async function searchOrdersAcrossPlatforms(q: string) {
  let orders = await prisma.order.findMany({
    where: {
      OR: [
        { platformOrderId: { contains: q } },
        { trackingNumber: { contains: q } },
        { buyerPhone: { contains: q } },
        { buyerName: { contains: q } },
      ],
    },
    include: { items: true, problem: true },
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
      include: { items: true, problem: true },
      orderBy: { orderDate: "desc" },
      take: 25,
    });
  }

  return orders;
}
