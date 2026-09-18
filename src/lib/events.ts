import { OrderStatus, Platform } from "@prisma/client";
import { prisma } from "./db";

/** One row from OrderStatusHistory joined with its order's display fields —
 * the general-purpose "something happened to an order" feed. A brand new
 * order's very first status counts as an event too (sync.ts creates that
 * first history row right when the order is first seen), so this doubles as
 * "order came in" without any separate tracking. */
export interface OrderEvent {
  id: string;
  orderId: string;
  platform: Platform;
  platformOrderId: string;
  shopName: string | null;
  buyerName: string | null;
  totalAmount: number;
  currency: string;
  status: OrderStatus;
  occurredAt: string;
  createdAt: string;
}

/** Statuses worth surfacing in a "needs attention" activity feed (Problem
 * Center's live feed) — excludes the routine happy-path flow
 * (NEW → PENDING_SHIPMENT → SHIPPED → DELIVERED) that makes up the bulk of
 * event volume and was drowning out the events that actually matter there.
 * Callers that want the full unfiltered stream (e.g. an external LINE bot
 * polling /api/events) simply don't pass this — see the `statuses` param
 * below, which is opt-in and defaults to no filtering. */
export const NOTABLE_EVENT_STATUSES: OrderStatus[] = [
  OrderStatus.PROBLEM,
  OrderStatus.CANCELLED,
  OrderStatus.REFUND_REQUESTED,
  OrderStatus.RETURNED,
];

const EVENT_SELECT = {
  id: true,
  orderId: true,
  status: true,
  occurredAt: true,
  createdAt: true,
  order: {
    select: {
      platform: true,
      platformOrderId: true,
      shopName: true,
      buyerName: true,
      totalAmount: true,
      currency: true,
    },
  },
} as const;

function toOrderEvent(row: {
  id: string;
  orderId: string;
  status: OrderStatus;
  occurredAt: Date;
  createdAt: Date;
  order: { platform: Platform; platformOrderId: string; shopName: string | null; buyerName: string | null; totalAmount: unknown; currency: string };
}): OrderEvent {
  return {
    id: row.id,
    orderId: row.orderId,
    platform: row.order.platform,
    platformOrderId: row.order.platformOrderId,
    shopName: row.order.shopName,
    buyerName: row.order.buyerName,
    totalAmount: Number(row.order.totalAmount),
    currency: row.order.currency,
    status: row.status,
    occurredAt: row.occurredAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

/** Most recent N events (newest first) — used for the feed's first load and
 * for a bot's very first poll (no cursor yet). Pass `statuses` to restrict to
 * orders whose *current* status is in that set (see NOTABLE_EVENT_STATUSES)
 * — omitted, every event is included regardless of the order's status now.
 *
 * Deliberately filters on `order.status` (the order's status right now), not
 * this history row's own frozen `status` snapshot: an order's PROBLEM-status
 * history row never stops being "PROBLEM", so filtering on the row itself
 * meant a fixed order's old problem event kept resurfacing on every refresh
 * forever, looking exactly like the fix hadn't taken (it had — Order.status
 * was correctly updated, only the feed query was checking the wrong field). */
export async function getRecentOrderEvents(limit: number, statuses?: OrderStatus[]): Promise<OrderEvent[]> {
  const rows = await prisma.orderStatusHistory.findMany({
    where: statuses ? { order: { status: { in: statuses } } } : undefined,
    orderBy: { createdAt: "desc" },
    take: limit,
    select: EVENT_SELECT,
  });
  return rows.map(toOrderEvent);
}

/** Events recorded since `since` (exclusive), oldest first — the shape a
 * polling consumer (e.g. a LINE notification bot) wants: process in order,
 * then remember the last item's `createdAt` as the next poll's `since`. Pass
 * `statuses` to restrict to orders currently in that state, same as
 * getRecentOrderEvents (see its comment for why this filters on
 * `order.status` rather than the history row's own status). */
export async function getOrderEventsSince(since: Date, limit: number, statuses?: OrderStatus[]): Promise<OrderEvent[]> {
  const rows = await prisma.orderStatusHistory.findMany({
    where: statuses ? { createdAt: { gt: since }, order: { status: { in: statuses } } } : { createdAt: { gt: since } },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: EVENT_SELECT,
  });
  return rows.map(toOrderEvent);
}
