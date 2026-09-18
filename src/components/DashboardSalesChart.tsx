"use client";

import { useRouter } from "next/navigation";
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, type TooltipContentProps } from "recharts";
import type { SalesChartPoint } from "@/lib/dashboardStats";

const PERIOD_OPTIONS = [
  { value: "7", label: "7 วันที่ผ่านมา" },
  { value: "30", label: "30 วันที่ผ่านมา" },
  { value: "90", label: "90 วันที่ผ่านมา" },
];

function formatThb(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(0)}K`;
  return `${value}`;
}

function CustomTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload as SalesChartPoint | undefined;
  if (!point) return null;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-gray-700 dark:bg-gray-800">
      <p className="mb-1 font-semibold text-gray-900 dark:text-gray-100">{label}</p>
      <p className="flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
        <span className="inline-block h-2 w-2 rounded-full bg-blue-300" />
        ยอดขาย {point.sales.toLocaleString()} ฿
      </p>
      <p className="flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
        <span className="inline-block h-2 w-2 rounded-full bg-primary" />
        ออเดอร์ {point.orders.toLocaleString()}
      </p>
      <p className="flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
        <span className="inline-block h-2 w-2 rounded-full bg-rose-500" />
        คืนสินค้า {point.returns.toLocaleString()}
      </p>
    </div>
  );
}

export function DashboardSalesChartPeriodSelect({ value }: { value: string }) {
  const router = useRouter();
  return (
    <select
      value={value}
      onChange={(e) => router.push(`/?chartDays=${e.target.value}`)}
      className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200"
    >
      {PERIOD_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

export function DashboardSalesChart({ data }: { data: SalesChartPoint[] }) {
  const isEmpty = data.every((d) => d.sales === 0 && d.orders === 0 && d.returns === 0);
  if (isEmpty) {
    return <div className="flex h-72 items-center justify-center text-sm text-gray-400 dark:text-gray-500">ยังไม่มีข้อมูลยอดขายในช่วงนี้</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={288}>
      <ComposedChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-gray-100 dark:text-gray-700" />
        <XAxis dataKey="dateLabel" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis yAxisId="thb" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={formatThb} width={40} />
        <YAxis yAxisId="count" orientation="right" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={32} />
        <Tooltip content={CustomTooltip} />
        <Bar yAxisId="thb" dataKey="sales" fill="#93c5fd" radius={[4, 4, 0, 0]} maxBarSize={18} />
        <Line yAxisId="count" type="monotone" dataKey="orders" stroke="#0e2a56" strokeWidth={2} dot={false} />
        <Line yAxisId="count" type="monotone" dataKey="returns" stroke="#e11d48" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
