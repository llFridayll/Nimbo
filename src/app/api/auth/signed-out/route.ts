import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/session";

/** Clears a session cookie that still verifies but no longer points at a
 * usable account, then sends the browser to /login.
 *
 * Without this, such a cookie traps the user in a redirect loop: proxy.ts
 * does the optimistic cookie-only check, sees a valid signature and treats
 * the request as authenticated, so it bounces /login back to "/" — while
 * getCurrentUser() in dal.ts does the DB-backed check, finds no active user
 * and redirects back to /login. Neither side can break the tie because the
 * cookie outlives the account: a Server Component cannot delete cookies (see
 * the cookies() API reference), and proxy.ts deliberately makes no DB round
 * trip on every request, so it can't know the account is gone.
 *
 * This route sits under /api, which proxy.ts's matcher excludes, so it is the
 * one place that both escapes the bounce and is allowed to clear the cookie.
 *
 * Reached by redirect (a browser navigation), hence GET. */
export async function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/login", request.url));
  // Pass the path explicitly rather than relying on the default: a delete
  // whose attributes don't match the ones createSession() set leaves the
  // original cookie in place, which here would mean silently landing back in
  // the very loop this route exists to break.
  response.cookies.delete({ name: SESSION_COOKIE_NAME, path: "/" });
  return response;
}
