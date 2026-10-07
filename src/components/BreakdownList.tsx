import type { CancellationBreakdownRow } from "@/lib/cancellationStats";

/** A ranked "X of the total" list with an inline bar — shared by the
 * cancellations and returns reports so the two read as one family rather than
 * two lookalike tables that drifted apart. */
export function BreakdownList({
  title,
  rows,
  note,
}: {
  title: string;
  rows: CancellationBreakdownRow[];
  note?: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">{title}</h2>
      {note && <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{note}</p>}
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-gray-400">ไม่มีข้อมูลในช่วงนี้</p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {rows.map((r) => (
            <li key={r.key}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate text-gray-700 dark:text-gray-300">{r.label}</span>
                <span className="shrink-0 tabular-nums text-gray-500 dark:text-gray-400">
                  {r.count.toLocaleString()} ({r.share.toFixed(1)}%) · ฿
                  {r.amount.toLocaleString("th-TH", { maximumFractionDigits: 0 })}
                </span>
              </div>
              {/* A bar rather than a pie: these are ranked magnitudes that
                  need comparing against each other, and the tail is long. */}
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
                <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(r.share, 1)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
