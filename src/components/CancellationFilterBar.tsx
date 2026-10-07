"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Platform } from "@prisma/client";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { platformLabel } from "@/lib/labels";
import { SHOP_BRANDS } from "@/lib/shops";

const INITIATORS: { value: string; label: string }[] = [
  { value: "BUYER", label: "ลูกค้ายกเลิก" },
  { value: "SELLER", label: "ร้านยกเลิก" },
  { value: "SYSTEM", label: "ระบบยกเลิกอัตโนมัติ" },
];

export function CancellationFilterBar({
  initialPlatform,
  initialShop,
  initialInitiator,
  initialDays,
  initialFrom,
  initialTo,
  basePath = "/cancellations",
  showInitiator = true,
}: {
  initialPlatform: string;
  initialShop: string;
  initialInitiator: string;
  initialDays: string;
  initialFrom: string;
  initialTo: string;
  /** Which report these filters belong to — the returns page reuses this bar
   * so the two have one set of controls that behave identically. */
  basePath?: string;
  /** Returns have no buyer/seller/system split to filter on. */
  showInitiator?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function pushParams(next: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    router.push(`${basePath}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <select
        value={initialPlatform}
        onChange={(e) => pushParams({ platform: e.target.value })}
        className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
      >
        <option value="">ทุกช่องทาง</option>
        {Object.values(Platform).map((p) => (
          <option key={p} value={p}>
            {platformLabel[p]}
          </option>
        ))}
      </select>

      <select
        value={initialShop}
        onChange={(e) => pushParams({ shop: e.target.value })}
        className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
      >
        <option value="">ทุกร้าน</option>
        {SHOP_BRANDS.map((b) => (
          <option key={b.key} value={b.key}>
            {b.label}
          </option>
        ))}
      </select>

      {showInitiator && (
        <select
          value={initialInitiator}
          onChange={(e) => pushParams({ initiator: e.target.value })}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
        >
          <option value="">ใครก็ได้</option>
          {INITIATORS.map((i) => (
            <option key={i.value} value={i.value}>
              {i.label}
            </option>
          ))}
        </select>
      )}

      <DateRangeFilter
        days={initialDays}
        from={initialFrom}
        to={initialTo}
        onChange={(next) => pushParams(next)}
      />
    </div>
  );
}
