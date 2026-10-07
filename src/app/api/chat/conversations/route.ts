import { NextResponse } from "next/server";
import { listConversations } from "@/lib/chat";
import { getSessionPayload } from "@/lib/session";

/** The widget's heartbeat: every thread with its unread count. Polled every
 * few seconds by every open tab, so keep anything added here cheap — the list
 * of people to start a DM with lives at /api/chat/partners precisely because
 * it does not belong on a timer.
 *
 * This route sits outside proxy.ts's auth gate (like the rest of /api) — check
 * the session directly rather than getCurrentUser(), which redirects. */
export async function GET() {
  const session = await getSessionPayload();
  if (!session?.userId) return NextResponse.json({ error: "ยังไม่ได้เข้าสู่ระบบ" }, { status: 401 });

  const conversations = await listConversations(session.userId);
  return NextResponse.json({ conversations, meId: session.userId });
}
