import { NextResponse } from "next/server";
import { syncAllPlatforms } from "@/lib/sync";
import { getSessionPayload } from "@/lib/session";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activityLog";

export async function POST() {
  // This route sits outside proxy.ts's auth gate (like the rest of /api),
  // so unlike a Server Action there's no guarantee a session cookie is
  // present — check it directly instead of getCurrentUser(), which redirects
  // (a page-navigation behavior, not appropriate for a Route Handler).
  const session = await getSessionPayload();
  if (!session?.userId) return NextResponse.json({ error: "ยังไม่ได้เข้าสู่ระบบ" }, { status: 401 });

  const results = await syncAllPlatforms();

  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { username: true } });
  if (user) await logActivity({ userId: session.userId, username: user.username, action: "MANUAL_SYNC" });

  return NextResponse.json({ results });
}
