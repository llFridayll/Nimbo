const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Midnight `daysBack` days ago in Asia/Bangkok, expressed as the equivalent
 * UTC instant. `startOfDaysAgoBangkok(0)` is "start of today". */
export function startOfDaysAgoBangkok(daysBack: number): Date {
  const bangkokNow = new Date(Date.now() + BANGKOK_OFFSET_MS);
  const bangkokMidnightUtc = Date.UTC(bangkokNow.getUTCFullYear(), bangkokNow.getUTCMonth(), bangkokNow.getUTCDate());
  return new Date(bangkokMidnightUtc - BANGKOK_OFFSET_MS - daysBack * 24 * 60 * 60 * 1000);
}

// --- Shipping cutoff logic ---------------------------------------------
// The warehouse dispatches Monday–Saturday only, with a daily 13:00
// (Bangkok time) order cutoff. Since there is no Sunday dispatch, orders
// placed after Saturday's 13:00 cutoff through Monday's 13:00 cutoff all
// roll into Monday's shipment.

const SHIPPING_CUTOFF_HOUR = 13;

interface BangkokDateParts {
  year: number;
  month: number; // 0-based
  day: number;
  dow: number; // 0 = Sunday .. 6 = Saturday
}

function bangkokDateParts(date: Date): BangkokDateParts {
  const bangkok = new Date(date.getTime() + BANGKOK_OFFSET_MS);
  return {
    year: bangkok.getUTCFullYear(),
    month: bangkok.getUTCMonth(),
    day: bangkok.getUTCDate(),
    dow: bangkok.getUTCDay(),
  };
}

function addBangkokDays(parts: BangkokDateParts, n: number): BangkokDateParts {
  return bangkokDateParts(new Date(Date.UTC(parts.year, parts.month, parts.day + n) - BANGKOK_OFFSET_MS));
}

/** The UTC instant of the 13:00 Bangkok-time cutoff on the given Bangkok
 * calendar date. */
function cutoffInstant(parts: BangkokDateParts): Date {
  return new Date(Date.UTC(parts.year, parts.month, parts.day, SHIPPING_CUTOFF_HOUR) - BANGKOK_OFFSET_MS);
}

export interface ShippingCutoffWindow {
  /** Bangkok calendar date (as a UTC-midnight-equivalent instant) this window ships on. */
  shipDate: Date;
  /** Bangkok day-of-week of the ship date, 0 = Sunday .. 6 = Saturday. Always 1-6 (Mon-Sat). */
  dow: number;
  /** Window start (inclusive): the previous cutoff instant. */
  from: Date;
  /** Window end (exclusive): this ship date's 13:00 cutoff instant. */
  to: Date;
}

/** Computes the order-acceptance window for a given ship date, under a
 * Mon–Sat dispatch schedule with a daily 13:00 Bangkok cutoff. `anyDate` may
 * be any instant that falls on the intended Bangkok calendar day — if that
 * day is a Sunday, it's rolled forward to the following Monday since orders
 * placed "on Sunday" ship Monday anyway. */
export function shippingCutoffWindowForDate(anyDate: Date): ShippingCutoffWindow {
  let parts = bangkokDateParts(anyDate);
  if (parts.dow === 0) parts = addBangkokDays(parts, 1);
  const to = cutoffInstant(parts);
  const daysBack = parts.dow === 1 ? 2 : 1; // Monday pulls in Saturday afternoon + all of Sunday
  const from = cutoffInstant(addBangkokDays(parts, -daysBack));
  const shipDate = new Date(Date.UTC(parts.year, parts.month, parts.day) - BANGKOK_OFFSET_MS);
  return { shipDate, dow: parts.dow, from, to };
}

/** The next upcoming ship date's cutoff window as of `now` — today's window
 * if today is Mon-Sat and before its 13:00 cutoff, otherwise the next
 * dispatch day's window (skipping Sunday). */
export function currentShippingCutoffWindow(now: Date = new Date()): ShippingCutoffWindow {
  const parts = bangkokDateParts(now);
  const bangkok = new Date(now.getTime() + BANGKOK_OFFSET_MS);
  const hour = bangkok.getUTCHours() + bangkok.getUTCMinutes() / 60;
  const pastCutoff = hour >= SHIPPING_CUTOFF_HOUR;

  let target = parts;
  if (parts.dow === 0) {
    target = addBangkokDays(parts, 1); // Sunday -> Monday
  } else if (pastCutoff) {
    target = addBangkokDays(parts, parts.dow === 6 ? 2 : 1); // Saturday -> Monday, else next day
  }
  return shippingCutoffWindowForDate(cutoffInstant(target));
}

/** True if `date` falls on a Bangkok-calendar Monday between 08:30 and 16:30
 * (inclusive) — the window for the Monday twist-tie-tool promo. */
export function isMondayPromoWindow(date: Date): boolean {
  const parts = bangkokDateParts(date);
  if (parts.dow !== 1) return false;
  const bangkok = new Date(date.getTime() + BANGKOK_OFFSET_MS);
  const minutesOfDay = bangkok.getUTCHours() * 60 + bangkok.getUTCMinutes();
  return minutesOfDay >= 8 * 60 + 30 && minutesOfDay <= 16 * 60 + 30;
}

/** Formats the Bangkok calendar date of `date` as "YYYY-MM-DD" (for date
 * inputs and query params) — not a locale-formatted display string. */
export function formatBangkokDateYMD(date: Date): string {
  const parts = bangkokDateParts(date);
  const mm = String(parts.month + 1).padStart(2, "0");
  const dd = String(parts.day).padStart(2, "0");
  return `${parts.year}-${mm}-${dd}`;
}

/** "N นาทีที่แล้ว" / "N ชั่วโมงที่แล้ว" style relative caption for "last
 * updated/synced" timestamps in the dashboard top bar and channel cards. */
export function formatRelativeThai(date: Date | null): string {
  if (!date) return "ยังไม่เคย";
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "เมื่อสักครู่";
  if (diffMin < 60) return `${diffMin} นาทีที่แล้ว`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} ชั่วโมงที่แล้ว`;
  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay} วันที่แล้ว`;
}

/** "10 ก.ย. 2569 14:31" — absolute Bangkok-time caption for the sync
 * button's "อัปเดตล่าสุด" line, where an exact timestamp reads better than
 * formatRelativeThai's relative one. */
export function formatShortThaiDateTime(date: Date | null): string {
  if (!date) return "ยังไม่เคย";
  const datePart = date.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bangkok" });
  const timePart = date.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });
  return `${datePart} ${timePart}`;
}
