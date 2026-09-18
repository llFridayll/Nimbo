import { NextRequest, NextResponse } from "next/server";
import { searchOrdersAcrossPlatforms } from "@/lib/orderSearch";
import { getSessionPayload } from "@/lib/session";

// This route sits outside proxy.ts's auth gate (like the rest of /api) —
// check the session directly rather than getCurrentUser(), which redirects.
export async function GET(req: NextRequest) {
  const session = await getSessionPayload();
  if (!session?.userId) return NextResponse.json({ error: "ยังไม่ได้เข้าสู่ระบบ" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ orders: [] });

  const orders = await searchOrdersAcrossPlatforms(q);
  return NextResponse.json({ orders });
}
