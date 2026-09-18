"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { OrderStatus, Platform } from "@prisma/client";
import { statusLabel, platformLabel } from "@/lib/labels";
import { DateRangeFilter } from "@/components/DateRangeFilter";

/** Pure URL-state controls — no data fetching here. Every change pushes new
 * searchParams, which re-runs the Server Component page on the server (real
 * SSR: the DB query happens server-side on navigation, not via a client
 * fetch() to our own API). */
export function OrdersFilterBar({
  initialQuery,
  initialStatus,
  initialPlatform,
  initialDays,
  initialFrom,
  initialTo,
  initialShopId,
  shops,
  shopeeShops,
  lazadaShops,
}: {
  initialQuery: string;
  initialStatus: string;
  initialPlatform: string;
  initialDays: string;
  initialFrom: string;
  initialTo: string;
  initialShopId: string;
  /** Connected TikTok Shop stores. */
  shops: { shopId: string; shopName: string | null }[];
  /** Distinct shop names seen across manually-imported Shopee orders. */
  shopeeShops: { shopId: string; shopName: string | null }[];
  /** Distinct shop names seen across manually-imported Lazada orders. */
  lazadaShops: { shopId: string; shopName: string | null }[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Always read the latest searchParams inside the debounced callbacks below —
  // without this ref, they'd close over whatever searchParams was current
  // when the effect last ran, and could clobber a filter change made in
  // between with a stale, pre-change URL.
  const searchParamsRef = useRef(searchParams);
  useEffect(() => {
    searchParamsRef.current = searchParams;
  }, [searchParams]);

  const [query, setQuery] = useState(initialQuery);
  const isFirstRender = useRef(true);

  function pushParams(next: Record<string, string>) {
    const params = new URLSearchParams(searchParamsRef.current.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    router.push(`/orders?${params.toString()}`);
  }

  useEffect(() => {
    // Skip on mount — the query already matches the URL then, so there's
    // nothing to push, and doing so anyway risks overwriting another filter
    // change the user makes in the same 300ms window.
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const timer = setTimeout(() => {
      pushParams({ q: query });
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const isSearchMode = Boolean(initialQuery);

  return (
    <div className="flex flex-wrap gap-3">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="เช่น 12345678, เลข Tracking, เบอร์โทร, ชื่อลูกค้า..."
        // A browser extension on this environment injects a caret-color
        // style onto every text input before React hydrates — harmless but
        // noisy hydration-mismatch warning, safe to suppress here.
        suppressHydrationWarning
        className="w-full max-w-md rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
      />
      {!isSearchMode && (
        <>
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
            onChange={(e) => pushParams({ platform: e.target.value, shopId: "" })}
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
              value={initialShopId}
              onChange={(e) => pushParams({ shopId: e.target.value })}
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
          {initialPlatform === Platform.SHOPEE && shopeeShops.length > 1 && (
            <select
              value={initialShopId}
              onChange={(e) => pushParams({ shopId: e.target.value })}
              className="rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm"
            >
              <option value="">ทุกร้าน Shopee</option>
              {shopeeShops.map((s) => (
                <option key={s.shopId} value={s.shopId}>
                  {s.shopName ?? s.shopId}
                </option>
              ))}
            </select>
          )}
          {initialPlatform === Platform.LAZADA && lazadaShops.length > 1 && (
            <select
              value={initialShopId}
              onChange={(e) => pushParams({ shopId: e.target.value })}
              className="rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm"
            >
              <option value="">ทุกร้าน Lazada</option>
              {lazadaShops.map((s) => (
                <option key={s.shopId} value={s.shopId}>
                  {s.shopName ?? s.shopId}
                </option>
              ))}
            </select>
          )}
          <DateRangeFilter days={initialDays} from={initialFrom} to={initialTo} onChange={pushParams} />
        </>
      )}
    </div>
  );
}
