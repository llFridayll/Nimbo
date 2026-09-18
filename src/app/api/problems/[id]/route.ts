import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionPayload } from "@/lib/session";

// This route sits outside proxy.ts's auth gate (like the rest of /api), so
// unlike a Server Action there's no guarantee a session cookie is present —
// check it directly rather than getCurrentUser(), which redirects (a
// page-navigation behavior, not appropriate for a Route Handler).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionPayload();
  if (!session?.userId) return NextResponse.json({ error: "ยังไม่ได้เข้าสู่ระบบ" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const data: { isResolved?: boolean; resolvedAt?: Date | null; assignee?: string; priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT" } = {};
  if (typeof body.isResolved === "boolean") {
    data.isResolved = body.isResolved;
    data.resolvedAt = body.isResolved ? new Date() : null;
  }
  if (typeof body.assignee === "string") data.assignee = body.assignee;
  if (typeof body.priority === "string") data.priority = body.priority;

  const ticket = await prisma.problemTicket.update({ where: { id }, data });
  return NextResponse.json({ ticket });
}
