"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/dal";
import { logActivity } from "@/lib/activityLog";
import { getSetting, setSetting } from "@/lib/settings";
import { LINE_TARGET_SETTING_KEY } from "@/lib/line";

/** Whether a LINE chat is currently registered as the shipping-summary push
 * target — shown on the order-import admin page next to the reset button. */
export async function getLineTargetStatus(): Promise<{ isSet: boolean }> {
  const target = await getSetting(LINE_TARGET_SETTING_KEY);
  return { isSet: Boolean(target) };
}

/** Clears the registered LINE target so the NEXT message from a (new) chat
 * re-claims it — see the webhook route's lock: once a chat has claimed the
 * slot, a stranger's message can no longer silently steal it, so moving to
 * a different LINE group is an explicit admin action instead. */
export async function resetLineTarget() {
  const admin = await requireAdmin();
  await setSetting(LINE_TARGET_SETTING_KEY, "");
  await logActivity({ userId: admin.id, username: admin.username, action: "LINE_TARGET_RESET" });
  revalidatePath("/admin/order-import");
}
