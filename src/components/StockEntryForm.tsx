"use client";

import { useActionState, useState } from "react";
import { submitStockEntries, type StockEntryState } from "@/lib/inventoryActions";

interface Item {
  id: string;
  name: string;
  unit: string;
  onHand: number;
}

/** Type a number next to each item: either what arrived (added on top) or
 * what was counted on the shelf (replaces the system figure). */
export function StockEntryForm({ items }: { items: Item[] }) {
  const [state, action, pending] = useActionState(submitStockEntries, {} as StockEntryState);
  const [mode, setMode] = useState<"receive" | "count">("count");
  const [filter, setFilter] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const fmt = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 2 });
  const filled = Object.values(values).filter((v) => v.trim() !== "").length;
  const q = filter.trim().toLowerCase();

  return (
    <form
      action={async (fd) => {
        await action(fd);
      }}
      className="space-y-4"
    >
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex gap-1 rounded-md border border-gray-300 p-0.5 text-sm dark:border-gray-600">
          {(
            [
              ["count", "นับสต็อก (ตั้งยอดใหม่)"],
              ["receive", "รับของเข้า (บวกเพิ่ม)"],
            ] as const
          ).map(([m, label]) => (
            <label key={m} className={`cursor-pointer rounded px-3 py-1 ${mode === m ? "bg-primary text-white" : "text-gray-600 dark:text-gray-300"}`}>
              <input type="radio" name="mode" value={m} checked={mode === m} onChange={() => setMode(m)} className="sr-only" />
              {label}
            </label>
          ))}
        </div>
        <input
          id="stock-filter"
          type="search"
          placeholder="ค้นหาสินค้า…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="min-w-0 flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
        />
        <button type="submit" disabled={pending || filled === 0} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
          {pending ? "กำลังบันทึก…" : `บันทึก ${filled} รายการ`}
        </button>
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-400">
        {mode === "count"
          ? "ใส่จำนวนที่นับได้จริงบนชั้น ระบบจะตั้งยอดคงเหลือเป็นตัวเลขนี้ และบันทึกส่วนต่างไว้ในประวัติ"
          : "ใส่จำนวนที่รับเข้ามา ระบบจะบวกเพิ่มจากยอดเดิม"}{" "}
        ช่องที่เว้นว่างจะไม่ถูกแตะ
      </p>

      {state.error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">{state.error}</p>
      )}
      {state.saved !== undefined && !state.error && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
          บันทึก{state.mode === "receive" ? "รับเข้า" : "ยอดนับ"} {state.saved} รายการแล้ว
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        <table className="w-full text-sm">
          <thead className="whitespace-nowrap bg-gray-50 text-left text-xs text-gray-500 dark:bg-gray-800/60 dark:text-gray-400">
            <tr>
              <th className="px-4 py-2 font-medium">สินค้าในคลัง</th>
              <th className="px-4 py-2 text-right font-medium">คงเหลือในระบบ</th>
              <th className="px-4 py-2 text-right font-medium">{mode === "count" ? "นับได้" : "รับเข้า"}</th>
              <th className="px-4 py-2 text-right font-medium">ยอดหลังบันทึก</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {items.map((it) => {
              const v = values[it.id] ?? "";
              const n = v.trim() === "" ? null : Number(v.replace(/,/g, ""));
              const after = n === null || !Number.isFinite(n) ? null : mode === "count" ? n : it.onHand + n;
              const hidden = q !== "" && !it.name.toLowerCase().includes(q);
              return (
                // Hidden rather than unmounted, so a typed value survives a search.
                <tr key={it.id} hidden={hidden}>
                  <td className="px-4 py-2 text-gray-900 dark:text-gray-100">{it.name}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums text-gray-500 dark:text-gray-400">
                    {fmt(it.onHand)} {it.unit}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <input
                      id={`qty-${it.id}`}
                      name={`qty-${it.id}`}
                      aria-label={`${mode === "count" ? "นับได้" : "รับเข้า"} ${it.name}`}
                      inputMode="decimal"
                      value={v}
                      onChange={(e) => setValues({ ...values, [it.id]: e.target.value })}
                      className="w-24 rounded border border-gray-300 bg-white px-2 py-1 text-right tabular-nums text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                    />
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">
                    {after === null ? (
                      <span className="text-gray-300 dark:text-gray-600">—</span>
                    ) : (
                      <span className={after !== it.onHand ? "font-semibold text-gray-900 dark:text-gray-100" : "text-gray-500"}>
                        {fmt(after)}
                        {after !== it.onHand && (
                          <span className={`ml-1 text-xs ${after > it.onHand ? "text-emerald-600" : "text-red-600"}`}>
                            ({after > it.onHand ? "+" : ""}
                            {fmt(after - it.onHand)})
                          </span>
                        )}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </form>
  );
}
