import { NextRequest, NextResponse } from "next/server";
import { OrderStatus, Platform } from "@prisma/client";
import { listOrders } from "@/lib/orderQueries";
import { getSessionPayload } from "@/lib/session";

// This route sits outside proxy.ts's auth gate (like the rest of /api) —
// check the session directly rather than getCurrentUser(), which redirects.
export async function GET(req: NextRequest) {
  const session = await getSessionPayload();
  if (!session?.userId) return NextResponse.json({ error: "ยังไม่ได้เข้าสู่ระบบ" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const statusParam = searchParams.get("status") as OrderStatus | null;
  const platformParam = searchParams.get("platform") as Platform | null;
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));

  const result = await listOrders({
    status: statusParam && Object.values(OrderStatus).includes(statusParam) ? statusParam : undefined,
    platform: platformParam && Object.values(Platform).includes(platformParam) ? platformParam : undefined,
    page,
  });

  return NextResponse.json(result);
}
