"use client";

import { useMemo, useState } from "react";
import { DailySalesPoint, ProductQuantity } from "@/lib/salesStats";

const CHART_HEIGHT = 260;
// Narrowest a single bucket (one day/week/month column) may get. Every bucket
// is flex-1, so a short range still stretches to fill the card with no
// scrollbar; only once buckets × this exceeds the card (e.g. "ทั้งหมด" at
// daily granularity is 400+ columns) does the chart grow past it and become
// horizontally scrollable — inside its own container, see below.
const MIN_BUCKET_PX = 10;
const MAX_BARS = 31;

function formatBaht(n: number): string {
  return n.toLocaleString("th-TH", { maximumFractionDigits: 0 });
}

/** Shortened form for the in-chart bar/axis labels, e.g. 12,300 -> "12.3k" —
 * full precision is still available in the hover summary line above. */
function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(Math.round(n));
}

function parseKey(dateKey: string): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function shortDate(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

type Granularity = "day" | "week" | "month";

interface Bucket {
  label: string;
  detail: string;
  orderCount: number;
  revenue: number;
  cancelledCount: number;
  cancelledAmount: number;
  products: ProductQuantity[];
}

/** Merges per-day product lists into one, summing quantities per SKU and
 * re-sorting so the most-sold product stays first even after merging
 * several days together into a week/month bucket. */
function mergeProducts(target: ProductQuantity[], incoming: ProductQuantity[]): ProductQuantity[] {
  const bySku = new Map(target.map((p) => [p.sku, { ...p }]));
  for (const p of incoming) {
    const existing = bySku.get(p.sku);
    if (existing) existing.quantity += p.quantity;
    else bySku.set(p.sku, { ...p });
  }
  return [...bySku.values()].sort((a, b) => b.quantity - a.quantity);
}

/** Picks a sensible default granularity for a range this long — a year of
 * daily bars is unreadable noise, so it starts more zoomed-out the longer
 * the range is. The viewer can still switch to any granularity manually. */
function defaultGranularity(dayCount: number): Granularity {
  if (dayCount <= MAX_BARS) return "day";
  return dayCount <= 180 ? "week" : "month";
}

/** Groups daily points into day/week/month buckets per the chosen
 * granularity. Week buckets start on Monday; month buckets are calendar
 * months. */
function bucketPoints(points: DailySalesPoint[], granularity: Granularity): Bucket[] {
  if (granularity === "day") {
    return points.map((p) => ({
      label: shortDate(parseKey(p.date)),
      detail: p.date,
      orderCount: p.orderCount,
      revenue: p.revenue,
      cancelledCount: p.cancelledCount,
      cancelledAmount: p.cancelledAmount,
      products: p.products,
    }));
  }

  const groups = new Map<string, Bucket>();

  for (const p of points) {
    const d = parseKey(p.date);
    let key: string;
    let label: string;
    let detail: string;
    if (granularity === "week") {
      const monday = new Date(d);
      const dow = (d.getDay() + 6) % 7; // 0 = Monday
      monday.setDate(d.getDate() - dow);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      key = monday.toISOString().slice(0, 10);
      label = shortDate(monday);
      detail = `สัปดาห์ ${shortDate(monday)} - ${shortDate(sunday)}`;
    } else {
      key = p.date.slice(0, 7);
      label = key;
      detail = `เดือน ${key}`;
    }
    const bucket = groups.get(key) ?? { label, detail, orderCount: 0, revenue: 0, cancelledCount: 0, cancelledAmount: 0, products: [] };
    bucket.orderCount += p.orderCount;
    bucket.revenue += p.revenue;
    bucket.cancelledCount += p.cancelledCount;
    bucket.cancelledAmount += p.cancelledAmount;
    bucket.products = mergeProducts(bucket.products, p.products);
    groups.set(key, bucket);
  }

  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, b]) => b);
}

const GRANULARITY_OPTIONS: { value: Granularity; label: string }[] = [
  { value: "day", label: "วัน" },
  { value: "week", label: "สัปดาห์" },
  { value: "month", label: "เดือน" },
];

/** Simple hand-rolled diverging bar chart — no charting library needed.
 * Sales grow up from a zero line in indigo; cancelled/refunded/returned
 * orders mirror downward in red on the same day, sharing one scale so the
 * two are directly comparable. Starts at a granularity that fits the
 * selected range, but the viewer can switch between day/week/month anytime. */
export function SalesChart({ points }: { points: DailySalesPoint[] }) {
  const [metric, setMetric] = useState<"revenue" | "orderCount">("revenue");
  const [granularity, setGranularity] = useState<Granularity>(() => defaultGranularity(points.length));
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  // Keyed by the bucket's `detail` string (unique per bucket) rather than
  // index, so a stale selection from before a granularity change just fails
  // to match anything instead of pointing at the wrong bar's data.
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const buckets = useMemo(() => bucketPoints(points, granularity), [points, granularity]);
  const values = buckets.map((b) => (metric === "revenue" ? b.revenue : b.orderCount));
  const cancelledValues = buckets.map((b) => (metric === "revenue" ? b.cancelledAmount : b.cancelledCount));
  // Sales and cancellations share one scale so a bar's height directly
  // reflects its size relative to the other side, not just its own column.
  const max = Math.max(1, ...values, ...cancelledValues);
  const shown = hoverIndex !== null ? buckets[hoverIndex] : null;
  const selected = buckets.find((b) => b.detail === selectedKey) ?? null;
  const showBarLabels = buckets.length <= MAX_BARS;
  const labelStride = Math.max(1, Math.ceil(buckets.length / 24));
  const halfHeight = CHART_HEIGHT / 2;

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">ประวัติการขาย</p>
          {shown ? (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {shown.detail} · {shown.orderCount.toLocaleString()} ออเดอร์ · ฿{formatBaht(shown.revenue)}
              {shown.cancelledCount > 0 && (
                <span className="text-red-600"> · ยกเลิก {shown.cancelledCount.toLocaleString()} ออเดอร์ (฿{formatBaht(shown.cancelledAmount)})</span>
              )}
            </p>
          ) : (
            <p className="text-xs text-gray-400 dark:text-gray-500">ชี้ที่แท่งกราฟเพื่อดูตัวเลข</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-md border border-gray-300 dark:border-gray-600 text-xs">
            {GRANULARITY_OPTIONS.map((g) => (
              <button
                key={g.value}
                type="button"
                onClick={() => setGranularity(g.value)}
                className={`border-l border-gray-300 dark:border-gray-600 px-3 py-1.5 font-medium first:border-l-0 ${
                  granularity === g.value ? "bg-primary text-white" : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
          <div className="flex overflow-hidden rounded-md border border-gray-300 dark:border-gray-600 text-xs">
            <button
              type="button"
              onClick={() => setMetric("revenue")}
              className={`px-3 py-1.5 font-medium ${metric === "revenue" ? "bg-primary text-white" : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"}`}
            >
              ยอดขายสุทธิ (฿)
            </button>
            <button
              type="button"
              onClick={() => setMetric("orderCount")}
              className={`border-l border-gray-300 dark:border-gray-600 px-3 py-1.5 font-medium ${
                metric === "orderCount" ? "bg-primary text-white" : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
              }`}
            >
              จำนวนออเดอร์
            </button>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-4 text-xs text-gray-500 dark:text-gray-400">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-indigo-400" />
          ขายได้
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-red-400" />
          ยกเลิก/คืนเงิน/คืนสินค้า
        </span>
      </div>

      {buckets.length === 0 ? (
        <p className="py-12 text-center text-sm text-gray-400 dark:text-gray-500">ไม่มีข้อมูลในช่วงเวลานี้</p>
      ) : (
        <div className="mt-2">
          <div className="flex gap-3">
            <div className="flex flex-col text-[10px] text-gray-400 dark:text-gray-500" style={{ height: CHART_HEIGHT }}>
              <div className="relative" style={{ height: halfHeight }}>
                <span className="absolute top-0">{metric === "revenue" ? formatCompact(max) : max.toLocaleString()}</span>
                <span className="absolute bottom-0 translate-y-1/2">0</span>
              </div>
              <div className="relative" style={{ height: halfHeight }}>
                <span className="absolute bottom-0 text-red-400">-{metric === "revenue" ? formatCompact(max) : max.toLocaleString()}</span>
              </div>
            </div>
            {/* Scrolls horizontally on its own when there are more buckets
                than fit. Without min-w-0 + overflow-x-auto here, a 400-bucket
                row overflowed this flex child, widened the document, and put a
                page-level scrollbar on the whole screen — this keeps the
                scrollbar on the chart and the y-axis (sibling above) pinned.
                pb-4 reserves a clear band at the bottom: the scrollbar is
                drawn along the container's bottom edge, and the x-axis date
                row is the last child — without the padding, macOS overlay
                scrollbars paint straight over the dates. */}
            <div className="relative min-w-0 flex-1 overflow-x-auto pb-4">
              <div
                className="flex items-stretch gap-1"
                style={{ height: CHART_HEIGHT, minWidth: buckets.length * MIN_BUCKET_PX }}
                onMouseLeave={() => setHoverIndex(null)}
              >
                {buckets.map((b, i) => {
                  const value = metric === "revenue" ? b.revenue : b.orderCount;
                  const cancelledValue = metric === "revenue" ? b.cancelledAmount : b.cancelledCount;
                  const upPct = Math.max(value > 0 ? 3 : 0, (value / max) * (showBarLabels ? 88 : 100));
                  const downPct = Math.max(cancelledValue > 0 ? 3 : 0, (cancelledValue / max) * (showBarLabels ? 88 : 100));
                  const active = hoverIndex === i;
                  const isSelected = selectedKey === b.detail;
                  return (
                    <button
                      key={i}
                      type="button"
                      className="group relative flex flex-1 flex-col border-0 bg-transparent p-0"
                      style={{ height: "100%" }}
                      onMouseEnter={() => setHoverIndex(i)}
                      onClick={() => setSelectedKey((cur) => (cur === b.detail ? null : b.detail))}
                    >
                      {/* Top half: sales bar growing up from the zero line. */}
                      <div className="relative flex flex-col justify-end" style={{ height: halfHeight }}>
                        {showBarLabels && value > 0 && (
                          <span
                            className={`absolute left-1/2 -translate-x-1/2 -translate-y-full whitespace-nowrap text-[10px] ${
                              active ? "font-semibold text-indigo-700" : "text-gray-500 dark:text-gray-400"
                            }`}
                            style={{ bottom: `${upPct}%` }}
                          >
                            {metric === "revenue" ? formatCompact(value) : value.toLocaleString()}
                          </span>
                        )}
                        <div
                          className={`w-full rounded-t-sm transition-colors ${
                            isSelected ? "bg-indigo-700" : active ? "bg-indigo-600" : "bg-indigo-300 group-hover:bg-indigo-400"
                          }`}
                          style={{ height: `${upPct}%` }}
                        />
                      </div>
                      {/* Bottom half: cancelled/refunded/returned bar mirrored downward. */}
                      <div className="relative border-t border-gray-300 dark:border-gray-600" style={{ height: halfHeight }}>
                        <div
                          className={`w-full rounded-b-sm transition-colors ${
                            isSelected ? "bg-red-600" : active ? "bg-red-500" : "bg-red-300 group-hover:bg-red-400"
                          }`}
                          style={{ height: `${downPct}%` }}
                        />
                        {showBarLabels && cancelledValue > 0 && (
                          <span
                            className={`absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] ${
                              active ? "font-semibold text-red-700" : "text-red-400"
                            }`}
                            style={{ top: `${downPct}%` }}
                          >
                            {metric === "revenue" ? formatCompact(cancelledValue) : cancelledValue.toLocaleString()}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
              <div
                className="mt-1 flex gap-1 text-[10px] text-gray-400 dark:text-gray-500"
                style={{ minWidth: buckets.length * MIN_BUCKET_PX }}
              >
                {buckets.map((b, i) => (
                  <div key={i} className="flex-1 text-center">
                    {i % labelStride === 0 ? b.label : ""}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {selected && (
            <div className="mt-4 rounded-lg border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/60 p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">สินค้าที่ขายได้ · {selected.detail}</p>
                <button type="button" onClick={() => setSelectedKey(null)} className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600">
                  ปิด
                </button>
              </div>
              {selected.products.length === 0 ? (
                <p className="mt-2 text-sm text-gray-400 dark:text-gray-500">ไม่มีสินค้าที่ขายได้ในช่วงนี้</p>
              ) : (
                <ol className="mt-2 divide-y divide-gray-200 dark:divide-gray-700">
                  {selected.products.map((p, i) => (
                    <li key={p.sku} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                      <span className="text-gray-600 dark:text-gray-400">
                        {i + 1}. {p.productName}{" "}
                        <span className="text-xs text-gray-400 dark:text-gray-500">({p.sku})</span>
                      </span>
                      <span className="shrink-0 font-medium text-gray-900 dark:text-gray-100">{p.quantity.toLocaleString()} ชิ้น</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
