import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionPayload } from "@/lib/session";

/** Serves a user's profile picture from the bytea column.
 *
 * This route sits outside proxy.ts's auth gate (like the rest of /api), so it
 * checks the session directly rather than getCurrentUser(), which redirects.
 * Any signed-in user may fetch any colleague's picture — the sidebar only
 * shows your own today, but an avatar next to a name is exactly the kind of
 * thing the employee list grows later, and there is nothing private in a
 * staff headshot that the person's name doesn't already reveal. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionPayload();
  if (!session?.userId) return NextResponse.json({ error: "ยังไม่ได้เข้าสู่ระบบ" }, { status: 401 });

  const { id } = await params;
  const user = await prisma.user.findUnique({
    where: { id },
    select: { avatarData: true, avatarMimeType: true },
  });
  if (!user?.avatarData || !user.avatarMimeType) {
    return NextResponse.json({ error: "ไม่มีรูปโปรไฟล์" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(user.avatarData), {
    headers: {
      "Content-Type": user.avatarMimeType,
      "Content-Length": String(user.avatarData.byteLength),
      // Safe to cache hard because the <img> URL carries ?v=avatarUpdatedAt:
      // a new upload changes the URL, so nothing has to expire for the new
      // picture to appear. "private" keeps it out of shared caches — the
      // office sits behind one NAT and these responses need a session.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
