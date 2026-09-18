import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionPayloadFromCookieValue, reissueSessionToken, sessionDurationMs, SESSION_COOKIE_NAME } from "@/lib/session";

// Optimistic, cookie-only auth check (no DB round trip — see the Next.js
// authentication guide's recommendation against DB checks in proxy, since
// this runs on every request including prefetches). src/lib/dal.ts does the
// stronger, DB-backed check for actual page/data access.
const PUBLIC_ROUTES = ["/login"];

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublicRoute = PUBLIC_ROUTES.includes(pathname);

  const session = await getSessionPayloadFromCookieValue(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  const isAuthed = !!session?.userId;

  if (!isPublicRoute && !isAuthed) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (isPublicRoute && isAuthed) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const response = NextResponse.next();
  if (isAuthed && session) {
    // Sliding idle-timeout: every request while logged in pushes the
    // cookie's expiry further out (length depends on role — see
    // sessionDurationMs), so only genuine inactivity for that whole period
    // lets the session actually expire.
    const refreshedToken = await reissueSessionToken({ userId: session.userId, role: session.role });
    response.cookies.set(SESSION_COOKIE_NAME, refreshedToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      expires: new Date(Date.now() + sessionDurationMs(session.role)),
      sameSite: "lax",
      path: "/",
    });
  }
  return response;
}

export const config = {
  // Also excludes static image files in /public (e.g. logo assets) — without
  // this, Next's image optimizer re-fetches them through this same server in
  // dev, and that internal request got redirected to /login too, so pages
  // like /login could never actually render its own logo.
  matcher: ["/((?!api|_next/static|_next/image|.*\\.(?:ico|png|jpg|jpeg|svg|gif|webp)$).*)"],
};
