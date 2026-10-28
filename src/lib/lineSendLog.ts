import "server-only";
import { getSetting, setSetting } from "@/lib/settings";
import { formatBangkokDateYMD } from "@/lib/dateUtils";

/** What has already gone to LINE for one ship date, so a later send can
 * carry only the items added since. Kept in AppSetting under one key per
 * ship date — a day's list is a few hundred keys at most.
 *
 * `keys` are shippingLineItemKey values (order + platform SKU, plus the
 * package for a split order). `carriers` is the pile order fixed by the
 * day's first send: "กองที่ 1" stays the same courier all day, even after
 * another courier overtakes it in order count. */
export interface LineSendLog {
  keys: string[];
  carriers: string[];
  lastSentAt: string | null;
}

const EMPTY: LineSendLog = { keys: [], carriers: [], lastSentAt: null };

function settingKey(shipDate: Date): string {
  return `line_sent:${formatBangkokDateYMD(shipDate)}`;
}

export async function getLineSendLog(shipDate: Date): Promise<LineSendLog> {
  const raw = await getSetting(settingKey(shipDate));
  if (!raw) return EMPTY;
  try {
    const parsed = JSON.parse(raw) as Partial<LineSendLog>;
    return { keys: parsed.keys ?? [], carriers: parsed.carriers ?? [], lastSentAt: parsed.lastSentAt ?? null };
  } catch {
    return EMPTY;
  }
}

/** Adds what was just sent to the day's log. Couriers seen for the first
 * time are appended after the ones already numbered. */
export async function recordLineSend(shipDate: Date, sentKeys: string[], carriers: string[]): Promise<void> {
  const log = await getLineSendLog(shipDate);
  const keys = Array.from(new Set([...log.keys, ...sentKeys]));
  const order = [...log.carriers, ...carriers.filter((c) => !log.carriers.includes(c))];
  await setSetting(settingKey(shipDate), JSON.stringify({ keys, carriers: order, lastSentAt: new Date().toISOString() }));
}

/** Pile order for this send: the day's fixed order first, then couriers new
 * today in the order given (busiest first). */
export function orderCarriers<T extends { carrier: string }>(groups: T[], fixedOrder: string[]): T[] {
  const rank = (c: string) => {
    const i = fixedOrder.indexOf(c);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  return groups.map((g, i) => ({ g, i })).sort((a, b) => rank(a.g.carrier) - rank(b.g.carrier) || a.i - b.i).map(({ g }) => g);
}
