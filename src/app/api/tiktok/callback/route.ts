import { NextRequest, NextResponse } from "next/server";
import { Platform } from "@prisma/client";
import { completeAuthorization, consumeOAuthState, requireEnv } from "@/lib/platforms/tiktokAuth";
import { runFullHistorySync } from "@/lib/sync";

/** How far back a freshly connected shop's one-time history backfill reaches
 * — TikTok Shop didn't operate in Thailand before this, so it's a safe
 * "since the shop opened" stand-in without needing an actual open-date field
 * (TikTok's API doesn't expose one). */
const HISTORY_BACKFILL_START_DATE = new Date("2018-01-01");

/** TikTok redirects here (TIKTOK_SHOP_REDIRECT_URI) after the merchant clicks
 * Authorize, with `code` in the query string. We exchange it for real tokens,
 * look up which shop(s) it covers, and store everything in the DB.
 *
 * The `state` param is checked against the one issued in /api/tiktok/authorize
 * (see consumeOAuthState) before trusting this callback, guarding against
 * OAuth CSRF — a crafted callback URL carrying an attacker-obtained `code`
 * would otherwise be accepted just as if it were legitimate. */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.json({ error: "Missing `code` from TikTok redirect" }, { status: 400 });
  }
  const state = req.nextUrl.searchParams.get("state");
  if (!(await consumeOAuthState(state))) {
    return NextResponse.json(
      { error: "ลิงก์ยืนยันหมดอายุหรือไม่ถูกต้อง — กรุณากด \"เชื่อมต่อร้าน TikTok Shop\" ใหม่อีกครั้ง" },
      { status: 400 }
    );
  }

  try {
    const { shops } = await completeAuthorization(code);
    const shopNames = shops.map((s) => s.name ?? s.id).join(", ") || "ไม่พบร้านค้า";

    // Fire-and-forget: pull this shop's (and any other connected shop's)
    // full order history in the background rather than blocking the OAuth
    // redirect on what can be a multi-year, multi-page pull. Progress is
    // tracked via TikTokShop.historyBackfillStartedAt/historyBackfilledAt,
    // shown on the dashboard.
    if (shops.length > 0) {
      runFullHistorySync(Platform.TIKTOK, HISTORY_BACKFILL_START_DATE).catch((err) => {
        console.error("Automatic TikTok history backfill failed:", err);
      });
    }
    // req.nextUrl.origin can't be trusted here — behind ngrok/dev it sometimes
    // resolves to the local bind address (e.g. https://localhost:3000, which
    // doesn't serve TLS and breaks the redirect) instead of the public URL
    // TikTok actually called back to. Derive the origin from the same redirect
    // URI registered with TikTok instead.
    const redirectUriOrigin = new URL(requireEnv("TIKTOK_SHOP_REDIRECT_URI")).origin;
    return NextResponse.redirect(
      new URL(`/?tiktok_connected=1&shops=${encodeURIComponent(shopNames)}`, redirectUriOrigin)
    );
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
