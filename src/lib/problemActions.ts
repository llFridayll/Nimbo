"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/dal";
import { logActivity } from "@/lib/activityLog";

export async function setProblemResolved(ticketId: string, isResolved: boolean) {
  const user = await getCurrentUser();

  const ticket = await prisma.problemTicket.update({
    where: { id: ticketId },
    data: { isResolved, resolvedAt: isResolved ? new Date() : null },
    select: { order: { select: { platformOrderId: true } } },
  });
  await logActivity({
    userId: user.id,
    username: user.username,
    action: isResolved ? "PROBLEM_RESOLVE" : "PROBLEM_REOPEN",
    detail: `ออเดอร์ #${ticket.order.platformOrderId}`,
  });
  revalidatePath("/problems");
  revalidatePath("/");
}

/** Bulk version of setProblemResolved for the /problems select-all checklist
 * — `isResolved` is bound ahead of the selected ids (see the page's
 * `.bind(null, !showResolved)`), since which direction "the button" toggles
 * depends on which tab (unresolved/resolved) it was clicked from. */
export async function resolveManyProblems(isResolved: boolean, formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  const ids = formData.getAll("ids").map(String);
  if (ids.length === 0) return;

  const tickets = await prisma.problemTicket.findMany({
    where: { id: { in: ids } },
    select: { order: { select: { platformOrderId: true } } },
  });
  await prisma.problemTicket.updateMany({
    where: { id: { in: ids } },
    data: { isResolved, resolvedAt: isResolved ? new Date() : null },
  });
  await logActivity({
    userId: user.id,
    username: user.username,
    action: isResolved ? "PROBLEM_RESOLVE" : "PROBLEM_REOPEN",
    detail: `แก้ไขพร้อมกัน ${tickets.length} รายการ: ${tickets.map((t) => `#${t.order.platformOrderId}`).join(", ")}`,
  });
  revalidatePath("/problems");
  revalidatePath("/");
}
