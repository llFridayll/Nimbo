// Shared by the bar, the composer and the announcements page — client-safe,
// so no Prisma import (the enum values are repeated as plain strings).
export type AnnouncementLevelKey = "INFO" | "WARNING" | "URGENT";

export const ANNOUNCEMENT_LEVELS: { value: AnnouncementLevelKey; label: string }[] = [
  { value: "INFO", label: "แจ้งให้ทราบ" },
  { value: "WARNING", label: "งานค้าง" },
  { value: "URGENT", label: "ด่วน" },
];

export const ANNOUNCEMENT_LEVEL_LABEL: Record<AnnouncementLevelKey, string> = {
  INFO: "แจ้งให้ทราบ",
  WARNING: "งานค้าง",
  URGENT: "ด่วน",
};

export const ANNOUNCEMENT_LEVEL_STYLE: Record<AnnouncementLevelKey, { strip: string; badge: string }> = {
  INFO: {
    strip: "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-100",
    badge: "bg-sky-600 text-white",
  },
  WARNING: {
    strip: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100",
    badge: "bg-amber-500 text-white",
  },
  URGENT: {
    strip: "border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100",
    badge: "bg-red-600 text-white",
  },
};

/** Fired after this tab posts or closes a notice, so the bar refetches at
 * once instead of waiting for its next poll. */
export const ANNOUNCEMENTS_CHANGED_EVENT = "announcements:changed";
