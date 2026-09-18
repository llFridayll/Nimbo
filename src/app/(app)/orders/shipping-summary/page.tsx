import Link from "next/link";
import { currentShippingCutoffWindow, shippingCutoffWindowForDate, formatBangkokDateYMD } from "@/lib/dateUtils";
import { getShippingSummary } from "@/lib/shippingSummary";
import { groupLinesForDisplay, aggregateGroupLines, type MergeGroup, type DisplaySkuRow } from "@/lib/shippingSummaryDisplay";
import { getShippingChecklistOverrides, resolveShippingChecklistChecked, checklistKey } from "@/lib/shippingChecklist";
import { getCurrentUser } from "@/lib/dal";
import { platformLabel } from "@/lib/labels";
import { PrintButton } from "@/components/PrintButton";
import { SendLineSummaryButton } from "@/components/SendLineSummaryButton";
import { ExportSummaryButton } from "@/components/ExportSummaryButton";
import { ShippingChecklistCheckbox } from "@/components/ShippingChecklistCheckbox";
import { SkuAliasEditor } from "@/components/SkuAliasEditor";

export const dynamic = "force-dynamic";

const THAI_WEEKDAYS = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
const DAY_MS = 24 * 60 * 60 * 1000;

type ChecklistView = "all" | "pending" | "shipped";

// Shared cell classes so every column lines up with a visible divider and a
// consistent, compact size — easier to scan than the old borderless table.
// resize-x + overflow-auto gives every header a native drag handle (bottom-right
// corner) so columns can be widened/narrowed by hand — no JS needed, and it's
// hidden automatically on print.
const TH_CLASS =
  "resize-x overflow-auto border-r border-gray-200 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 last:border-r-0 dark:border-gray-700 dark:text-gray-400 print:resize-none";
const TD_CLASS = "border-r border-gray-100 px-3 py-2.5 align-top text-sm text-gray-600 last:border-r-0 dark:border-gray-800 dark:text-gray-400";


const VIEW_TABS: { view: ChecklistView; label: string }[] = [
  { view: "all", label: "ทั้งหมด" },
  { view: "pending", label: "ยังไม่ได้ส่ง" },
  { view: "shipped", label: "ส่งแล้ว" },
];

interface ShippingSummaryPageProps {
  searchParams: Promise<{ date?: string; view?: string }>;
}

export default async function ShippingSummaryPage({ searchParams }: ShippingSummaryPageProps) {
  const params = await searchParams;
  const view: ChecklistView = params.view === "pending" || params.view === "shipped" ? params.view : "all";
  const window =
    params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date)
      ? shippingCutoffWindowForDate(new Date(`${params.date}T12:00:00+07:00`))
      : currentShippingCutoffWindow();

  const currentUser = await getCurrentUser();
  const canEditSku = currentUser.role === "ADMIN";
  const summary = await getShippingSummary(window);
  const shipDateStr = formatBangkokDateYMD(window.shipDate);
  const checklistOverrides = await getShippingChecklistOverrides(shipDateStr);
  // Saturday's ship date rolls in Sunday too, so stepping back a plain day
  // from Monday would land on Sunday (never a ship date) — skip it.
  const prevOffsetDays = window.dow === 1 ? 2 : 1;
  const prevWindow = shippingCutoffWindowForDate(new Date(window.shipDate.getTime() - prevOffsetDays * DAY_MS));
  const nextWindow = shippingCutoffWindowForDate(new Date(window.shipDate.getTime() + DAY_MS));

  const weekdayLabel = THAI_WEEKDAYS[window.dow];
  const dateLabel = window.shipDate.toLocaleDateString("th-TH", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  });
  const fromLabel = window.from.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" });
  const toLabel = window.to.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" });

  // Carriers where the current filter (all/pending/shipped) leaves nothing
  // to show are dropped entirely rather than rendered as an empty card.
  const visibleCarriers = summary.carriers
    .map((group) => {
      // One checkbox now covers a whole merged shipment (all its orders'
      // SKU lines), so it's only "shipped" once every one of those lines
      // resolves checked — and pending/shipped bucketing moves per merged
      // group, not per individual line.
      const mergeGroups = groupLinesForDisplay(group.lines);
      const isGroupChecked = (mg: MergeGroup) =>
        mg.lines.every((line) => resolveShippingChecklistChecked(checklistOverrides, checklistKey(line.orderId, line.sku), Boolean(line.trackingNumber)));
      const pendingGroups = mergeGroups.filter((mg) => !isGroupChecked(mg));
      const shippedGroups = mergeGroups.filter((mg) => isGroupChecked(mg));
      const countLines = (groups: MergeGroup[]) => groups.reduce((n, mg) => n + mg.lines.length, 0);
      const sections =
        view === "pending"
          ? [{ label: null as string | null, mergeGroups: pendingGroups }]
          : view === "shipped"
            ? [{ label: null as string | null, mergeGroups: shippedGroups }]
            : [
                { label: `ยังไม่ได้ส่ง (${countLines(pendingGroups)})`, mergeGroups: pendingGroups },
                { label: `ส่งแล้ว (${countLines(shippedGroups)})`, mergeGroups: shippedGroups },
              ];
      return { group, shippedCount: countLines(shippedGroups), sections: sections.filter((s) => s.mergeGroups.length > 0) };
    })
    .filter((c) => c.sections.length > 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">สรุปออเดอร์สำหรับจัดส่ง</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            ตัดรอบทุกวันเวลา 13:00 น. — จัดส่งจันทร์ถึงเสาร์ ออเดอร์หลัง 13:00 วันเสาร์ถึง 13:00 วันจันทร์ รวมจัดส่งวันจันทร์
          </p>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <SendLineSummaryButton date={shipDateStr} />
          <ExportSummaryButton date={shipDateStr} />
          <PrintButton />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 print:hidden">
        <Link
          href={`/orders/shipping-summary?date=${formatBangkokDateYMD(prevWindow.shipDate)}`}
          className="rounded-md border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          &larr; วันก่อนหน้า
        </Link>
        <form method="GET" className="flex items-center gap-2">
          <input
            type="date"
            name="date"
            defaultValue={shipDateStr}
            className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200"
          />
          <button type="submit" className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:opacity-90">
            ไป
          </button>
        </form>
        <Link
          href={`/orders/shipping-summary?date=${formatBangkokDateYMD(nextWindow.shipDate)}`}
          className="rounded-md border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          วันถัดไป &rarr;
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2 print:hidden">
        {VIEW_TABS.map((tab) => (
          <Link
            key={tab.view}
            href={`/orders/shipping-summary?date=${shipDateStr}${tab.view === "all" ? "" : `&view=${tab.view}`}`}
            className={
              view === tab.view
                ? "rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white"
                : "rounded-md border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            }
          >
            {tab.label}
          </Link>
        ))}
      </div>

      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
        <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          จัดส่งวัน{weekdayLabel}ที่ {dateLabel}
        </p>
        <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
          นับออเดอร์ที่สั่งเข้ามาตั้งแต่ {fromLabel} ถึง {toLabel} — รวมทั้งหมด {summary.totalOrders} ออเดอร์
          {summary.unpaidExcludedCount > 0 && ` (ไม่รวม ${summary.unpaidExcludedCount} ออเดอร์ที่ยังไม่ชำระเงิน)`}
        </p>
      </div>

      {summary.carriers.length === 0 ? (
        <p className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-8 text-center text-sm text-gray-400 dark:text-gray-500">
          ไม่มีออเดอร์ในช่วงเวลานี้
        </p>
      ) : visibleCarriers.length === 0 ? (
        <p className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-8 text-center text-sm text-gray-400 dark:text-gray-500">
          {view === "pending" ? "ส่งครบทุกรายการแล้ว" : "ยังไม่มีรายการที่ส่งแล้ว"}
        </p>
      ) : (
        <div className="space-y-4">
          {visibleCarriers.map(({ group, shippedCount, sections }) => {
            return (
              <div key={group.carrier} className="break-inside-avoid overflow-hidden rounded-lg border border-gray-200 shadow-sm dark:border-gray-700">
                <div className="flex items-center justify-between bg-gray-800 px-4 py-2.5 dark:bg-gray-900">
                  <h2 className="text-base font-semibold text-white">{group.carrier}</h2>
                  <p className="text-sm text-gray-300">
                    {group.orderCount} ออเดอร์ · {group.totalItems} ชิ้น · ส่งแล้ว {shippedCount}/{group.lines.length}
                  </p>
                </div>
                {sections.map(
                  (section) =>
                    section.mergeGroups.length > 0 && (
                      <div key={section.label ?? "only"}>
                        {section.label && (
                          <div className="border-b border-gray-200 bg-gray-50 px-3 py-1.5 dark:border-gray-700 dark:bg-gray-800/60">
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                                section.label.startsWith("ยังไม่ได้ส่ง")
                                  ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                                  : "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                              }`}
                            >
                              {section.label}
                            </span>
                          </div>
                        )}
                        <div className="overflow-x-auto">
                          <table className="w-full border-collapse bg-white dark:bg-gray-900">
                            <thead className="bg-gray-100 dark:bg-gray-800">
                              <tr>
                                <th className={`${TH_CLASS} w-12 text-center`}>ส่งแล้ว</th>
                                <th className={`${TH_CLASS} whitespace-nowrap`}>ร้าน</th>
                                <th className={`${TH_CLASS} whitespace-nowrap`}>เลขคำสั่งซื้อ</th>
                                <th className={`${TH_CLASS} whitespace-nowrap`}>เลขพัสดุ</th>
                                <th className={`${TH_CLASS} whitespace-nowrap`}>SKU</th>
                                <th className={`${TH_CLASS} whitespace-nowrap`}>ชื่อสินค้า</th>
                                <th className={`${TH_CLASS} whitespace-nowrap text-center`}>จำนวน</th>
                              </tr>
                            </thead>
                            <tbody>
                              {section.mergeGroups.map((mg, groupIdx) => {
                                const zebra = groupIdx % 2 === 1 ? "bg-gray-50/60 dark:bg-gray-800/30" : "";
                                const displayRows = aggregateGroupLines(mg.lines);
                                const isRowChecked = (row: DisplaySkuRow) =>
                                  row.sourceLines.every((line) => resolveShippingChecklistChecked(checklistOverrides, checklistKey(line.orderId, line.sku), Boolean(line.trackingNumber)));
                                const isGroupChecked = displayRows.every(isRowChecked);
                                const isMerged = mg.orderIds.length > 1;
                                // Real sub-rows (one per aggregated SKU) with
                                // rowSpan on the shared cells (shop/order
                                // numbers/tracking/checkbox) — so a wrapping
                                // product name only grows its own row's height
                                // instead of throwing off alignment between
                                // the SKU/product/quantity columns.
                                return displayRows.map((row, rowIdx) => {
                                  const isChecked = isRowChecked(row);
                                  return (
                                    <tr key={`${mg.orderIds.join("+")} ${row.sku}`} className={`border-gray-100 dark:border-gray-800 ${zebra} ${rowIdx === displayRows.length - 1 ? "border-b" : ""}`}>
                                      {rowIdx === 0 && (
                                        <>
                                          <td className={`${TD_CLASS} text-center`} rowSpan={displayRows.length}>
                                            <ShippingChecklistCheckbox
                                              shipDate={shipDateStr}
                                              items={mg.lines.map((l) => ({ orderId: l.orderId, sku: l.sku }))}
                                              initialChecked={isGroupChecked}
                                            />
                                          </td>
                                          <td className={TD_CLASS} rowSpan={displayRows.length}>
                                            <div>{mg.shop}</div>
                                            <div className="text-xs text-gray-400 dark:text-gray-500">({platformLabel[mg.platform]})</div>
                                          </td>
                                          <td className={`${TD_CLASS} whitespace-nowrap`} rowSpan={displayRows.length}>
                                            {mg.orderIds.map((orderId, i) => (
                                              <div key={orderId}>
                                                <Link href={`/orders/${orderId}`} className="text-primary hover:underline">
                                                  {mg.platformOrderIds[i]}
                                                </Link>
                                              </div>
                                            ))}
                                            {isMerged && (
                                              <div className="mt-0.5 text-xs font-semibold text-sky-600 dark:text-sky-400">รวมออเดอร์</div>
                                            )}
                                          </td>
                                          <td className={`${TD_CLASS} whitespace-nowrap font-mono text-xs`} rowSpan={displayRows.length}>
                                            {mg.trackingNumber ? (
                                              // A split-shipment order carries more than one tracking
                                              // number joined by " / " (see lazadaImport.ts / tiktok.ts) —
                                              // one per line here instead of crammed onto one.
                                              mg.trackingNumber.split(" / ").map((code) => <div key={code}>{code}</div>)
                                            ) : (
                                              "-"
                                            )}
                                          </td>
                                        </>
                                      )}
                                      <td className={`${TD_CLASS} whitespace-nowrap font-semibold text-gray-900 dark:text-gray-100 ${isChecked ? "line-through opacity-50" : ""}`}>
                                        {canEditSku ? <SkuAliasEditor rawSku={row.sourceLines[0].rawSku} displaySku={row.sku} /> : row.sku}
                                      </td>
                                      <td className={`${TD_CLASS} ${isChecked ? "opacity-50" : ""}`}>{row.productName}</td>
                                      <td className={`${TD_CLASS} whitespace-nowrap text-center text-base font-bold text-gray-900 dark:text-gray-100 ${isChecked ? "opacity-50" : ""}`}>x{row.quantity}</td>
                                    </tr>
                                  );
                                });
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
