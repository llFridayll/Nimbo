import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionPayload } from "@/lib/session";

// This route sits outside proxy.ts's auth gate (like the rest of /api) —
// check the session directly rather than getCurrentUser(), which redirects.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionPayload();
  if (!session?.userId) return NextResponse.json({ error: "ยังไม่ได้เข้าสู่ระบบ" }, { status: 401 });

  const { id } = await params;
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      items: true,
      problem: true,
      statusHistory: { orderBy: { occurredAt: "asc" } },
    },
  });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  return NextResponse.json({ order });
}
