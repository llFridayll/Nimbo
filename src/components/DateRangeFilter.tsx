"use client";

import { useEffect, useRef, useState } from "react";

const PRESET_DAYS = ["today", "7", "14", "30", "90", "all"];
const QUICK_DAYS: { value: string; label: string }[] = [
  { value: "today", label: "วันนี้" },
  { value: "7", label: "7 วันที่ผ่านมา" },
  { value: "30", label: "30 วันที่ผ่านมา" },
  { value: "all", label: "ทั้งหมด" },
];
const MORE_DAYS: { value: string; label: string }[] = [
  { value: "14", label: "14 วันที่ผ่านมา" },
  { value: "90", label: "90 วันที่ผ่านมา" },
];

function daysAgoDate(daysBack: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - daysBack);
  return d;
}

function formatShort(d: Date): string {
  return d.toLocaleDateString("en-US");
}

/** Formats a Date as YYYY-MM-DD using its local calendar date — NOT
 * `toISOString().slice(0, 10)`, which converts to UTC first and silently
 * shifts the date back a day for any positive UTC offset (e.g. Bangkok,
 * UTC+7): local midnight July 1st becomes June 30th 17:00 UTC. Every Date
 * here is built with the local-time constructor (`new Date(y, m, d)`), so
 * reading its local components back out is the correct inverse. */
function toISODate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Start-of-range date for the current `days` preset, as a real Date (used to
 * seed the calendar popover's inputs when no custom range is picked yet). */
function rangeStartDate(daysParam: string): Date {
  if (daysParam === "today") return daysAgoDate(0);
  if (daysParam === "all") return daysAgoDate(365);
  const n = Number(daysParam);
  return daysAgoDate(Number.isFinite(n) && n > 0 ? n - 1 : 0);
}

function parseISODate(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

const THAI_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

/** If from/to exactly cover one calendar month, returns a "เดือน ปี" label
 * for the "..." button — purely cosmetic, so picking a month via the
 * dropdown below reads back naturally instead of showing raw dates. */
function fullMonthLabel(from: string, to: string): string | null {
  if (!from || !to) return null;
  const f = parseISODate(from);
  if (f.getDate() !== 1) return null;
  const lastOfMonth = new Date(f.getFullYear(), f.getMonth() + 1, 0);
  if (to !== toISODate(lastOfMonth)) return null;
  return `${THAI_MONTHS[f.getMonth()]} ${f.getFullYear()}`;
}

/** Same as fullMonthLabel but returns the raw {month, year} parts (for
 * seeding the month/year selects) instead of a display string. */
function parseFullMonth(from: string, to: string): { month: string; year: string } | null {
  if (!from || !to) return null;
  const f = parseISODate(from);
  if (f.getDate() !== 1) return null;
  const lastOfMonth = new Date(f.getFullYear(), f.getMonth() + 1, 0);
  if (to !== toISODate(lastOfMonth)) return null;
  return { month: String(f.getMonth() + 1).padStart(2, "0"), year: String(f.getFullYear()) };
}

/** Same idea as fullMonthLabel but for a full calendar year. */
function fullYearLabel(from: string, to: string): string | null {
  if (!from || !to) return null;
  const f = parseISODate(from);
  if (f.getMonth() !== 0 || f.getDate() !== 1) return null;
  if (to !== `${f.getFullYear()}-12-31`) return null;
  return `ปี ${f.getFullYear()}`;
}

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - i);

/** Date-range control shared by any page that filters by a time window: a
 * clickable "from - to" readout that opens a calendar popover for a custom
 * range, plus quick preset buttons (today / 7d / 30d) and a "..." dropdown
 * for the rest (14d / 90d / all / a typed custom day count). Purely
 * presentational — the caller owns where `days`/`from`/`to` live (URL
 * params, component state, etc.) and gets every change via `onChange`. */
export function DateRangeFilter({
  days,
  from,
  to,
  onChange,
}: {
  days: string;
  from: string;
  to: string;
  onChange: (next: { days: string; from: string; to: string }) => void;
}) {
  const isCustomDays = !PRESET_DAYS.includes(days);
  const [customDays, setCustomDays] = useState(isCustomDays ? days : "");
  const isFirstCustomDaysRender = useRef(true);
  const isCustomRange = Boolean(from || to);

  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  const [rangeOpen, setRangeOpen] = useState(false);
  const rangeRef = useRef<HTMLDivElement>(null);
  const [rangeStart, setRangeStart] = useState(from || toISODate(rangeStartDate(days)));
  const [rangeEnd, setRangeEnd] = useState(to || toISODate(new Date()));

  const [monthPart, setMonthPart] = useState("");
  const [yearPart, setYearPart] = useState("");
  const [yearValue, setYearValue] = useState("");

  /** Applies the month filter once both the month and year selects have a
   * value — letting either one change independently (e.g. keep the month,
   * switch the year) instead of requiring both to be re-picked together. */
  function applyMonthParts(month: string, year: string) {
    setMonthPart(month);
    setYearPart(year);
    if (!month || !year) return;
    const y = Number(year);
    const m = Number(month);
    const first = new Date(y, m - 1, 1);
    const last = new Date(y, m, 0);
    setCustomDays("");
    onChange({ days: "", from: toISODate(first), to: toISODate(last) });
    setMoreOpen(false);
  }

  function applyYear(value: string) {
    setYearValue(value);
    if (!value) return;
    const y = Number(value);
    setCustomDays("");
    onChange({ days: "", from: `${y}-01-01`, to: `${y}-12-31` });
    setMoreOpen(false);
  }

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
      if (rangeRef.current && !rangeRef.current.contains(e.target as Node)) setRangeOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    if (isFirstCustomDaysRender.current) {
      isFirstCustomDaysRender.current = false;
      return;
    }
    const n = Number(customDays);
    if (!customDays || !Number.isFinite(n) || n <= 0) return;
    const timer = setTimeout(() => {
      onChange({ days: String(Math.trunc(n)), from: "", to: "" });
    }, 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customDays]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div ref={rangeRef} className="relative">
        <button
          type="button"
          onClick={() => {
            setRangeStart(from || toISODate(rangeStartDate(days)));
            setRangeEnd(to || toISODate(new Date()));
            setRangeOpen((v) => !v);
          }}
          className="flex items-center gap-1.5 rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          <span>{formatShort(isCustomRange && from ? new Date(`${from}T00:00:00`) : rangeStartDate(days))}</span>
          <span className="text-gray-300">-</span>
          <span>{formatShort(isCustomRange && to ? new Date(`${to}T00:00:00`) : new Date())}</span>
          <svg className="h-4 w-4 text-gray-400 dark:text-gray-500" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="3" y="4" width="14" height="13" rx="2" stroke="currentColor" strokeWidth="1.5" />
            <path d="M3 8h14M6 2v4M14 2v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
        {rangeOpen && (
          <div className="absolute left-0 z-10 mt-1 w-64 max-w-[calc(100vw-2rem)] rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 shadow-lg">
            <label className="flex items-center justify-between gap-2 text-sm text-gray-600 dark:text-gray-400">
              จากวันที่
              <input
                type="date"
                value={rangeStart}
                max={rangeEnd}
                onChange={(e) => setRangeStart(e.target.value)}
                onClick={(e) => e.currentTarget.showPicker?.()}
                suppressHydrationWarning
                className="cursor-pointer rounded border border-gray-300 dark:border-gray-600 px-2 py-1 text-sm text-gray-900 dark:text-gray-100 focus:outline-none"
              />
            </label>
            <label className="mt-2 flex items-center justify-between gap-2 text-sm text-gray-600 dark:text-gray-400">
              ถึงวันที่
              <input
                type="date"
                value={rangeEnd}
                min={rangeStart}
                onChange={(e) => setRangeEnd(e.target.value)}
                onClick={(e) => e.currentTarget.showPicker?.()}
                suppressHydrationWarning
                className="cursor-pointer rounded border border-gray-300 dark:border-gray-600 px-2 py-1 text-sm text-gray-900 dark:text-gray-100 focus:outline-none"
              />
            </label>
            <button
              type="button"
              onClick={() => {
                setCustomDays("");
                onChange({ days: "", from: rangeStart, to: rangeEnd });
                setRangeOpen(false);
              }}
              className="mt-3 w-full rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary-hover"
            >
              ใช้ช่วงวันที่นี้
            </button>
          </div>
        )}
      </div>

      <div className="flex overflow-hidden rounded-md border border-gray-300 dark:border-gray-600">
        {QUICK_DAYS.map((d) => {
          const active = !isCustomDays && !isCustomRange && days === d.value;
          return (
            <button
              key={d.value}
              type="button"
              onClick={() => {
                setCustomDays("");
                onChange({ days: d.value, from: "", to: "" });
              }}
              className={`whitespace-nowrap border-l border-gray-300 dark:border-gray-600 px-3 py-2 text-sm first:border-l-0 ${
                active ? "bg-primary font-medium text-white" : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
              }`}
            >
              {d.label}
            </button>
          );
        })}
      </div>

      <div ref={moreRef} className="relative">
        <button
          type="button"
          onClick={() => {
            const seeded = parseFullMonth(from, to);
            setMonthPart(seeded?.month ?? "");
            setYearPart(seeded?.year ?? "");
            setMoreOpen((v) => !v);
          }}
          className={`rounded-md border px-3 py-2 text-sm ${
            !isCustomRange && (isCustomDays || MORE_DAYS.some((d) => d.value === days))
              ? "border-primary bg-primary font-medium text-white"
              : "border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
          }`}
        >
          {isCustomRange
            ? (fullMonthLabel(from, to) ?? fullYearLabel(from, to) ?? "กำหนดเอง")
            : isCustomDays
              ? `กำหนดเอง (${days} วัน)`
              : (MORE_DAYS.find((d) => d.value === days)?.label ?? "กำหนดเอง")}
        </button>
        {moreOpen && (
          <div className="absolute right-0 z-10 mt-1 w-64 max-w-[calc(100vw-2rem)] rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-1 shadow-lg">
            {MORE_DAYS.map((d) => (
              <button
                key={d.value}
                type="button"
                onClick={() => {
                  setCustomDays("");
                  onChange({ days: d.value, from: "", to: "" });
                  setMoreOpen(false);
                }}
                className={`block w-full rounded px-3 py-2 text-left text-sm ${
                  !isCustomDays && !isCustomRange && days === d.value ? "bg-gray-100 dark:bg-gray-700 font-medium text-gray-900 dark:text-gray-100" : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                }`}
              >
                {d.label}
              </button>
            ))}
            <div className="mt-1 space-y-3 border-t border-gray-100 dark:border-gray-800 p-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">กำหนดเอง</p>
              <label className="block text-sm text-gray-600 dark:text-gray-400">
                ย้อนหลังกี่วัน
                <input
                  type="number"
                  min={1}
                  value={customDays}
                  onChange={(e) => setCustomDays(e.target.value)}
                  placeholder="ระบุ"
                  suppressHydrationWarning
                  className="mt-1 w-full rounded border border-gray-300 dark:border-gray-600 px-2 py-1.5 text-sm text-gray-900 dark:text-gray-100 focus:outline-none"
                />
              </label>
              <label className="block text-sm text-gray-600 dark:text-gray-400">
                เลือกเดือน
                <div className="mt-1 grid grid-cols-2 gap-2">
                  <select
                    value={monthPart}
                    onChange={(e) => applyMonthParts(e.target.value, yearPart)}
                    className={`rounded border border-gray-300 dark:border-gray-600 px-2 py-1.5 text-sm focus:outline-none ${
                      monthPart ? "text-gray-900 dark:text-gray-100" : "text-gray-400 dark:text-gray-500"
                    }`}
                  >
                    <option value="" className="text-gray-400 dark:text-gray-500">
                      เดือน
                    </option>
                    {THAI_MONTHS.map((label, i) => (
                      <option key={label} value={String(i + 1).padStart(2, "0")}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <select
                    value={yearPart}
                    onChange={(e) => applyMonthParts(monthPart, e.target.value)}
                    className={`rounded border border-gray-300 dark:border-gray-600 px-2 py-1.5 text-sm focus:outline-none ${
                      yearPart ? "text-gray-900 dark:text-gray-100" : "text-gray-400 dark:text-gray-500"
                    }`}
                  >
                    <option value="" className="text-gray-400 dark:text-gray-500">
                      ปี
                    </option>
                    {YEAR_OPTIONS.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>
              </label>
              <label className="block text-sm text-gray-600 dark:text-gray-400">
                เลือกปี
                <select
                  value={yearValue}
                  onChange={(e) => applyYear(e.target.value)}
                  className={`mt-1 w-full rounded border border-gray-300 dark:border-gray-600 px-2 py-1.5 text-sm focus:outline-none ${
                    yearValue ? "text-gray-900 dark:text-gray-100" : "text-gray-400 dark:text-gray-500"
                  }`}
                >
                  <option value="" className="text-gray-400 dark:text-gray-500">
                    ปี
                  </option>
                  {YEAR_OPTIONS.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
