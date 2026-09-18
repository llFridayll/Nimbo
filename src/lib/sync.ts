import { OrderStatus, Platform, ProblemType } from "@prisma/client";
import { prisma } from "./db";
import { adapters } from "./platforms";
import { NormalizedOrder } from "./platforms/types";
import { startOfDaysAgoBangkok } from "./dateUtils";

const DELAYED_SHIPMENT_THRESHOLD_MS = 2 * 24 * 60 * 60 * 1000; // 2 days

/** Decides whether a normalized order should open (or keep open) a problem
 * ticket, and what kind. Runs on every sync/webhook so problems surface
 * automatically instead of requiring a human to notice. */
function detectProblem(order: NormalizedOrder): { type: ProblemType; description: string } | null {
  if (order.status === OrderStatus.REFUND_REQUESTED) {
    return { type: ProblemType.REFUND_DISPUTE, description: "ลูกค้าขอคืนเงิน/คืนสินค้า รอดำเนินการ" };
  }
  if (order.status === OrderStatus.PROBLEM) {
    return { type: ProblemType.OTHER, description: "แพลตฟอร์มรายงานสถานะผิดปกติ ต้องตรวจสอบ" };
  }
  if (order.shippingStatus === "exception") {
    return { type: ProblemType.LOST_PACKAGE, description: "ขนส่งแจ้งสถานะผิดปกติ (exception)" };
  }
  if (
    order.status === OrderStatus.PENDING_SHIPMENT &&
    Date.now() - order.orderDate.getTime() > DELAYED_SHIPMENT_THRESHOLD_MS
  ) {
    return { type: ProblemType.DELAYED_SHIPMENT, description: "รอจัดส่งเกิน 2 วันนับจากวันสั่งซื้อ" };
  }
  return null;
}

/** Upserts one normalized order (from a sync pull or a webhook), appends a
 * status-history row when the status actually changed, and opens/keeps a
 * ProblemTicket in sync with the detected problem state. */
export async function upsertOrder(order: NormalizedOrder) {
  const existing = await prisma.order.findUnique({
    where: { platform_platformOrderId: { platform: order.platform, platformOrderId: order.platformOrderId } },
  });

  // The moment a tracking number first appears is the real-world "label
  // printed" event the shipping summary buckets orders by (see
  // shippingSummary.ts) — only stamp it on that first transition, never
  // overwrite an already-recorded printedAt.
  const becomesPrinted = !existing?.trackingNumber && Boolean(order.trackingNumber);

  const saved = await prisma.order.upsert({
    where: { platform_platformOrderId: { platform: order.platform, platformOrderId: order.platformOrderId } },
    create: {
      platform: order.platform,
      platformOrderId: order.platformOrderId,
      status: order.status,
      buyerName: order.buyerName,
      buyerPhone: order.buyerPhone,
      buyerUsername: order.buyerUsername,
      buyerRegion: order.buyerRegion,
      totalAmount: order.totalAmount,
      currency: order.currency,
      orderDate: order.orderDate,
      shippingCarrier: order.shippingCarrier,
      trackingNumber: order.trackingNumber,
      shippingStatus: order.shippingStatus,
      // A brand-new order that ALREADY carries a tracking number (typical
      // for a Shopee/Lazada file exported after the seller already printed
      // the label there) was clearly printed before this moment, not "just
      // now" — the order's own date is a far better estimate than the
      // import timestamp, which would otherwise dump a whole batch of
      // already-shipped historical orders into today's folder. A live-synced
      // platform (TikTok) instead normally sees the order BEFORE it has a
      // tracking number, so the real "just printed" moment is caught by the
      // update branch below when it later transitions to having one.
      printedAt: order.trackingNumber ? order.orderDate : null,
      shopId: order.shopId,
      shopName: order.shopName,
      isUnpaid: order.isUnpaid ?? false,
      rawPayload: order.rawPayload as never,
      items: {
        create: order.items.map((it) => ({
          sku: it.sku,
          productName: it.productName,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          imageUrl: it.imageUrl,
        })),
      },
      statusHistory: {
        create: { status: order.status, occurredAt: order.orderDate },
      },
    },
    update: {
      status: order.status,
      buyerName: order.buyerName,
      buyerPhone: order.buyerPhone,
      buyerUsername: order.buyerUsername,
      buyerRegion: order.buyerRegion,
      totalAmount: order.totalAmount,
      shippingCarrier: order.shippingCarrier,
      trackingNumber: order.trackingNumber,
      shippingStatus: order.shippingStatus,
      ...(becomesPrinted ? { printedAt: new Date() } : {}),
      shopId: order.shopId,
      shopName: order.shopName,
      isUnpaid: order.isUnpaid ?? false,
      rawPayload: order.rawPayload as never,
    },
  });

  if (!existing || existing.status !== order.status) {
    await prisma.orderStatusHistory.create({
      data: { orderId: saved.id, status: order.status, occurredAt: new Date() },
    });
  }

  const problem = detectProblem(order);
  if (problem) {
    const existingTicket = await prisma.problemTicket.findUnique({ where: { orderId: saved.id } });
    // Staff already resolved this exact issue (applyOrderStatusChange in
    // orderActions.ts sets isResolved on a manual status change) — the
    // platform's underlying condition (e.g. still >2 days late) often hasn't
    // changed by the very next sync, so re-detecting the SAME problem type
    // must not silently reopen it or flip the order back to PROBLEM; that
    // previously made a resolved ticket disappear from Problem Center while
    // the order stayed stuck on PROBLEM with no UI surface explaining why. A
    // genuinely different problem type after resolution is still treated as
    // new and reopens it below.
    const alreadyResolvedSameProblem = existingTicket?.isResolved && existingTicket.type === problem.type;
    if (!alreadyResolvedSameProblem) {
      await prisma.problemTicket.upsert({
        where: { orderId: saved.id },
        create: {
          orderId: saved.id,
          type: problem.type,
          description: problem.description,
        },
        update: {
          type: problem.type,
          description: problem.description,
          isResolved: false,
          resolvedAt: null,
        },
      });
      if (saved.status !== OrderStatus.PROBLEM && order.status !== OrderStatus.REFUND_REQUESTED) {
        await prisma.order.update({ where: { id: saved.id }, data: { status: OrderStatus.PROBLEM } });
      }
    }
  }

  return saved;
}

/** 14 days back (not just today) so that late status changes on recent
 * orders — returns, refused deliveries getting shipped back, refund
 * disputes — still get picked up instead of only catching orders placed
 * today. The full order history is a separate one-time backfill (see
 * runFullHistorySync below). */
const ROUTINE_SYNC_LOOKBACK_DAYS = 14;

export async function syncPlatform(platform: Platform, lookbackDays: number = ROUTINE_SYNC_LOOKBACK_DAYS) {
  const adapter = adapters[platform];
  const log = await prisma.syncLog.create({ data: { platform } });
  try {
    const orders = await adapter.fetchRecentOrders(startOfDaysAgoBangkok(lookbackDays));
    for (const order of orders) {
      await upsertOrder(order);
    }
    await prisma.syncLog.update({
      where: { id: log.id },
      data: { finishedAt: new Date(), success: true, ordersSynced: orders.length },
    });
    return { platform, count: orders.length };
  } catch (err) {
    await prisma.syncLog.update({
      where: { id: log.id },
      data: { finishedAt: new Date(), success: false, errorMessage: (err as Error).message },
    });
    throw err;
  }
}

export async function syncAllPlatforms(lookbackDays: number = ROUTINE_SYNC_LOOKBACK_DAYS) {
  const results = await Promise.allSettled(
    (Object.values(Platform) as Platform[]).map((p) => syncPlatform(p, lookbackDays))
  );
  return results.map((r, i) => {
    const platform = (Object.values(Platform) as Platform[])[i];
    return r.status === "fulfilled" ? r.value : { platform, error: r.reason?.message ?? "sync failed" };
  });
}

/** One-time full order history backfill, from `startDate` (e.g. when the shop
 * opened) up to now. Meant to be run once per shop, not on a schedule —
 * routine syncs (syncPlatform/syncAllPlatforms above) only ever pull today's
 * orders. Marks TikTokShop.historyBackfilledAt on success so the dashboard
 * knows not to offer the button again. */
export async function runFullHistorySync(platform: Platform, startDate: Date) {
  const adapter = adapters[platform];
  if (!adapter.fetchOrderHistory) {
    throw new Error(`Platform ${platform} does not support a full history backfill yet.`);
  }

  if (platform === Platform.TIKTOK) {
    await prisma.tikTokShop.updateMany({ data: { historyBackfillStartedAt: new Date() } });
  }

  const log = await prisma.syncLog.create({ data: { platform } });
  try {
    const total = await adapter.fetchOrderHistory(startDate, async (batch) => {
      for (const order of batch) {
        await upsertOrder(order);
      }
    });

    await prisma.syncLog.update({
      where: { id: log.id },
      data: { finishedAt: new Date(), success: true, ordersSynced: total },
    });

    if (platform === Platform.TIKTOK) {
      await prisma.tikTokShop.updateMany({ data: { historyBackfilledAt: new Date() } });
    }

    return { platform, count: total };
  } catch (err) {
    await prisma.syncLog.update({
      where: { id: log.id },
      data: { finishedAt: new Date(), success: false, errorMessage: (err as Error).message },
    });
    throw err;
  }
}
