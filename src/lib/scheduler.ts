import cron from "node-cron";
import { syncAllPlatforms } from "./sync";

// Next.js's dev server can re-evaluate this module on hot reload; stash the
// "already started" flag on globalThis (same trick as the Prisma client
// singleton in db.ts) so a reload never registers a second set of cron jobs.
const globalForScheduler = globalThis as unknown as { __omsSchedulerStarted?: boolean };

const FREQUENT_LOOKBACK_DAYS = 10;
const DAILY_LOOKBACK_DAYS = 14; // 2 weeks

async function runScheduledSync(label: string, lookbackDays: number) {
  try {
    const results = await syncAllPlatforms(lookbackDays);
    console.log(`[scheduler] ${label} sync finished:`, results);
  } catch (err) {
    console.error(`[scheduler] ${label} sync failed:`, err);
  }
}

/** Keeps order data current without anyone having to press "sync now":
 * every 5 minutes, pull the last 10 days from every platform, plus a
 * dedicated run at 01:00 Asia/Bangkok time that reaches back 2 weeks as a
 * guaranteed daily catch-up (e.g. if the 5-minute job was down for a stretch
 * overnight, or a status change landed just outside the frequent job's
 * shorter window). */
export function startScheduler() {
  if (globalForScheduler.__omsSchedulerStarted) return;
  globalForScheduler.__omsSchedulerStarted = true;

  cron.schedule("*/5 * * * *", () => runScheduledSync("5-minute", FREQUENT_LOOKBACK_DAYS));
  cron.schedule("0 1 * * *", () => runScheduledSync("daily 01:00", DAILY_LOOKBACK_DAYS), {
    timezone: "Asia/Bangkok",
  });

  // Automatic shipping-summary checkpoint sends (08:30/10:00/11:30/12:45,
  // see shippingSummaryScheduler.ts) were turned off by request — staff
  // send the LINE summary manually via the "ส่งเข้า LINE" button instead.

  console.log(
    `[scheduler] started — every 5 min (${FREQUENT_LOOKBACK_DAYS}-day lookback) + daily 01:00 Asia/Bangkok (${DAILY_LOOKBACK_DAYS}-day lookback)`
  );
}
