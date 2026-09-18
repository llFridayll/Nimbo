import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionPayload } from "@/lib/session";

// This route sits outside proxy.ts's auth gate (like the rest of /api) —
// check the session directly rather than getCurrentUser(), which redirects.
export async function GET(req: NextRequest) {
  const session = await getSessionPayload();
  if (!session?.userId) return NextResponse.json({ error: "ยังไม่ได้เข้าสู่ระบบ" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const showResolved = searchParams.get("resolved") === "true";

  const tickets = await prisma.problemTicket.findMany({
    where: { isResolved: showResolved },
    include: { order: { include: { items: true } } },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
  });

  return NextResponse.json({ tickets });
}
