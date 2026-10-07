"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";
import type { CancellationTrendPoint } from "@/lib/cancellationStats";

/** Categorical slots 1–3 of the validated palette, plus a deliberate grey for
 * "ไม่ระบุ".
 *
 * The grey is not a fourth hue on purpose: a fourth categorical slot would put
 * yellow next to orange, and "unknown" is a gap in the data rather than a peer
 * of the other three — recessive grey says that, a bright hue doesn't.
 *
 * Both columns were run through the palette validator against this card's real
 * surfaces (#ffffff light, gray-800 #1f2937 dark): all checks pass, with one
 * light-mode contrast warning on the aqua, which the legend, the tooltip
 * numbers and the table below the chart already relieve. */
const SERIES = [
  { key: "buyer", label: "ลูกค้ายกเลิก", light: "#2a78d6", dark: "#3987e5" },
  { key: "seller", label: "ร้านยกเลิก", light: "#eb6834", dark: "#d95926" },
  { key: "system", label: "ระบบยกเลิก", light: "#1baf7a", dark: "#199e70" },
  { key: "unknown", label: "ไม่ระบุ", light: "#9ca3af", dark: "#6b7280" },
] as const;

function CustomTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload as CancellationTrendPoint | undefined;
  if (!point) return null;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-gray-700 dark:bg-gray-800">
      <p className="mb-1 font-semibold text-gray-900 dark:text-gray-100">{label}</p>
      {SERIES.map((s) => {
        const value = point[s.key];
        if (!value) return null;
        return (
          <p key={s.key} className="flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
            <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: s.light }} />
            {s.label} {value.toLocaleString()}
          </p>
        );
      })}
      <p className="mt-1 border-t border-gray-100 pt-1 font-medium text-gray-900 dark:border-gray-700 dark:text-gray-100">
        รวม {point.total.toLocaleString()}
      </p>
    </div>
  );
}

export function CancellationTrendChart({
  data,
  granularity,
}: {
  data: CancellationTrendPoint[];
  granularity: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">ช่วงเวลาที่ถูกยกเลิก</h2>
        <p className="text-xs text-gray-400 dark:text-gray-500">
          จำนวนออเดอร์ที่ยกเลิก{granularity} แยกตามผู้ยกเลิก
        </p>
      </div>

      {data.length === 0 ? (
        <p className="py-12 text-center text-sm text-gray-400">ไม่มีออเดอร์ที่ยกเลิกในช่วงนี้</p>
      ) : (
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              {/* Horizontal only: vertical lines add nothing on a categorical
                  axis and compete with the bars. */}
              <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-gray-200 dark:stroke-gray-700" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11 }}
                className="fill-gray-400"
                interval="preserveStartEnd"
                minTickGap={16}
              />
              <YAxis tick={{ fontSize: 11 }} className="fill-gray-400" allowDecimals={false} />
              {/* Passed as a component reference, not an element — recharts
                  types the `content` prop that way (same as
                  DashboardSalesChart). */}
              <Tooltip content={CustomTooltip} cursor={{ className: "fill-gray-100 dark:fill-gray-700/40" }} />
              <Legend
                wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                formatter={(value) => <span className="text-gray-600 dark:text-gray-300">{value}</span>}
              />
              {SERIES.map((s, i) => (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  name={s.label}
                  stackId="cancellations"
                  fill={s.light}
                  // 2px of surface between stacked segments, and a rounded cap
                  // on the topmost one only — rounding every segment would read
                  // as separate bars rather than parts of one column.
                  stroke="none"
                  radius={i === SERIES.length - 1 ? [4, 4, 0, 0] : undefined}
                  maxBarSize={48}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
