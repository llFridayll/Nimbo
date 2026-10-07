"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "./dal";
import { prisma } from "./db";
import { logActivity } from "./activityLog";

export interface ProfileFormState {
  error?: string;
  ok?: boolean;
}

/** Deliberately no SVG: an SVG is a document that can carry <script>, and
 * this app serves the bytes straight back with the stored Content-Type, so
 * accepting one would mean hosting attacker-authored script on our own
 * origin — next to the session cookie. Raster formats can't do that. */
const ALLOWED = new Map<string, (b: Buffer) => boolean>([
  ["image/png", (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))],
  ["image/jpeg", (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
  ["image/webp", (b) => b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP"],
]);

// Generous for a headshot but small enough that the row stays cheap to read.
// The browser downscales to 256px before uploading (see ProfileAvatarForm), so
// hitting this at all means the client-side resize didn't run.
const MAX_BYTES = 2 * 1024 * 1024;

export async function updateAvatar(_state: ProfileFormState, formData: FormData): Promise<ProfileFormState> {
  const currentUser = await getCurrentUser();

  const file = formData.get("avatar");
  if (!(file instanceof File) || file.size === 0) return { error: "เลือกไฟล์รูปก่อนครับ" };
  if (file.size > MAX_BYTES) return { error: "ไฟล์ใหญ่เกิน 2 MB" };

  const sniff = ALLOWED.get(file.type);
  if (!sniff) return { error: "รองรับเฉพาะไฟล์ PNG, JPEG และ WebP" };

  const buffer = Buffer.from(await file.arrayBuffer());
  // Check the bytes, not just the declared type: file.type comes from the
  // browser and a mislabelled file would otherwise be served back under a
  // Content-Type it isn't.
  if (!sniff(buffer)) return { error: "ไฟล์นี้ไม่ใช่รูปภาพตามนามสกุลที่ระบุ" };

  await prisma.user.update({
    where: { id: currentUser.id },
    data: { avatarData: buffer, avatarMimeType: file.type, avatarUpdatedAt: new Date() },
  });
  await logActivity({ userId: currentUser.id, username: currentUser.username, action: "AVATAR_UPDATE" });

  // "layout" — the avatar lives in the sidebar, which every page renders.
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function removeAvatar(): Promise<void> {
  const currentUser = await getCurrentUser();
  await prisma.user.update({
    where: { id: currentUser.id },
    data: { avatarData: null, avatarMimeType: null, avatarUpdatedAt: null },
  });
  await logActivity({ userId: currentUser.id, username: currentUser.username, action: "AVATAR_REMOVE" });
  revalidatePath("/", "layout");
}

// Long enough for a full Thai name with a nickname, short enough to fit the
// sidebar footer and a chat bubble's sender line without wrapping into a mess.
const MAX_NAME_LENGTH = 50;

/** Lets each person change their own display name. The login username is
 * deliberately not editable here — it's what an admin knows the account by,
 * and changing it belongs on the employees page. */
export async function updateDisplayName(_state: ProfileFormState, formData: FormData): Promise<ProfileFormState> {
  const currentUser = await getCurrentUser();

  // Collapse runs of whitespace so "สมชาย   ใจดี" and "สมชาย ใจดี" can't end
  // up as two lookalike names in the chat partner list.
  const raw = formData.get("displayName");
  const name = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
  if (!name) return { error: "กรอกชื่อก่อนครับ" };
  if (name.length > MAX_NAME_LENGTH) return { error: `ชื่อยาวได้ไม่เกิน ${MAX_NAME_LENGTH} ตัวอักษร` };
  if (name === currentUser.displayName) return { ok: true };

  await prisma.user.update({ where: { id: currentUser.id }, data: { displayName: name } });
  await logActivity({
    userId: currentUser.id,
    username: currentUser.username,
    action: "DISPLAY_NAME_UPDATE",
    detail: `${currentUser.displayName} → ${name}`,
  });

  // "layout" — the name is shown in the sidebar on every page.
  revalidatePath("/", "layout");
  return { ok: true };
}
