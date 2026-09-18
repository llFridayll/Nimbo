import Link from "next/link";
import { TrendingUpIcon, TrendingDownIcon } from "@/components/icons";

interface KpiCardProps {
  label: string;
  value: string;
  icon: (props: { className?: string }) => React.JSX.Element;
  iconBgClass: string;
  changePct: number | null;
  direction: "up" | "down" | "flat";
  /** Which direction counts as "good" for this metric — e.g. more
   * cancellations is bad, so cancelledOrReturned passes "down" here while
   * every other KPI keeps the "up is good" default. */
  positiveDirection?: "up" | "down";
  caption: string;
  href: string;
}

export function KpiCard({ label, value, icon: Icon, iconBgClass, changePct, direction, positiveDirection = "up", caption, href }: KpiCardProps) {
  const isGood = direction === "flat" ? null : direction === positiveDirection;
  return (
    <Link
      href={href}
      className="group rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex items-center justify-between">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconBgClass}`}>
          <Icon className="h-5 w-5" />
        </span>
        {changePct !== null && direction !== "flat" && (
          <span
            className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
              isGood ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400"
            }`}
          >
            {direction === "up" ? <TrendingUpIcon className="h-3 w-3" /> : <TrendingDownIcon className="h-3 w-3" />}
            {Math.abs(changePct).toFixed(0)}%
          </span>
        )}
      </div>
      <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-0.5 text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">{value}</p>
      <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{caption}</p>
    </Link>
  );
}
