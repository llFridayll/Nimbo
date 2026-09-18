import "server-only";
import { prisma } from "./db";

/** Short, stable action codes — keep these in sync with activityActionLabel
 * in src/lib/labels.ts, which turns them into the Thai text shown in the
 * admin activity-log page. */
export type ActivityAction =
  | "LOGIN"
  | "LOGOUT"
  | "EMPLOYEE_CREATE"
  | "EMPLOYEE_ACTIVATE"
  | "EMPLOYEE_DEACTIVATE"
  | "EMPLOYEE_DELETE"
  | "EMPLOYEE_PASSWORD_RESET"
  | "PASSWORD_CHANGE_SELF"
  | "PROBLEM_RESOLVE"
  | "PROBLEM_REOPEN"
  | "ORDER_STATUS_MANUAL_CHANGE"
  | "MANUAL_SYNC"
  | "LINE_SUMMARY_SENT"
  | "ORDER_FILE_MANUAL_IMPORT"
  | "LINE_TARGET_RESET";

export async function logActivity(params: { userId: string; username: string; action: ActivityAction; detail?: string }) {
  // Best-effort — a logging failure should never break the actual user
  // action it's describing.
  try {
    await prisma.activityLog.create({ data: params });
  } catch (err) {
    console.error("[activityLog] failed to record:", err);
  }
}

export async function getRecentActivity(limit = 100) {
  return prisma.activityLog.findMany({ orderBy: { createdAt: "desc" }, take: limit });
}
