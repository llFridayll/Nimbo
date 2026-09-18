"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { OrderStatus, Platform } from "@prisma/client";
import { statusLabel, platformLabel } from "@/lib/labels";
import { DateRangeFilter } from "@/components/DateRangeFilter";

export function SalesFilterBar({
  initialStatus,
  initialPlatform,
  initialDays,
  initialFrom,
  initialTo,
  initialShop,
  shops,
}: {
  initialStatus: string;
  initialPlatform: string;
  initialDays: string;
  initialFrom: string;
  initialTo: string;
  initialShop: string;
  /** Connected TikTok Shop stores — only platform with multi-shop support so far. */
  shops: { shopId: string; shopName: string | null }[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function pushParams(next: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    router.push(`/sales?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <select
        value={initialStatus}
        onChange={(e) => pushParams({ status: e.target.value })}
        className="rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm"
      >
        <option value="">ทุกสถานะ</option>
        {Object.values(OrderStatus).map((s) => (
          <option key={s} value={s}>
            {statusLabel[s]}
          </option>
        ))}
      </select>
      <select
        value={initialPlatform}
        onChange={(e) => pushParams({ platform: e.target.value, shop: "" })}
        className="rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm"
      >
        <option value="">ทุกช่องทางขาย</option>
        {Object.values(Platform).map((p) => (
          <option key={p} value={p}>
            {platformLabel[p]}
          </option>
        ))}
      </select>
      {initialPlatform === Platform.TIKTOK && shops.length > 1 && (
        <select
          value={initialShop}
          onChange={(e) => pushParams({ shop: e.target.value })}
          className="rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm"
        >
          <option value="">ทุกร้าน TikTok Shop</option>
          {shops.map((s) => (
            <option key={s.shopId} value={s.shopId}>
              {s.shopName ?? s.shopId}
            </option>
          ))}
        </select>
      )}
      <DateRangeFilter days={initialDays} from={initialFrom} to={initialTo} onChange={pushParams} />
    </div>
  );
}
