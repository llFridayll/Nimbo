import { NextRequest, NextResponse } from "next/server";
import { OrderStatus } from "@prisma/client";
import { getOrderEventsSince, getRecentOrderEvents } from "@/lib/events";
import { getSessionPayload } from "@/lib/session";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const VALID_STATUSES = new Set<string>(Object.values(OrderStatus));

/** General order-event feed: every order status change (a new order arriving
 * counts too — see events.ts), newest activity available for the dashboard's
 * live feed. Requires a logged-in session (this route sits outside proxy.ts's
 * auth gate, like the rest of /api) — a future external consumer (e.g. a LINE
 * notification bot) would need its own way to authenticate, not an open feed.
 *
 * - First call: `GET /api/events` (optionally `?limit=N`) returns the most
 *   recent events, newest first.
 * - Subsequent polls: `GET /api/events?since=<ISO timestamp>` returns only
 *   events recorded after that point, oldest first — store the last item's
 *   `createdAt` from the response and pass it back as `since` next time.
 * - Optional `?statuses=PROBLEM,CANCELLED` restricts to those statuses only
 *   (unknown values are ignored rather than erroring, so a typo just widens
 *   back toward "no filter" instead of breaking the call) — omitted, every
 *   status comes through unfiltered, so existing consumers are unaffected. */
export async function GET(req: NextRequest) {
  const session = await getSessionPayload();
  if (!session?.userId) return NextResponse.json({ error: "ยังไม่ได้เข้าสู่ระบบ" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const limitParam = Number(searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, MAX_LIMIT) : DEFAULT_LIMIT;

  const statusesParam = searchParams.get("statuses");
  const statuses = statusesParam
    ? (statusesParam.split(",").filter((s) => VALID_STATUSES.has(s)) as OrderStatus[])
    : undefined;

  const sinceParam = searchParams.get("since");
  if (sinceParam) {
    const since = new Date(sinceParam);
    if (Number.isNaN(since.getTime())) {
      return NextResponse.json({ error: "`since` ไม่ใช่วันที่ที่ถูกต้อง (ต้องเป็น ISO timestamp)" }, { status: 400 });
    }
    const events = await getOrderEventsSince(since, limit, statuses);
    return NextResponse.json({ events });
  }

  const events = await getRecentOrderEvents(limit, statuses);
  return NextResponse.json({ events });
}
