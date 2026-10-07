import { NextRequest, NextResponse } from "next/server";
import { canAccess, markRead } from "@/lib/chat";
import { getSessionPayload } from "@/lib/session";

/** Moves this user's "read up to here" mark to now, clearing the thread's
 * unread badge on the next poll. */
export async function POST(req: NextRequest) {
  const session = await getSessionPayload();
  if (!session?.userId) return NextResponse.json({ error: "ยังไม่ได้เข้าสู่ระบบ" }, { status: 401 });

  const payload = (await req.json().catch(() => null)) as { conversationId?: string } | null;
  if (!payload?.conversationId) return NextResponse.json({ error: "ต้องระบุ conversationId" }, { status: 400 });
  if (!(await canAccess(session.userId, payload.conversationId))) {
    return NextResponse.json({ error: "ไม่มีสิทธิ์เข้าถึงห้องนี้" }, { status: 403 });
  }

  await markRead(payload.conversationId, session.userId);
  return NextResponse.json({ ok: true });
}
