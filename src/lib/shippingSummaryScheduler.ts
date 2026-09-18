import "server-only";
import { currentShippingCutoffWindow, formatBangkokDateYMD } from "@/lib/dateUtils";
import { getShippingSummary, type ShippingSummarySkuLine } from "@/lib/shippingSummary";
import { filterRedundantTieWireFreebies } from "@/lib/shippingSummaryDisplay";
import {
  pushLineMessageSpecs,
  buildCarrierBaselineMessage,
  buildCarrierDeltaMessage,
  shippingSummaryDateLabel,
  applyDashFrame,
  type LineMessageSpec,
} from "@/lib/line";
import { getSetting, setSetting } from "@/lib/settings";

/** Identifies one order-item line for delta-tracking purposes — an order's
 * own items never change once placed, so "already reported" can be tracked
 * per (order, sku) pair rather than by summed quantity. This is what makes
 * it safe to report each order as its own block (see buildOrderGroupsText in
 * line.ts) instead of one combined "SKU x N" across every order: a later
 * checkpoint only has to find lines whose key isn't in the reported set yet,
 * regardless of how orders get merged for display by tracking number. */
function lineKey(line: ShippingSummarySkuLine): string {
  return `${line.orderId}:${line.sku}`;
}

interface CarrierState {
  /** Stable "กองที่ N" label for this carrier, assigned the first time it's
   * seen that day — never renumbered even if order counts shift later. */
  kongNumber: number;
  /** Quote token of this carrier's first ("กองที่ N") message for the day —
   * every later "เพิ่ม" delta for this carrier replies to it. Absent if LINE
   * didn't return one (message send failed, or an older/incompatible API). */
  quoteToken?: string;
  /** Order+SKU keys (see lineKey) already included in an earlier message for
   * this carrier — only lines whose key isn't here yet get reported next. */
  reportedLineKeys: string[];
}

interface DaySummaryState {
  nextKongNumber: number;
  carriers: Record<string, CarrierState>;
}

function stateSettingKey(shipDateStr: string): string {
  return `line_summary_state:${shipDateStr}`;
}

// The 4 daily checkpoints, in Bangkok minutes-since-midnight — all before
// the 13:00 dispatch cutoff.
const CHECKPOINTS = [
  { label: "08:30", minuteOfDay: 8 * 60 + 30 },
  { label: "10:00", minuteOfDay: 10 * 60 },
  { label: "11:30", minuteOfDay: 11 * 60 + 30 },
  { label: "12:45", minuteOfDay: 12 * 60 + 45 },
];

function completedCheckpointsSettingKey(todayStr: string): string {
  return `line_summary_checkpoints_done:${todayStr}`;
}

async function loadCompletedCheckpoints(todayStr: string): Promise<Set<string>> {
  const raw = await getSetting(completedCheckpointsSettingKey(todayStr));
  if (!raw) return new Set();
  try {
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

async function saveCompletedCheckpoints(todayStr: string, done: Set<string>): Promise<void> {
  await setSetting(completedCheckpointsSettingKey(todayStr), JSON.stringify(Array.from(done)));
}

async function loadDayState(shipDateStr: string): Promise<DaySummaryState> {
  const raw = await getSetting(stateSettingKey(shipDateStr));
  if (!raw) return { nextKongNumber: 1, carriers: {} };
  try {
    return JSON.parse(raw) as DaySummaryState;
  } catch {
    return { nextKongNumber: 1, carriers: {} };
  }
}

async function saveDayState(shipDateStr: string, state: DaySummaryState): Promise<void> {
  await setSetting(stateSettingKey(shipDateStr), JSON.stringify(state));
}

/** Checks whether any of today's 4 checkpoints (08:30/10:00/11:30/12:45
 * Bangkok) are now due and haven't run yet, and fires them if so — called
 * every 5 minutes plus once on server boot (see scheduler.ts). An exact-time
 * cron trigger would simply never fire if the process wasn't alive at that
 * precise minute (the machine asleep, or the dev server down); this instead
 * treats each checkpoint as "run once some time at or after its minute",
 * which self-heals after any such gap instead of silently skipping the
 * checkpoint for the whole day. If several checkpoints are overdue at once
 * (e.g. the machine was asleep all morning) they all fire here in order. */
export async function runShippingSummaryCatchUp() {
  const now = new Date();
  const bangkok = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  if (bangkok.getUTCDay() === 0) return; // no warehouse work Sunday

  const minuteOfDay = bangkok.getUTCHours() * 60 + bangkok.getUTCMinutes();
  const todayStr = formatBangkokDateYMD(now);
  const done = await loadCompletedCheckpoints(todayStr);

  for (const checkpoint of CHECKPOINTS) {
    if (minuteOfDay >= checkpoint.minuteOfDay && !done.has(checkpoint.label)) {
      await runShippingSummaryCheckpoint(checkpoint.label);
      done.add(checkpoint.label);
      await saveCompletedCheckpoints(todayStr, done);
    }
  }
}

/** The first time a carrier is seen that day it gets a full "กองที่ N
 * {carrier}" post; every later call only reports whichever SKU quantities
 * grew since the last check, as a quote-reply ("เพิ่ม") onto that carrier's
 * original post — never a full restate, and nothing at all if nothing
 * changed. Called by runShippingSummaryCatchUp above, not directly by cron. */
export async function runShippingSummaryCheckpoint(label: string) {
  try {
    const window = currentShippingCutoffWindow();
    const summary = await getShippingSummary(window);

    if (summary.totalOrders === 0) {
      console.log(`[shipping-summary-scheduler] ${label}: no orders yet, skipping`);
      return;
    }

    const shipDateStr = formatBangkokDateYMD(window.shipDate);
    const dateLabel = shippingSummaryDateLabel(window.shipDate);
    const state = await loadDayState(shipDateStr);

    const pending: { carrier: string; spec: LineMessageSpec; isNewCarrier: boolean }[] = [];

    for (const group of summary.carriers) {
      const existing = state.carriers[group.carrier];
      // Redundant platform-provided tie-wire freebies are dropped first so
      // they never get their own "เพิ่ม" delta line (see
      // shippingSummaryDisplay.ts) or count toward the reported-keys baseline.
      const filteredLines = filterRedundantTieWireFreebies(group.lines);
      const currentKeys = filteredLines.map(lineKey);

      if (!existing) {
        const kongNumber = state.nextKongNumber++;
        const text = buildCarrierBaselineMessage(kongNumber, group.carrier, dateLabel, filteredLines);
        state.carriers[group.carrier] = { kongNumber, reportedLineKeys: currentKeys };
        pending.push({ carrier: group.carrier, spec: { text }, isNewCarrier: true });
        continue;
      }

      const reportedSet = new Set(existing.reportedLineKeys);
      const newLines = filteredLines.filter((line) => !reportedSet.has(lineKey(line)));
      existing.reportedLineKeys = currentKeys; // always advance the baseline so the next check only sees what's new since now

      if (newLines.length > 0) {
        pending.push({ carrier: group.carrier, spec: { text: buildCarrierDeltaMessage(newLines), quoteToken: existing.quoteToken }, isNewCarrier: false });
      }
    }

    if (pending.length === 0) {
      console.log(`[shipping-summary-scheduler] ${label}: no change since last checkpoint, skipping`);
      await saveDayState(shipDateStr, state); // still persist any per-SKU baseline advances above
      return;
    }

    // The dash-frame header/footer become their own separate message bubbles
    // around the whole batch (see applyDashFrame) — not appended into the
    // first/last carrier message — so they're spliced in as plain specs with
    // no quoteToken, shifting every carrier spec's index by 1.
    const [headerText, ...rest] = applyDashFrame(pending.map((p) => p.spec.text));
    const footerText = rest[rest.length - 1];
    const specsToSend: LineMessageSpec[] = [{ text: headerText }, ...pending.map((p) => p.spec), { text: footerText }];

    const result = await pushLineMessageSpecs(specsToSend);
    if (!result.ok) {
      console.error(`[shipping-summary-scheduler] ${label}: push failed:`, result.error);
      return;
    }

    result.sentMessages.forEach((sent, i) => {
      const p = pending[i - 1]; // offset by 1: index 0 is the header message
      if (p?.isNewCarrier && sent?.quoteToken) {
        state.carriers[p.carrier].quoteToken = sent.quoteToken;
      }
    });

    await saveDayState(shipDateStr, state);
    console.log(`[shipping-summary-scheduler] ${label}: sent ${pending.length} message(s) for ${shipDateStr}`);
  } catch (err) {
    console.error(`[shipping-summary-scheduler] ${label} failed:`, err);
  }
}
