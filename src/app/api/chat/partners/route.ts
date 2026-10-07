import { NextResponse } from "next/server";
import { listChatPartners } from "@/lib/chat";
import { getSessionPayload } from "@/lib/session";

/** Colleagues a new DM can be started with. Split out of /conversations on
 * purpose: that route runs on a 5-second timer in every open tab, and this
 * list only matters in the moment someone opens the "start a DM" picker. */
export async function GET() {
  const session = await getSessionPayload();
  if (!session?.userId) return NextResponse.json({ error: "ยังไม่ได้เข้าสู่ระบบ" }, { status: 401 });
  return NextResponse.json({ partners: await listChatPartners(session.userId) });
}
