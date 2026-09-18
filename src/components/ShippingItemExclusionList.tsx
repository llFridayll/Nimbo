"use client";

import type { ShippingPreviewItem } from "@/lib/shippingSummaryActions";

/** Grouped, checkbox-driven picker shared by the LINE and Excel preview
 * dialogs — unchecking an item marks it "customer cancelled" so it drops out
 * of both the live preview and whatever gets actually sent/downloaded. */
export function ShippingItemExclusionList({
  items,
  excludedKeys,
  onToggle,
  onSetAll,
}: {
  items: ShippingPreviewItem[];
  excludedKeys: Set<string>;
  onToggle: (key: string) => void;
  onSetAll?: (excluded: boolean) => void;
}) {
  if (items.length === 0) {
    return <p className="px-1 py-10 text-center text-sm text-gray-400 dark:text-gray-500">ไม่มีสินค้าในช่วงเวลานี้</p>;
  }

  const byCarrier = new Map<string, ShippingPreviewItem[]>();
  for (const item of items) {
    if (!byCarrier.has(item.carrier)) byCarrier.set(item.carrier, []);
    byCarrier.get(item.carrier)!.push(item);
  }
  const includedTotal = items.length - excludedKeys.size;

  return (
    <div className="space-y-3">
      {onSetAll && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-400 dark:text-gray-500">
            เลือกส่ง {includedTotal}/{items.length} รายการ
          </span>
          <div className="flex gap-3">
            <button type="button" onClick={() => onSetAll(false)} className="font-medium text-primary hover:underline">
              เลือกทั้งหมด
            </button>
            <button type="button" onClick={() => onSetAll(true)} className="font-medium text-gray-500 hover:underline dark:text-gray-400">
              ไม่เลือกเลย
            </button>
          </div>
        </div>
      )}

      {Array.from(byCarrier.entries()).map(([carrier, carrierItems]) => {
        const includedCount = carrierItems.filter((i) => !excludedKeys.has(i.key)).length;
        return (
          <div key={carrier} className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-600 dark:bg-gray-900/60 dark:text-gray-300">
              <span>{carrier}</span>
              <span className="rounded-full bg-white px-2 py-0.5 font-normal text-gray-400 shadow-sm dark:bg-gray-800 dark:text-gray-500">
                {includedCount}/{carrierItems.length}
              </span>
            </div>
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {carrierItems.map((item) => {
                const excluded = excludedKeys.has(item.key);
                return (
                  <li key={item.key} className="flex items-start gap-2.5 px-3 py-2.5 transition-colors hover:bg-gray-50 dark:hover:bg-gray-900/40">
                    <input
                      type="checkbox"
                      checked={!excluded}
                      onChange={() => onToggle(item.key)}
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-emerald-600"
                    />
                    <button type="button" onClick={() => onToggle(item.key)} className="min-w-0 flex-1 text-left">
                      <div className={`text-xs font-medium text-gray-800 dark:text-gray-200 ${excluded ? "text-gray-400 line-through dark:text-gray-500" : ""}`}>
                        {item.productName} <span className="text-gray-400 dark:text-gray-500">x{item.quantity}</span>
                      </div>
                      <div className="mt-0.5 truncate text-[11px] text-gray-400 dark:text-gray-500">
                        {item.shop} · #{item.platformOrderId} · {item.sku}
                      </div>
                    </button>
                    {excluded && (
                      <span className="shrink-0 rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-600 dark:bg-red-950 dark:text-red-400">
                        ยกเลิก
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
