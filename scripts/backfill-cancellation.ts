// One-off backfill of Order.cancelReason / cancelInitiator / cancelledAt from
// data already sitting in `rawPayload` — no re-sync or re-import needed.
//
// All three platforms report the cancellation, each in its own shape:
//   TikTok  cancel_reason / cancellation_initiator / cancel_time (API object)
//   Shopee  "เหตุผลในการยกเลิกคำสั่งซื้อ" (one cell holding both halves)
//   Lazada  buyerFailedDelivery{Reason,Detail,ReturnInitiator}
// The Shopee and Lazada rows are arrays (one entry per line item); the
// cancellation detail is identical on each, so the first is enough.
//
// Safe to re-run: it only looks at rows whose columns are still empty, and
// writes nothing when the payload has no cancellation detail.
import { PrismaClient, OrderStatus, Platform } from "@prisma/client";
import { parseShopeeCancellation, parseLazadaCancellation } from "../src/lib/platforms/cancellationFields";

const prisma = new PrismaClient();

interface TikTokPayload {
  cancel_reason?: string;
  cancellation_initiator?: string;
  cancel_time?: number;
}

type SheetRow = Record<string, unknown>;

function firstRow(payload: unknown): SheetRow | null {
  const row = Array.isArray(payload) ? payload[0] : payload;
  return row && typeof row === "object" ? (row as SheetRow) : null;
}

function cell(row: SheetRow | null, key: string): string {
  const value = row?.[key];
  return value === undefined || value === null ? "" : String(value);
}

interface Resolved {
  cancelReason: string | null;
  cancelInitiator: string | null;
  cancelledAt: Date | null;
}

function resolve(platform: Platform, payload: unknown): Resolved | null {
  if (platform === Platform.TIKTOK) {
    const raw = payload as TikTokPayload | null;
    if (!raw?.cancel_reason && !raw?.cancellation_initiator && !raw?.cancel_time) return null;
    return {
      cancelReason: raw.cancel_reason ?? null,
      cancelInitiator: raw.cancellation_initiator ?? null,
      // TikTok timestamps are unix seconds, like create_time.
      cancelledAt: raw.cancel_time ? new Date(raw.cancel_time * 1000) : null,
    };
  }

  const row = firstRow(payload);
  const parsed =
    platform === Platform.SHOPEE
      ? parseShopeeCancellation(cell(row, "เหตุผลในการยกเลิกคำสั่งซื้อ"))
      : parseLazadaCancellation(
          cell(row, "buyerFailedDeliveryReason"),
          cell(row, "buyerFailedDeliveryDetail"),
          cell(row, "buyerFailedDeliveryReturnInitiator"),
        );
  if (!parsed.cancelReason && !parsed.cancelInitiator) return null;
  // Neither export carries a cancellation timestamp, so this stays null — the
  // report keys its date window on orderDate for exactly that reason.
  return { cancelReason: parsed.cancelReason ?? null, cancelInitiator: parsed.cancelInitiator ?? null, cancelledAt: null };
}

async function main() {
  // Rows missing EITHER column, not just the reason: the Lazada orders filled
  // from the separate cancellation-report import got a reason but never an
  // initiator, and their payload has one.
  const orders = await prisma.order.findMany({
    where: {
      status: OrderStatus.CANCELLED,
      OR: [{ cancelReason: null }, { cancelInitiator: null }],
    },
    select: { id: true, platform: true, rawPayload: true },
  });
  console.log(`พบออเดอร์ยกเลิกที่ข้อมูลยังไม่ครบ ${orders.length} รายการ`);

  const updated = new Map<Platform, number>();
  let noDetail = 0;
  for (const order of orders) {
    const resolved = resolve(order.platform, order.rawPayload);
    if (!resolved) {
      noDetail++;
      continue;
    }
    await prisma.order.update({
      where: { id: order.id },
      data: {
        // Never blanks a value that is already there — the separate
        // cancellation-report import is an equally valid source.
        ...(resolved.cancelReason ? { cancelReason: resolved.cancelReason } : {}),
        ...(resolved.cancelInitiator ? { cancelInitiator: resolved.cancelInitiator } : {}),
        ...(resolved.cancelledAt ? { cancelledAt: resolved.cancelledAt } : {}),
      },
    });
    updated.set(order.platform, (updated.get(order.platform) ?? 0) + 1);
  }

  for (const [platform, count] of updated) console.log(`  ${platform}: อัปเดต ${count} รายการ`);
  console.log(`ไม่มีข้อมูลการยกเลิกใน rawPayload ${noDetail} รายการ`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
