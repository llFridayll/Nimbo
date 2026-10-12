"use client";

import { useActionState, useRef, useState } from "react";
import { createAnnouncement, type AnnouncementFormState } from "@/lib/announcementActions";
import { ANNOUNCEMENT_LEVELS, ANNOUNCEMENTS_CHANGED_EVENT } from "@/lib/announcementLevels";
import { MegaphoneIcon } from "@/components/icons";

const initialState: AnnouncementFormState = {};

function ComposerForm({ onPosted }: { onPosted?: () => void }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, isPending] = useActionState(
    async (prev: AnnouncementFormState, formData: FormData) => {
      const result = await createAnnouncement(prev, formData);
      if (result.ok) {
        formRef.current?.reset();
        window.dispatchEvent(new Event(ANNOUNCEMENTS_CHANGED_EVENT));
        onPosted?.();
      }
      return result;
    },
    initialState,
  );

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      <textarea
        name="message"
        required
        maxLength={300}
        rows={3}
        placeholder="เช่น ออเดอร์ Lazada ค้างแพ็ก 5 รายการ ใครว่างช่วยหน่อย"
        className="w-full resize-none rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-3 text-sm text-gray-700 dark:text-gray-300">
          {ANNOUNCEMENT_LEVELS.map((level, i) => (
            <label key={level.value} className="flex items-center gap-1.5">
              <input type="radio" name="level" value={level.value} defaultChecked={i === 0} />
              {level.label}
            </label>
          ))}
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? "กำลังส่ง..." : "ประกาศ"}
        </button>
      </div>
      {state.error && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}
    </form>
  );
}

/** "inline" is the always-open form on /announcements; the default is the
 * top-bar button that opens it in a small panel. */
export function AnnouncementComposer({ inline = false }: { inline?: boolean }) {
  const [open, setOpen] = useState(false);

  if (inline) return <ComposerForm />;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-800 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100"
      >
        <MegaphoneIcon className="h-4 w-4" />
        แจ้งเตือนทีม
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-40 w-[22rem] rounded-xl border border-gray-200 bg-white p-4 shadow-xl dark:border-gray-700 dark:bg-gray-800">
          <p className="mb-2 text-sm font-medium text-gray-800 dark:text-gray-100">ประกาศให้ทุกคนเห็น</p>
          <ComposerForm onPosted={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}
