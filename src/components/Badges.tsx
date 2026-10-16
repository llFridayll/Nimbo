import { OrderStatus, Platform } from "@prisma/client";
import { statusLabel, statusColor, platformLabel } from "@/lib/labels";
import { PlatformLogo } from "@/components/PlatformLogo";

export function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusColor[status]}`}>
      {statusLabel[status]}
    </span>
  );
}

export function PlatformBadge({ platform }: { platform: Platform }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-gray-100 dark:bg-gray-700 py-0.5 pl-1 pr-2.5 text-xs font-medium text-gray-700 dark:text-gray-300">
      <PlatformLogo platform={platform} className="h-4 w-4" />
      {platformLabel[platform]}
    </span>
  );
}
