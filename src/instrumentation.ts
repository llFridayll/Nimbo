/** Next.js server-startup hook — runs once when the server process boots,
 * before any request is handled. Used here to start the background sync
 * schedule (see src/lib/scheduler.ts) instead of relying on someone visiting
 * a page to kick it off. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Production only, unless overridden. Every copy of the app shares the one
  // database, so a laptop running `next dev` was syncing the same orders as
  // the server on top of it — and from an IP TikTok's allow list doesn't
  // know, which showed up as 124 of 702 TikTok runs failing with a 403 over
  // two days. SCHEDULER=on / SCHEDULER=off overrides either way, e.g. to test
  // the sync locally on purpose.
  const override = process.env.SCHEDULER?.toLowerCase();
  const enabled = override ? override === "on" : process.env.NODE_ENV === "production";
  if (!enabled) {
    console.log("[scheduler] not started — dev server (set SCHEDULER=on to enable)");
    return;
  }

  const { startScheduler } = await import("./lib/scheduler");
  startScheduler();
}
