import { NextRequest, NextResponse } from "next/server";
import { openDirectConversation } from "@/lib/chat";
import { getSessionPayload } from "@/lib/session";

/** Opens (creating on first use) the DM between the caller and one colleague,
 * and returns its conversation id. */
export async function POST(req: NextRequest) {
  const session = await getSessionPayload();
  if (!session?.userId) return NextResponse.json({ error: "ยังไม่ได้เข้าสู่ระบบ" }, { status: 401 });

  const payload = (await req.json().catch(() => null)) as { userId?: string } | null;
  if (!payload?.userId) return NextResponse.json({ error: "ต้องระบุ userId" }, { status: 400 });

  try {
    const conversationId = await openDirectConversation(session.userId, payload.userId);
    return NextResponse.json({ conversationId });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "เปิดแชทไม่สำเร็จ" }, { status: 400 });
  }
}
