import { NextRequest, NextResponse } from "next/server";
import { Platform, UserRole } from "@prisma/client";
import { runFullHistorySync } from "@/lib/sync";
import { getSessionPayload } from "@/lib/session";

/** Kicks off the one-time full order history backfill. Fire-and-forget: a
 * multi-year pull across many paginated requests can take far longer than an
 * HTTP request should block for, so this returns immediately and progress is
 * tracked via SyncLog / TikTokShop.historyBackfilledAt (see the dashboard).
 *
 * Admin-only, same as the other one-time setup actions (employee management,
 * SKU aliases, order import) — this route sits outside proxy.ts's auth gate
 * (like the rest of /api), so check the session directly here rather than
 * requireAdmin(), which redirects (a page-navigation behavior). */
export async function POST(req: NextRequest) {
  const session = await getSessionPayload();
  if (session?.role !== UserRole.ADMIN) return NextResponse.json({ error: "ต้องเป็นผู้ดูแลระบบเท่านั้น" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const platform = (body.platform ?? Platform.TIKTOK) as Platform;
  const startDate = body.startDate ? new Date(body.startDate) : new Date("2018-01-01");

  if (Number.isNaN(startDate.getTime())) {
    return NextResponse.json({ error: "startDate ไม่ถูกต้อง" }, { status: 400 });
  }

  runFullHistorySync(platform, startDate).catch((err) => {
    console.error(`Full history sync failed for ${platform}:`, err);
  });

  return NextResponse.json({ started: true, platform, startDate });
}
