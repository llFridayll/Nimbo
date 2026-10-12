import { NextResponse } from "next/server";
import { getOpenAnnouncements } from "@/lib/announcements";
import { getSessionPayload } from "@/lib/session";

/** Polled by AnnouncementBar in every open tab, so a notice someone posts
 * shows up for everyone without a reload. */
export async function GET() {
  const session = await getSessionPayload();
  if (!session?.userId) return NextResponse.json({ error: "ยังไม่ได้เข้าสู่ระบบ" }, { status: 401 });
  return NextResponse.json({ announcements: await getOpenAnnouncements() });
}
