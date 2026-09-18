import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { adapters } from "@/lib/platforms";
import { upsertOrder } from "@/lib/sync";
import { Platform } from "@prisma/client";

/** TikTok Shop's webhook signature scheme: HMAC-SHA256(app_secret, app_key +
 * raw_body) -> lowercase hex, carried in the plain `Authorization` header
 * (no "Bearer" prefix, not the x-tts-signature header an earlier version of
 * this file assumed — confirmed against TikTok's actual webhook
 * verification docs). Must be checked against the exact raw body bytes; if
 * this ever parses the JSON first and re-verifies against a
 * re-serialized copy, whitespace/key-order differences would invalidate an
 * otherwise legitimate signature. */
function verifyTikTokSignature(rawBody: string, authHeader: string | null, appKey: string, appSecret: string): boolean {
  if (!authHeader) return false;
  const expected = crypto.createHmac("sha256", appSecret).update(appKey + rawBody).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(authHeader, "utf8"), Buffer.from(expected, "utf8"));
  } catch {
    // timingSafeEqual throws if the buffers have different lengths — that's
    // just "not a match", not an error worth propagating.
    return false;
  }
}

/** TikTok Shop pushes order-status-changed events here. */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  const appKey = process.env.TIKTOK_SHOP_APP_KEY;
  const appSecret = process.env.TIKTOK_SHOP_APP_SECRET;
  if (!appKey || !appSecret) {
    console.error("[tiktok webhook] TIKTOK_SHOP_APP_KEY/TIKTOK_SHOP_APP_SECRET not configured — rejecting");
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  if (!verifyTikTokSignature(rawBody, req.headers.get("authorization"), appKey, appSecret)) {
    return NextResponse.json({ ok: false, reason: "invalid signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid body" }, { status: 400 });
  }

  const normalized = adapters[Platform.TIKTOK].normalizeWebhookPayload(payload);
  if (!normalized) return NextResponse.json({ ok: false, reason: "unrecognized payload" }, { status: 400 });

  await upsertOrder(normalized);
  return NextResponse.json({ ok: true });
}
