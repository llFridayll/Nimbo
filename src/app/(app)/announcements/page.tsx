import { getCurrentUser } from "@/lib/dal";
import { getOpenAnnouncements, getRecentlyClosedAnnouncements } from "@/lib/announcements";
import { formatShortThaiDateTime } from "@/lib/dateUtils";
import { ANNOUNCEMENT_LEVEL_LABEL, ANNOUNCEMENT_LEVEL_STYLE } from "@/lib/announcementLevels";
import { AnnouncementComposer } from "@/components/AnnouncementComposer";

export const dynamic = "force-dynamic";

export default async function AnnouncementsPage() {
  await getCurrentUser();
  const [open, closed] = await Promise.all([getOpenAnnouncements(), getRecentlyClosedAnnouncements(50)]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">ประกาศแจ้งเตือน</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          แจ้งงานค้างหรือเรื่องที่ทุกคนควรรู้ ประกาศจะแสดงด้านบนทุกหน้าจนกว่าจะมีคนกด &ldquo;เสร็จแล้ว&rdquo;
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <p className="mb-3 text-sm font-medium text-gray-800 dark:text-gray-100">ประกาศใหม่</p>
        <AnnouncementComposer inline />
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">ยังเปิดอยู่ ({open.length})</h2>
        {open.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">ไม่มีประกาศค้าง</p>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400">แสดงอยู่ด้านบนของหน้านี้และทุกหน้า</p>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">ปิดแล้วล่าสุด</h2>
        {closed.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">ยังไม่มี</p>
        ) : (
          <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white dark:divide-gray-700 dark:border-gray-700 dark:bg-gray-800">
            {closed.map((a) => (
              <li key={a.id} className="flex items-start gap-3 px-4 py-3 text-sm">
                <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold opacity-60 ${ANNOUNCEMENT_LEVEL_STYLE[a.level].badge}`}>
                  {ANNOUNCEMENT_LEVEL_LABEL[a.level]}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="whitespace-pre-wrap break-words text-gray-700 dark:text-gray-300">{a.message}</p>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    {a.authorName} · {formatShortThaiDateTime(new Date(a.createdAt))} — ปิดโดย {a.closedByName ?? "ผู้ใช้ที่ถูกลบ"}{" "}
                    {formatShortThaiDateTime(a.closedAt ? new Date(a.closedAt) : null)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
