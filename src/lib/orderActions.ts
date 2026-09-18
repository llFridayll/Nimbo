"use server";

import { revalidatePath } from "next/cache";
import { OrderStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getCurrentUser, type CurrentUser } from "@/lib/dal";
import { logActivity } from "@/lib/activityLog";
import { statusLabel } from "@/lib/labels";

const ALL_STATUSES = new Set<string>(Object.values(OrderStatus));

/** Shared core for every manual status-override path below — updates each
 * order, appends a status-history row, and auto-resolves any still-open
 * ProblemTicket once the order is no longer PROBLEM (so staff don't have to
 * separately remember to also click "แก้ไขแล้ว" in Problem Center). Skips an
 * order already at the target status so a no-op selection doesn't create a
 * spurious history row. */
async function applyOrderStatusChange(
  orders: { id: string; platformOrderId: string; status: OrderStatus; problemId: string | null; problemResolved: boolean }[],
  nextStatus: OrderStatus,
  user: Pick<CurrentUser, "id" | "username" | "displayName">,
  noteSuffix: string
) {
  const changed = orders.filter((o) => o.status !== nextStatus);
  if (changed.length === 0) return;

  for (const order of changed) {
    await prisma.$transaction([
      prisma.order.update({ where: { id: order.id }, data: { status: nextStatus } }),
      prisma.orderStatusHistory.create({
        data: { orderId: order.id, status: nextStatus, note: `เปลี่ยนสถานะด้วยมือ${noteSuffix}โดย ${user.displayName}` },
      }),
      ...(nextStatus !== OrderStatus.PROBLEM && order.problemId && !order.problemResolved
        ? [prisma.problemTicket.update({ where: { id: order.problemId }, data: { isResolved: true, resolvedAt: new Date() } })]
        : []),
    ]);
  }

  await logActivity({
    userId: user.id,
    username: user.username,
    action: "ORDER_STATUS_MANUAL_CHANGE",
    detail:
      changed.length === 1
        ? `ออเดอร์ #${changed[0].platformOrderId}: ${statusLabel[changed[0].status]} → ${statusLabel[nextStatus]}`
        : `เปลี่ยนสถานะพร้อมกัน ${changed.length} รายการ เป็น ${statusLabel[nextStatus]}: ${changed.map((o) => `#${o.platformOrderId}`).join(", ")}`,
  });

  revalidatePath("/orders");
  revalidatePath("/problems");
  revalidatePath("/");
  for (const order of changed) revalidatePath(`/orders/${order.id}`);
}

/** Manual staff override for one order's status — the only such path in the
 * app; every other status change comes from upsertOrder() re-syncing the
 * real platform (see src/lib/sync.ts). Exists because that sync-only flow
 * leaves an order stuck showing "มีปัญหา" forever if the real-world issue
 * got fixed but the platform sync hasn't (or can't, for manually-imported
 * Shopee/Lazada orders) reflect that yet. */
export async function setOrderStatus(orderId: string, status: OrderStatus) {
  const user = await getCurrentUser();
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, platformOrderId: true, status: true, problem: { select: { id: true, isResolved: true } } },
  });
  if (!order) throw new Error("ไม่พบออเดอร์นี้");

  await applyOrderStatusChange(
    [{ ...order, problemId: order.problem?.id ?? null, problemResolved: order.problem?.isResolved ?? false }],
    status,
    user,
    ""
  );
}

/** Bulk version for the /problems ticket-list select-all checklist — takes
 * ProblemTicket ids (that list's checkboxes are keyed by ticket) and resolves
 * each ticket's order. */
export async function setManyOrdersStatus(formData: FormData): Promise<void> {
  const status = formData.get("status");
  if (typeof status !== "string" || !ALL_STATUSES.has(status)) return; // no status chosen — no-op
  const ticketIds = formData.getAll("ids").map(String);
  if (ticketIds.length === 0) return;

  const user = await getCurrentUser();
  const tickets = await prisma.problemTicket.findMany({
    where: { id: { in: ticketIds } },
    select: { id: true, isResolved: true, order: { select: { id: true, platformOrderId: true, status: true } } },
  });

  await applyOrderStatusChange(
    tickets.map((t) => ({ ...t.order, problemId: t.id, problemResolved: t.isResolved })),
    status as OrderStatus,
    user,
    " (เลือกหลายรายการ) "
  );
}

/** Bulk version for the "กิจกรรมล่าสุด" activity feed's multi-select — that
 * feed is keyed by order events, not ProblemTicket rows (a CANCELLED/RETURNED
 * event doesn't necessarily have one — see detectProblem() in sync.ts), so
 * this takes order ids directly instead of going through a ticket lookup. */
export async function setManyOrderStatusByOrderIds(orderIds: string[], status: OrderStatus): Promise<void> {
  if (!ALL_STATUSES.has(status) || orderIds.length === 0) return;

  const user = await getCurrentUser();
  const orders = await prisma.order.findMany({
    where: { id: { in: orderIds } },
    select: { id: true, platformOrderId: true, status: true, problem: { select: { id: true, isResolved: true } } },
  });

  await applyOrderStatusChange(
    orders.map((o) => ({ ...o, problemId: o.problem?.id ?? null, problemResolved: o.problem?.isResolved ?? false })),
    status,
    user,
    " (เลือกหลายรายการ) "
  );
}
