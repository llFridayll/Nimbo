import { NextResponse } from "next/server";
import { OrderStatus, Platform } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSessionPayload } from "@/lib/session";

// This route sits outside proxy.ts's auth gate (like the rest of /api) —
// check the session directly rather than getCurrentUser(), which redirects.
export async function GET() {
  const session = await getSessionPayload();
  if (!session?.userId) return NextResponse.json({ error: "ยังไม่ได้เข้าสู่ระบบ" }, { status: 401 });

  const [byStatus, byPlatform, problemCount] = await Promise.all([
    prisma.order.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.order.groupBy({ by: ["platform"], _count: { _all: true } }),
    prisma.problemTicket.count({ where: { isResolved: false } }),
  ]);

  const statusCounts = Object.fromEntries(
    Object.values(OrderStatus).map((s) => [s, 0])
  ) as Record<OrderStatus, number>;
  for (const row of byStatus) statusCounts[row.status] = row._count._all;

  const platformCounts = Object.fromEntries(
    Object.values(Platform).map((p) => [p, 0])
  ) as Record<Platform, number>;
  for (const row of byPlatform) platformCounts[row.platform] = row._count._all;

  return NextResponse.json({ statusCounts, platformCounts, openProblems: problemCount });
}
