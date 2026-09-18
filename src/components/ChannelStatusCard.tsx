import type { ChannelStatus } from "@/lib/dashboardStats";
import { platformColor } from "@/lib/labels";

export function ChannelStatusCard({ channel }: { channel: ChannelStatus }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${platformColor[channel.platform]}`}>
        {channel.label.charAt(0)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{channel.label}</p>
        <p className={`text-xs font-medium ${channel.connected ? "text-emerald-600 dark:text-emerald-400" : "text-gray-400 dark:text-gray-500"}`}>
          {channel.connected && <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 align-middle" />}
          {channel.statusText}
        </p>
        <p className="truncate text-[11px] text-gray-400 dark:text-gray-500">{channel.lastUpdatedLabel}</p>
      </div>
      {channel.actionHref && (
        <a
          href={channel.actionHref}
          className="shrink-0 rounded-md border border-gray-200 px-2 py-1 text-[11px] font-medium text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          {channel.actionLabel}
        </a>
      )}
    </div>
  );
}
