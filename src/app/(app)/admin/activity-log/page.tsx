import { requireAdmin } from "@/lib/dal";
import { getRecentActivity, type ActivityAction } from "@/lib/activityLog";
import { activityActionLabel } from "@/lib/labels";

export const dynamic = "force-dynamic";

const ACTION_ACCENT: Record<ActivityAction, string> = {
  LOGIN: "bg-emerald-500",
  LOGOUT: "bg-gray-400",
  EMPLOYEE_CREATE: "bg-blue-500",
  EMPLOYEE_ACTIVATE: "bg-emerald-500",
  EMPLOYEE_DEACTIVATE: "bg-amber-500",
  EMPLOYEE_DELETE: "bg-red-500",
  EMPLOYEE_PASSWORD_RESET: "bg-purple-500",
  PASSWORD_CHANGE_SELF: "bg-purple-500",
  PROBLEM_RESOLVE: "bg-emerald-500",
  PROBLEM_REOPEN: "bg-amber-500",
  ORDER_STATUS_MANUAL_CHANGE: "bg-indigo-500",
  MANUAL_SYNC: "bg-indigo-500",
  LINE_SUMMARY_SENT: "bg-green-500",
  ORDER_FILE_MANUAL_IMPORT: "bg-orange-500",
  LINE_TARGET_RESET: "bg-red-500",
};

export default async function ActivityLogPage() {
  await requireAdmin();
  const logs = await getRecentActivity(200);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">ประวัติการใช้งาน</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Log การเข้าใช้งานและการกระทำสำคัญของพนักงานทุกคนในระบบ (ล่าสุด 200 รายการ)</p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        {logs.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-gray-400 dark:text-gray-500">ยังไม่มีประวัติการใช้งาน</p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {logs.map((log) => (
              <li key={log.id} className="flex items-start gap-3 px-4 py-3">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${ACTION_ACCENT[log.action as ActivityAction] ?? "bg-gray-400"}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{log.username}</span>
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {activityActionLabel[log.action as ActivityAction] ?? log.action}
                    </span>
                  </div>
                  {log.detail && <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{log.detail}</p>}
                </div>
                <span className="shrink-0 whitespace-nowrap text-xs text-gray-400 dark:text-gray-500">
                  {new Date(log.createdAt).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
