"use client";

import { useActionState } from "react";
import { updateDisplayName, type ProfileFormState } from "@/lib/profileActions";

const initialState: ProfileFormState = {};

export function ProfileNameForm({ displayName, username }: { displayName: string; username: string }) {
  const [state, formAction, isPending] = useActionState(updateDisplayName, initialState);

  return (
    <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
      <div className="text-sm text-gray-500 dark:text-gray-400">
        <p className="font-medium text-gray-800 dark:text-gray-200">ชื่อที่แสดง</p>
        <p className="mt-0.5">
          ชื่อที่คนอื่นเห็นในเมนูและในแชท — ชื่อผู้ใช้สำหรับล็อกอิน (<span className="font-mono">{username}</span>) ไม่เปลี่ยน
        </p>
      </div>

      <form action={formAction} className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="text"
          name="displayName"
          defaultValue={displayName}
          required
          maxLength={50}
          autoComplete="name"
          className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
        />
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? "กำลังบันทึก..." : "บันทึกชื่อ"}
        </button>
      </form>

      {state.error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
          {state.error}
        </p>
      )}
      {state.ok && !state.error && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
          บันทึกชื่อแล้ว — ข้อความแชทเก่ายังแสดงชื่อเดิม ข้อความใหม่จะใช้ชื่อนี้
        </p>
      )}
    </div>
  );
}
