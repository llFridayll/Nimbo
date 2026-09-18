/** Next.js server-startup hook — runs once when the server process boots,
 * before any request is handled. Used here to start the background sync
 * schedule (see src/lib/scheduler.ts) instead of relying on someone visiting
 * a page to kick it off. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startScheduler } = await import("./lib/scheduler");
    startScheduler();
  }
}
