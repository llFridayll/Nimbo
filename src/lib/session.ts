import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { UserRole } from "@prisma/client";

export const SESSION_COOKIE_NAME = "session";
const COOKIE_NAME = SESSION_COOKIE_NAME;

// Idle timeout, not a hard session length: proxy.ts re-signs and re-sets this
// cookie with a fresh expiry on every request it sees (see its
// refreshed-cookie logic), so someone actively using the app never gets
// logged out mid-session — only a full idle period with *no* requests at all
// lets the cookie actually expire and the next visit land back on /login.
const STAFF_SESSION_DURATION_MS = 60 * 60 * 1000; // 1 hour
// The main admin account shouldn't have to log back in during normal
// day-to-day use — a long-lived, sliding session (still refreshed on every
// request exactly like the staff one above) rather than a literal
// never-expiring token, so it still naturally expires if truly unused for
// well over a year rather than living forever if the cookie is ever leaked.
const ADMIN_SESSION_DURATION_MS = 400 * 24 * 60 * 60 * 1000; // 400 days

export function sessionDurationMs(role: UserRole): number {
  return role === UserRole.ADMIN ? ADMIN_SESSION_DURATION_MS : STAFF_SESSION_DURATION_MS;
}

const secretKey = process.env.SESSION_SECRET;
if (!secretKey) throw new Error("SESSION_SECRET env var is not set");
const encodedKey = new TextEncoder().encode(secretKey);

export interface SessionPayload {
  userId: string;
  role: UserRole;
  [key: string]: unknown;
}

async function encrypt(payload: SessionPayload): Promise<string> {
  const expiresAt = new Date(Date.now() + sessionDurationMs(payload.role));
  return new SignJWT(payload).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(expiresAt).sign(encodedKey);
}

/** Re-signs a fresh token for the same user/role with a new expiry (length
 * depends on role — see sessionDurationMs) — used by proxy.ts to slide the
 * idle-timeout window forward on each request. */
export async function reissueSessionToken(payload: SessionPayload): Promise<string> {
  return encrypt(payload);
}

async function decrypt(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify<SessionPayload>(token, encodedKey, { algorithms: ["HS256"] });
    return payload;
  } catch {
    return null;
  }
}

export async function createSession(userId: string, role: UserRole) {
  const expiresAt = new Date(Date.now() + sessionDurationMs(role));
  const token = await encrypt({ userId, role });
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    sameSite: "lax",
    path: "/",
  });
}

export async function deleteSession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

/** Reads and verifies the session cookie — the optimistic check used by
 * proxy.ts (cookie-only, no DB round trip on every request) and as the first
 * step of the DAL's stronger checks in src/lib/dal.ts. */
export async function getSessionPayload(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  return decrypt(cookieStore.get(COOKIE_NAME)?.value);
}

/** Same check but reading straight from a request's cookie header — for use
 * inside proxy.ts, which gets a NextRequest rather than next/headers. */
export async function getSessionPayloadFromCookieValue(token: string | undefined): Promise<SessionPayload | null> {
  return decrypt(token);
}
