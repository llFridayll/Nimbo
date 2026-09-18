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
}

/** Stronger, DB-backed check — confirms the account still exists and hasn't
 * been deactivated since the cookie was issued (e.g. an admin removed the
 * employee). Use this wherever the result actually gates a page or action;
 * verifySession() alone is only the optimistic cookie check. */
export const getCurrentUser = cache(async (): Promise<CurrentUser> => {
  const session = await verifySession();
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, username: true, displayName: true, role: true, isActive: true },
  });
  if (!user || !user.isActive) redirect("/login");
  return { id: user.id, username: user.username, displayName: user.displayName, role: user.role };
});

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (user.role !== UserRole.ADMIN) redirect("/");
  return user;
}
