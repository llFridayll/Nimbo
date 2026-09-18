import { OrderStatus, Platform } from "@prisma/client";
import { statusLabel, statusColor, platformLabel, platformColor } from "@/lib/labels";

export function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusColor[status]}`}>
      {statusLabel[status]}
    </span>
  );
}

export function PlatformBadge({ platform }: { platform: Platform }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 dark:bg-gray-700 px-2.5 py-0.5 text-xs font-medium text-gray-700 dark:text-gray-300">
      <span className={`h-1.5 w-1.5 rounded-full ${platformColor[platform]}`} />
      {platformLabel[platform]}
    </span>
  );
}
