"use client";

import { useState } from "react";
import { Platform } from "@prisma/client";
import { platformLabel } from "@/lib/labels";

/** Same shape as PricePoint but with a serializable ISO date string instead
 * of a Date, since this is a client component receiving server-fetched
 * data as props. */
export interface ChartPricePoint {
  orderDate: string;
  unitPrice: number;
  quantity: number;
  platform: Platform;
}

const PLATFORM_STROKE: Record<Platform, string> = {
  SHOPEE: "#f97316",
  TIKTOK: "#18181b",
  LAZADA: "#9333ea",
};

const VIEW_WIDTH = 1000;
const VIEW_HEIGHT = 260;
const PAD_TOP = 20;
const PAD_BOTTOM = 30;
const PAD_X = 10;

function formatBaht(n: number): string {
  return n.toLocaleString("th-TH", { maximumFractionDigits: 0 });
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

/** Price-over-time chart split into one colored line per platform, since the
 * same SKU can be priced differently per channel. Hand-rolled SVG (single
 * data series per platform, no need for a charting library). */
export function PriceHistoryChart({ points }: { points: ChartPricePoint[] }) {
  const [hover, setHover] = useState<ChartPricePoint | null>(null);

  if (points.length === 0) {
    return <p className="py-12 text-center text-sm text-gray-400 dark:text-gray-500">ไม่มีประวัติราคา</p>;
  }

  const dates = points.map((p) => new Date(p.orderDate).getTime());
  const prices = points.map((p) => p.unitPrice);
  const minDate = Math.min(...dates);
  const maxDate = Math.max(...dates);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const dateSpan = Math.max(1, maxDate - minDate);
  const priceSpan = Math.max(1, maxPrice - minPrice);

  function x(t: number): number {
    return PAD_X + ((t - minDate) / dateSpan) * (VIEW_WIDTH - PAD_X * 2);
  }
  function y(price: number): number {
    return VIEW_HEIGHT - PAD_BOTTOM - ((price - minPrice) / priceSpan) * (VIEW_HEIGHT - PAD_TOP - PAD_BOTTOM);
  }

  const byPlatform = new Map<Platform, ChartPricePoint[]>();
  for (const p of points) {
    const list = byPlatform.get(p.platform) ?? [];
    list.push(p);
    byPlatform.set(p.platform, list);
  }

  return (
    <div>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        {hover ? (
          <>
            {formatDate(new Date(hover.orderDate))} · {platformLabel[hover.platform]} · ฿{formatBaht(hover.unitPrice)} · {hover.quantity} ชิ้น
          </>
        ) : (
          "ชี้ที่จุดบนกราฟเพื่อดูรายละเอียด"
        )}
      </p>
      <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-500 dark:text-gray-400">
        {[...byPlatform.keys()].map((pl) => (
          <span key={pl} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: PLATFORM_STROKE[pl] }} />
            {platformLabel[pl]}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`} className="mt-2 w-full" style={{ height: 260 }}>
        <line x1={PAD_X} y1={VIEW_HEIGHT - PAD_BOTTOM} x2={VIEW_WIDTH - PAD_X} y2={VIEW_HEIGHT - PAD_BOTTOM} stroke="#e5e7eb" />
        {[...byPlatform.entries()].map(([pl, series]) => {
          const sorted = [...series].sort((a, b) => new Date(a.orderDate).getTime() - new Date(b.orderDate).getTime());
          const linePath = sorted.map((p, i) => `${i === 0 ? "M" : "L"} ${x(new Date(p.orderDate).getTime())} ${y(p.unitPrice)}`).join(" ");
          return (
            <g key={pl}>
              {sorted.length > 1 && <path d={linePath} fill="none" stroke={PLATFORM_STROKE[pl]} strokeWidth={2} />}
              {sorted.map((p, i) => (
                <circle
                  key={i}
                  cx={x(new Date(p.orderDate).getTime())}
                  cy={y(p.unitPrice)}
                  r={hover === p ? 5 : 3.5}
                  fill={PLATFORM_STROKE[pl]}
                  className="cursor-pointer"
                  onMouseEnter={() => setHover(p)}
                  onMouseLeave={() => setHover((h) => (h === p ? null : h))}
                />
              ))}
            </g>
          );
        })}
        <text x={PAD_X} y={VIEW_HEIGHT - 8} fontSize={11} fill="#9ca3af">
          {formatDate(new Date(minDate))}
        </text>
        <text x={VIEW_WIDTH - PAD_X} y={VIEW_HEIGHT - 8} fontSize={11} fill="#9ca3af" textAnchor="end">
          {formatDate(new Date(maxDate))}
        </text>
        <text x={PAD_X} y={PAD_TOP - 6} fontSize={11} fill="#9ca3af">
          ฿{formatBaht(maxPrice)}
        </text>
        <text x={PAD_X} y={VIEW_HEIGHT - PAD_BOTTOM - 4} fontSize={11} fill="#9ca3af">
          ฿{formatBaht(minPrice)}
        </text>
      </svg>
    </div>
  );
}
