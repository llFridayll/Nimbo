"use server";

import { revalidatePath } from "next/cache";
import { AnnouncementLevel } from "@prisma/client";
import { getCurrentUser } from "./dal";
import { prisma } from "./db";
import { logActivity } from "./activityLog";

export interface AnnouncementFormState {
  error?: string;
  ok?: boolean;
}

// A strip under the top bar, not a document — anything longer belongs in chat.
// Keep in step with maxLength in AnnouncementComposer.
const MAX_ANNOUNCEMENT_LENGTH = 300;

const LEVELS = new Set<string>(Object.values(AnnouncementLevel));

export async function createAnnouncement(
  _state: AnnouncementFormState,
  formData: FormData,
): Promise<AnnouncementFormState> {
  const user = await getCurrentUser();

  const raw = formData.get("message");
  const message = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
  if (!message) return { error: "พิมพ์ข้อความก่อนครับ" };
  if (message.length > MAX_ANNOUNCEMENT_LENGTH) {
    return { error: `ข้อความยาวได้ไม่เกิน ${MAX_ANNOUNCEMENT_LENGTH} ตัวอักษร` };
  }

  const levelRaw = formData.get("level");
  const level = typeof levelRaw === "string" && LEVELS.has(levelRaw) ? (levelRaw as AnnouncementLevel) : AnnouncementLevel.INFO;

  await prisma.announcement.create({ data: { message, level, createdById: user.id } });
  await logActivity({ userId: user.id, username: user.username, action: "ANNOUNCEMENT_CREATE", detail: message.slice(0, 120) });

  revalidatePath("/announcements");
  return { ok: true };
}

/** Anyone can close a notice — it's shared pending work, and whoever handles
 * it is the one who should clear it. Closing twice is a no-op so two people
 * clicking at once don't overwrite who got there first. */
export async function closeAnnouncement(id: string): Promise<void> {
  const user = await getCurrentUser();
  const { count } = await prisma.announcement.updateMany({
    where: { id, closedAt: null },
    data: { closedAt: new Date(), closedById: user.id },
  });
  if (count > 0) {
    const row = await prisma.announcement.findUnique({ where: { id }, select: { message: true } });
    await logActivity({
      userId: user.id,
      username: user.username,
      action: "ANNOUNCEMENT_CLOSE",
      detail: row?.message.slice(0, 120),
    });
  }
  revalidatePath("/announcements");
}
