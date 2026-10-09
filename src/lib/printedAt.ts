import { OrderStatus } from "@prisma/client";
import { shippingCutoffWindowForDate } from "./dateUtils";

// Which moment files an order under a shipping day. The rule, from the
// warehouse: the day an order's tracking number arrives is the day it ships.
//
// Pure and database-free on purpose — sync.ts calls it on every upsert, and
// the one-off backfill reprocesses stored payloads with exactly the same
// rules, so the two can't drift apart.

/** Statuses meaning the parcel hasn't left yet. */
const NOT_YET_SHIPPED: OrderStatus[] = [OrderStatus.NEW, OrderStatus.PENDING_SHIPMENT];

export interface PrintedAtInput {
  status: OrderStatus;
  orderDate: Date;
  trackingNumber?: string | null;
  labelCreatedAt?: Date;
  shippedAt?: Date;
}

/**
 * Returns the printedAt to write, or `undefined` to leave the stored value
 * alone.
 *
 * In order of trust:
 *  1. The platform's own label time (TikTok's rts_time). Exact, and the same
 *     whether the label was printed here or in Seller Center. Always written,
 *     even over an existing value, because it can only be more right.
 *  2. A tracking number already on file → keep what was recorded then.
 *  3. A tracking number seen for the first time:
 *     - the carrier hand-off time if the export has one (Shopee's
 *       "เวลาส่งสินค้า", Lazada's updateTime/deliveredDate), filed under the
 *       day it physically left — see shippedOnItsOwnDay;
 *     - otherwise `now` if the parcel hasn't left — the tracking number has
 *       only just reached us, and the order belongs to the batch being
 *       packed now;
 *     - otherwise, on a brand-new row, the order date. That is a historical
 *       order imported long after it shipped, with nothing better to go on;
 *       stamping it `now` would pile months of old orders onto today's slip.
 *
 * Never earlier than the order itself: a label can't precede its order, and
 * clock skew between platforms shouldn't file one on the day before.
 */
/** A carrier hand-off time stands in for the label time, which must have
 * come before it. A parcel that physically left on a given day belongs to
 * that day's round even when the pickup itself was after the 14:00 cutoff —
 * e.g. a Shopee parcel taken at 14:01 was labelled earlier that day and went
 * out with that day's batch, not tomorrow's. So a hand-off after the cutoff
 * is pulled back to just before it. */
function shippedOnItsOwnDay(shippedAt: Date): Date {
  const sameDay = shippingCutoffWindowForDate(shippedAt);
  return shippedAt >= sameDay.to ? new Date(sameDay.to.getTime() - 1) : shippedAt;
}

export function printedAtFor(
  order: PrintedAtInput,
  existing: { trackingNumber: string | null } | null,
  now: Date,
): Date | null | undefined {
  const clamp = (d: Date) => (d < order.orderDate ? order.orderDate : d);

  if (!order.trackingNumber) return existing ? undefined : null;
  if (order.labelCreatedAt) return clamp(order.labelCreatedAt);
  if (existing?.trackingNumber) return undefined;

  if (order.shippedAt) return clamp(shippedOnItsOwnDay(order.shippedAt));
  if (NOT_YET_SHIPPED.includes(order.status) || existing) return clamp(now);
  return order.orderDate;
}
