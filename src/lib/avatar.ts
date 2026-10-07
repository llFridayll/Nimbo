/** URL for a user's profile picture, or null when they have none.
 *
 * The ?v= is the point: without it the browser keeps showing the picture it
 * cached under the same URL after someone uploads a new one. avatarUpdatedAt
 * changes on every upload, so the URL does too — which is also why the route
 * can send an immutable Cache-Control. */
export function avatarSrc(userId: string, avatarUpdatedAt: Date | string | null | undefined): string | null {
  if (!avatarUpdatedAt) return null;
  const v = new Date(avatarUpdatedAt).getTime();
  return `/api/users/${userId}/avatar?v=${v}`;
}
