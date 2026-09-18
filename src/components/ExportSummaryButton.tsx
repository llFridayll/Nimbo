"use client";

import { useState, useTransition } from "react";
import { getShippingSummaryPreviewItems, previewShippingSummarySlip, type ShippingPreviewItem } from "@/lib/shippingSummaryActions";
import type { SlipPreviewCarrier } from "@/lib/shippingSummaryExcel";
import { ShippingItemExclusionList } from "@/components/ShippingItemExclusionList";
import { PreviewDialog, DialogLoadingState } from "@/components/PreviewDialog";
import { PackageIcon } from "@/components/icons";

/** `excludedKeys`: pass this when embedding the button somewhere that already
 * has its own item picker (e.g. inside SendLineSummaryButton's dialog) — the
 * button then skips its own item tab and just previews/downloads using the
 * given exclusions, so a customer-cancelled item picked in the LINE dialog
 * stays excluded from the Excel file too instead of needing to be re-picked. */
export function ExportSummaryButton({ date, compact = false, excludedKeys: externalExcludedKeys }: { date: string; compact?: boolean; excludedKeys?: string[] }) {
  const isEmbedded = externalExcludedKeys !== undefined;
  const [isLoading, startTransition] = useTransition();
  const [isOpen, setIsOpen] = useState(false);
  const [tab, setTab] = useState<"items" | "preview">("items");
  const [items, setItems] = useState<ShippingPreviewItem[] | null>(null);
  const [preview, setPreview] = useState<SlipPreviewCarrier[] | null>(null);
  const [ownExcludedKeys, setOwnExcludedKeys] = useState<Set<string>>(new Set());
  const [loadError, setLoadError] = useState<string | null>(null);

  const excludedKeys = isEmbedded ? new Set(externalExcludedKeys) : ownExcludedKeys;

  const open = () => {
    setIsOpen(true);
    setTab("items");
    setLoadError(null);
    startTransition(async () => {
      try {
        const currentKeys = isEmbedded ? externalExcludedKeys! : [];
        const [fetchedItems, fetchedPreview] = await Promise.all([
          isEmbedded ? Promise.resolve(null) : getShippingSummaryPreviewItems(date),
          previewShippingSummarySlip(date, currentKeys),
        ]);
        if (fetchedItems) setItems(fetchedItems);
        setPreview(fetchedPreview);
        if (!isEmbedded) setOwnExcludedKeys(new Set());
      } catch {
        setLoadError("โหลดตัวอย่างไม่สำเร็จ ลองใหม่อีกครั้ง");
      }
    });
  };

  const close = () => {
    setIsOpen(false);
    setItems(null);
    setPreview(null);
    setOwnExcludedKeys(new Set());
  };

  const recompute = (next: Set<string>) => {
    setOwnExcludedKeys(next);
    startTransition(async () => {
      setPreview(await previewShippingSummarySlip(date, Array.from(next)));
    });
  };

  const toggleItem = (key: string) => {
    const next = new Set(ownExcludedKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    recompute(next);
  };

  const setAll = (excluded: boolean) => {
    recompute(excluded ? new Set(items?.map((i) => i.key)) : new Set());
  };

  const totalRows = preview?.reduce((n, c) => n + c.rows.length, 0) ?? 0;
  const downloadHref = `/api/shipping-summary/export?date=${date}&excluded=${encodeURIComponent(JSON.stringify(Array.from(excludedKeys)))}`;

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={open}
        className={
          compact
            ? "shrink-0 whitespace-nowrap rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            : "rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
        }
      >
        📄 ดาวน์โหลด Excel
      </button>

      {isOpen && (
        <PreviewDialog
          icon={<PackageIcon className="h-4 w-4" />}
          title="ตัวอย่างไฟล์ใบเตรียมสินค้า (Excel)"
          subtitle="ตรวจสอบข้อมูลให้ถูกต้องก่อนดาวน์โหลด"
          maxWidthClassName="max-w-2xl"
          tabs={
            isEmbedded
              ? undefined
              : [
                  { key: "items", label: `รายการสินค้า${items ? ` (${items.length})` : ""}` },
                  { key: "preview", label: "ตัวอย่างไฟล์" },
                ]
          }
          activeTab={tab}
          onTabChange={(k) => setTab(k as "items" | "preview")}
          onClose={close}
          footer={
            <>
              <p className="text-xs text-gray-400 dark:text-gray-500">{excludedKeys.size > 0 ? `ตัดออก ${excludedKeys.size} รายการ` : " "}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={close}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  ยกเลิก
                </button>
                <a
                  href={downloadHref}
                  onClick={close}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium text-white ${
                    totalRows === 0 ? "pointer-events-none bg-gray-300 dark:bg-gray-600" : "bg-emerald-600 hover:bg-emerald-700"
                  }`}
                >
                  ยืนยันดาวน์โหลด
                </a>
              </div>
            </>
          }
        >
          {loadError ? (
            <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p>
          ) : !preview ? (
            <DialogLoadingState />
          ) : !isEmbedded && tab === "items" && items ? (
            <ShippingItemExclusionList items={items} excludedKeys={ownExcludedKeys} onToggle={toggleItem} onSetAll={setAll} />
          ) : (
            <SlipPreviewTable preview={preview} isUpdating={isLoading} />
          )}
        </PreviewDialog>
      )}
    </div>
  );
}

function SlipPreviewTable({ preview, isUpdating }: { preview: SlipPreviewCarrier[]; isUpdating: boolean }) {
  const totalRows = preview.reduce((n, c) => n + c.rows.length, 0);
  if (totalRows === 0) return <p className="py-10 text-center text-sm text-gray-400 dark:text-gray-500">ไม่มีเนื้อหาจะดาวน์โหลด</p>;

  return (
    <div className={`space-y-4 transition-opacity ${isUpdating ? "opacity-40" : "opacity-100"}`}>
      {preview
        .filter((c) => c.rows.length > 0)
        .map((carrier) => (
          <div key={carrier.carrier} className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
            <div className="bg-gray-800 px-3 py-1.5 text-sm font-semibold text-white dark:bg-gray-900">{carrier.carrier}</div>
            <table className="w-full border-collapse text-xs">
              <tbody>
                {carrier.rows.map((row, i) => (
                  <tr key={i} className={i % 2 === 1 ? "bg-gray-50 dark:bg-gray-800/40" : ""}>
                    <td className="whitespace-nowrap border-r border-gray-100 px-3 py-1.5 font-mono text-gray-500 dark:border-gray-800 dark:text-gray-400">{row.trackingText}</td>
                    <td className="break-words px-3 py-1.5 text-gray-800 dark:text-gray-200">{row.productText}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
    </div>
  );
}
