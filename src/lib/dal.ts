import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { prisma } from "./db";
import { getSessionPayload } from "./session";

/** Cookie-only check, memoized per request — redirects to /login if there's
 * no valid session. Cheap enough to call from every protected layout/page. */
export const verifySession = cache(async () => {
  const session = await getSessionPayload();
  if (!session?.userId) redirect("/login");
  return { userId: session.userId, role: session.role };
});

export interface CurrentUser {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  /** When the profile picture last changed, or null if there isn't one. The
   * image bytes themselves are never selected here — this runs on every
   * protected page, and dragging a photo through it each time would be
   * pointless traffic. Pass this to avatarSrc() to build the URL that
   * /api/users/[id]/avatar serves the bytes from. */
  avatarUpdatedAt: Date | null;
}

/** Stronger, DB-backed check — confirms the account still exists and hasn't
 * been deactivated since the cookie was issued (e.g. an admin removed the
 * employee). Use this wherever the result actually gates a page or action;
 * verifySession() alone is only the optimistic cookie check. */
export const getCurrentUser = cache(async (): Promise<CurrentUser> => {
  const session = await verifySession();
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, username: true, displayName: true, role: true, isActive: true, avatarUpdatedAt: true },
  });
  // Not /login: the cookie is still valid-looking, so proxy.ts would treat
  // this as logged in and bounce /login straight back here — an endless loop
  // the user cannot escape without clearing site data by hand. A Server
  // Component can't delete the cookie itself, so hand off to the route
  // handler that can. See src/app/api/auth/signed-out/route.ts.
  if (!user || !user.isActive) redirect("/api/auth/signed-out");
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    avatarUpdatedAt: user.avatarUpdatedAt,
  };
});

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (user.role !== UserRole.ADMIN) redirect("/");
  return user;
}
