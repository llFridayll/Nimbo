import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { canAccess, getMessages, sendMessage } from "@/lib/chat";
import { getSessionPayload } from "@/lib/session";

/** One thread's messages.
 *
 * - `?conversationId=X` alone returns the most recent page, oldest-first.
 * - `?since=<ISO>` returns only what arrived after that — pass the last
 *   message's createdAt back to poll for new ones, same contract as
 *   /api/events.
 *
 * Membership is checked on every call, not just when the thread is opened: a
 * conversation id is guessable, and without this anyone signed in could poll
 * a colleague's DM by id. */
export async function GET(req: NextRequest) {
  const session = await getSessionPayload();
  if (!session?.userId) return NextResponse.json({ error: "ยังไม่ได้เข้าสู่ระบบ" }, { status: 401 });

  const conversationId = req.nextUrl.searchParams.get("conversationId");
  if (!conversationId) return NextResponse.json({ error: "ต้องระบุ conversationId" }, { status: 400 });
  if (!(await canAccess(session.userId, conversationId))) {
    return NextResponse.json({ error: "ไม่มีสิทธิ์เข้าถึงห้องนี้" }, { status: 403 });
  }

  const sinceParam = req.nextUrl.searchParams.get("since");
  const since = sinceParam ? new Date(sinceParam) : undefined;
  if (since && Number.isNaN(since.getTime())) {
    return NextResponse.json({ error: "since ไม่ถูกต้อง" }, { status: 400 });
  }

  return NextResponse.json({ messages: await getMessages(conversationId, since) });
}

export async function POST(req: NextRequest) {
  const session = await getSessionPayload();
  if (!session?.userId) return NextResponse.json({ error: "ยังไม่ได้เข้าสู่ระบบ" }, { status: 401 });

  const payload = (await req.json().catch(() => null)) as { conversationId?: string; body?: string } | null;
  if (!payload?.conversationId || typeof payload.body !== "string") {
    return NextResponse.json({ error: "ข้อมูลไม่ครบ" }, { status: 400 });
  }
  if (!(await canAccess(session.userId, payload.conversationId))) {
    return NextResponse.json({ error: "ไม่มีสิทธิ์ส่งข้อความในห้องนี้" }, { status: 403 });
  }

  // senderName is stored on the message so history stays readable after an
  // account is deleted — read the current one rather than trusting the client.
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { displayName: true },
  });
  if (!user) return NextResponse.json({ error: "ไม่พบบัญชีผู้ใช้" }, { status: 401 });

  try {
    const message = await sendMessage({
      conversationId: payload.conversationId,
      senderId: session.userId,
      senderName: user.displayName,
      body: payload.body,
    });
    return NextResponse.json({ message });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "ส่งข้อความไม่สำเร็จ" }, { status: 400 });
  }
}
