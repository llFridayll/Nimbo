"use client";

import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, type TooltipContentProps } from "recharts";
import type { PlatformSharePoint } from "@/lib/dashboardStats";

function CustomTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload as PlatformSharePoint | undefined;
  if (!point) return null;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-gray-700 dark:bg-gray-800">
      <p className="font-semibold text-gray-900 dark:text-gray-100">{point.label}</p>
      <p className="text-gray-600 dark:text-gray-300">
        {point.count.toLocaleString()} ออเดอร์ที่ส่งแล้ว ({point.pct}%)
      </p>
    </div>
  );
}

export function OrderChannelDonut({ data, total }: { data: PlatformSharePoint[]; total: number }) {
  if (total === 0) {
    return (
      <div className="flex h-56 flex-col items-center justify-center gap-1 text-center">
        <p className="text-sm text-gray-400 dark:text-gray-500">ยังไม่มีการจัดส่งวันนี้</p>
      </div>
    );
  }
  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={224}>
        <PieChart>
          <Pie data={data} dataKey="count" nameKey="label" innerRadius="65%" outerRadius="100%" paddingAngle={total > 0 ? 2 : 0} stroke="none">
            {data.map((p) => (
              <Cell key={p.platform} fill={p.colorHex} />
            ))}
          </Pie>
          <Tooltip content={CustomTooltip} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{total.toLocaleString()}</p>
        <p className="text-xs text-gray-400 dark:text-gray-500">ส่งวันนี้</p>
      </div>
    </div>
  );
}
