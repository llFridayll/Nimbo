"use client";

import { useActionState, useRef, useState } from "react";
import { UserAvatar } from "@/components/UserAvatar";
import { updateAvatar, removeAvatar, type ProfileFormState } from "@/lib/profileActions";

const initialState: ProfileFormState = {};

/** Square the picture is downscaled to in the browser before upload. Big
 * enough to stay sharp on a retina screen at the largest size we render it
 * (80px on this page), small enough that the row it's stored in stays a few
 * tens of KB rather than the several MB a modern phone photo arrives at. */
const AVATAR_PX = 256;

/** Draws the chosen image into a centre-cropped square canvas and hands back
 * a JPEG of it. Returns null if anything goes wrong — the caller then uploads
 * the original and lets the server's size limit have the final say, which is
 * better than blocking someone from setting a picture at all. */
async function downscale(file: File): Promise<File | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const side = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = AVATAR_PX;
    canvas.height = AVATAR_PX;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    // Centre crop: take the largest square from the middle, so a portrait or
    // landscape photo doesn't arrive squashed into the circle.
    ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, AVATAR_PX, AVATAR_PX);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (!blob) return null;
    return new File([blob], "avatar.jpg", { type: "image/jpeg" });
  } catch {
    return null;
  }
}

export function ProfileAvatarForm({
  displayName,
  currentSrc,
}: {
  displayName: string;
  currentSrc: string | null;
}) {
  const [state, formAction, isPending] = useActionState(updateAvatar, initialState);
  const [preview, setPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreview(URL.createObjectURL(file));

    const resized = await downscale(file);
    if (!resized || !inputRef.current) return;
    // Put the downscaled file back into the input so the plain form submit
    // sends it. Assigning .files doesn't re-fire change, so this can't loop.
    const transfer = new DataTransfer();
    transfer.items.add(resized);
    inputRef.current.files = transfer.files;
  }

  return (
    <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center gap-4">
        <UserAvatar name={displayName} src={preview ?? currentSrc} className="h-20 w-20 text-2xl" />
        <div className="min-w-0 text-sm text-gray-500 dark:text-gray-400">
          <p className="font-medium text-gray-800 dark:text-gray-200">รูปโปรไฟล์</p>
          <p className="mt-0.5">ไฟล์ PNG, JPEG หรือ WebP — ระบบจะย่อรูปให้อัตโนมัติ</p>
        </div>
      </div>

      <form action={formAction} className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          ref={inputRef}
          type="file"
          name="avatar"
          accept="image/png,image/jpeg,image/webp"
          required
          onChange={handleChange}
          className="flex-1 text-sm text-gray-700 dark:text-gray-300 file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:opacity-90"
        />
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? "กำลังบันทึก..." : "บันทึกรูป"}
        </button>
      </form>

      {currentSrc && (
        <form action={removeAvatar}>
          <button
            type="submit"
            className="text-xs font-medium text-red-600 hover:underline dark:text-red-400"
          >
            ลบรูปโปรไฟล์ กลับไปใช้ตัวอักษรย่อ
          </button>
        </form>
      )}

      {state.error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
          {state.error}
        </p>
      )}
      {state.ok && !state.error && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
          บันทึกรูปโปรไฟล์แล้ว
        </p>
      )}
    </div>
  );
}
