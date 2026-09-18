import { NextResponse } from "next/server";
import { buildAuthorizeUrl, issueOAuthState } from "@/lib/platforms/tiktokAuth";

/** Entry point for "เชื่อมต่อร้าน TikTok Shop" — sends the merchant to TikTok
 * to click Authorize. TikTok then redirects back to TIKTOK_SHOP_REDIRECT_URI
 * (/api/tiktok/callback) with a `code` we exchange for real tokens, plus the
 * `state` issued here, checked there to guard against OAuth CSRF. */
export async function GET() {
  const state = await issueOAuthState();
  const url = buildAuthorizeUrl(state);
  return NextResponse.redirect(url);
}
