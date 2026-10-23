"use server";

import { revalidatePath } from "next/cache";
import * as XLSX from "xlsx";
import { requireAdmin } from "./dal";
import { prisma } from "./db";
import { logActivity } from "./activityLog";
import { findHeader, text, type SheetRow } from "./platforms/cancellationImport";
import { applyStockFile, invalidateStockTrackingCheck, reconcileOrdersForSkus, type StockFileResult, type StockFileRow } from "./inventory";

const HEADERS = {
  name: ["ชื่อสินค้า", "สินค้า", "รายการ", "name", "product"],
  quantity: ["จำนวน", "จำนวนรับเข้า", "จำนวนนับได้", "คงเหลือ", "qty", "quantity"],
  unit: ["หน่วย", "unit"],
  unitCost: ["ต้นทุนต่อหน่วย", "ต้นทุน", "ราคาทุน", "cost"],
  reorderPoint: ["จุดสั่งซื้อ", "แจ้งเตือนเมื่อเหลือ", "ขั้นต่ำ", "reorder"],
  // Optional: set the SKU mapping in the same upload. SKUs are separated by
  // "|" because platform SKUs themselves contain commas ("SS 16-150-5,30 m.").
  skus: ["sku ที่ขาย", "sku"],
  perUnit: ["ตัดต่อชิ้นที่ขาย", "ตัดต่อชิ้น", "ต่อชิ้นที่ขาย"],
} as const;

function num(value: string): number | null {
  if (!value) return null;
  const n = Number(value.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

export interface InventoryImportState {
  error?: string;
  fileName?: string;
  mode?: "receive" | "count";
  result?: StockFileResult;
  rows?: number;
  /** Platform SKUs mapped to stock by this upload, and orders recomputed. */
  mappedSkus?: number;
  reconciled?: number;
  ignoredColumns?: string[];
}

export async function importStockFile(_prev: InventoryImportState, formData: FormData): Promise<InventoryImportState> {
  const user = await requireAdmin();
  const file = formData.get("file");
  const mode = formData.get("mode") === "count" ? "count" : "receive";
  if (!(file instanceof File) || file.size === 0) return { error: "เลือกไฟล์ก่อนครับ" };

  let sheetRows: SheetRow[];
  try {
    const wb = XLSX.read(Buffer.from(await file.arrayBuffer()));
    sheetRows = XLSX.utils.sheet_to_json<SheetRow>(wb.Sheets[wb.SheetNames[0]], { defval: "", raw: false });
  } catch {
    return { error: "เปิดไฟล์นี้ไม่ได้ ต้องเป็น .xlsx หรือ .csv", fileName: file.name };
  }
  const headers = Object.keys(sheetRows[0] ?? {});
  const col = {
    name: findHeader(headers, HEADERS.name),
    quantity: findHeader(headers, HEADERS.quantity),
    unit: findHeader(headers, HEADERS.unit),
    unitCost: findHeader(headers, HEADERS.unitCost),
    reorderPoint: findHeader(headers, HEADERS.reorderPoint),
    skus: findHeader(headers, HEADERS.skus),
    perUnit: findHeader(headers, HEADERS.perUnit),
  };
  if (!col.name) return { error: 'ไม่เจอคอลัมน์ "ชื่อสินค้า" ในไฟล์', fileName: file.name, ignoredColumns: headers };
  if (!col.quantity && !col.unitCost && !col.reorderPoint && !col.skus) {
    return { error: 'ไม่เจอคอลัมน์ "จำนวน" ในไฟล์', fileName: file.name, ignoredColumns: headers };
  }

  const rows: StockFileRow[] = [];
  // rawSku → what it takes off the shelf; a SKU listed on two rows is a
  // bundle and takes from both.
  const mapping = new Map<string, { name: string; quantity: number }[]>();
  for (const r of sheetRows) {
    const name = text(r, col.name).replace(/\s+/g, " ").trim();
    if (!name) continue;
    const perUnit = num(text(r, col.perUnit)) ?? 1;
    for (const sku of text(r, col.skus).split("|").map((s) => s.trim()).filter(Boolean)) {
      mapping.set(sku, [...(mapping.get(sku) ?? []), { name, quantity: perUnit }]);
    }
    rows.push({
      name,
      unit: text(r, col.unit) || null,
      quantity: num(text(r, col.quantity)),
      unitCost: num(text(r, col.unitCost)),
      reorderPoint: num(text(r, col.reorderPoint)),
    });
  }
  if (rows.length === 0) return { error: "ไม่มีแถวที่มีชื่อสินค้า", fileName: file.name };

  const result = await applyStockFile(rows, mode, { userId: user.id, fileName: file.name });

  let reconciled = 0;
  if (mapping.size > 0) {
    const items = new Map(
      (await prisma.inventoryItem.findMany({ where: { name: { in: rows.map((r) => r.name) } }, select: { id: true, name: true } })).map((i) => [i.name, i.id]),
    );
    const skus = [...mapping.keys()];
    await prisma.$transaction([
      prisma.skuComponent.deleteMany({ where: { rawSku: { in: skus } } }),
      prisma.skuComponent.createMany({
        data: skus.flatMap((rawSku) =>
          mapping.get(rawSku)!.flatMap((c) => (items.has(c.name) && c.quantity > 0 ? [{ rawSku, inventoryItemId: items.get(c.name)!, quantity: c.quantity }] : [])),
        ),
        skipDuplicates: true,
      }),
    ]);
    invalidateStockTrackingCheck();
    reconciled = await reconcileOrdersForSkus(skus);
  }
  await logActivity({
    userId: user.id,
    username: user.username,
    action: "INVENTORY_IMPORT",
    detail: `${mode === "receive" ? "รับเข้า" : "นับสต็อก"} ${result.moved} รายการ (สร้างใหม่ ${result.created}) จาก ${file.name}`,
  });
  revalidatePath("/inventory");
  revalidatePath("/inventory/mapping");
  const used = Object.values(col).filter(Boolean) as string[];
  return {
    fileName: file.name,
    mode,
    result,
    rows: rows.length,
    mappedSkus: mapping.size,
    reconciled,
    ignoredColumns: headers.filter((h) => !used.includes(h)),
  };
}

/** Saves which stock items one product (all its platform SKUs together)
 * takes off the shelf, then recomputes deductions for orders already
 * labelled since tracking began. */
export async function setSkuComponents(
  rawSkus: string[],
  components: { inventoryItemId: string; quantity: number }[],
): Promise<{ error?: string; reconciled?: number }> {
  const user = await requireAdmin();
  if (rawSkus.length === 0) return { error: "ไม่มี SKU" };
  const clean = components.filter((c) => c.inventoryItemId && Number.isFinite(c.quantity) && c.quantity > 0);
  if (new Set(clean.map((c) => c.inventoryItemId)).size !== clean.length) return { error: "เลือกสินค้าในคลังซ้ำกัน" };

  await prisma.$transaction([
    prisma.skuComponent.deleteMany({ where: { rawSku: { in: rawSkus } } }),
    prisma.skuComponent.createMany({
      data: rawSkus.flatMap((rawSku) => clean.map((c) => ({ rawSku, inventoryItemId: c.inventoryItemId, quantity: c.quantity }))),
    }),
  ]);
  invalidateStockTrackingCheck();
  const reconciled = await reconcileOrdersForSkus(rawSkus);
  await logActivity({
    userId: user.id,
    username: user.username,
    action: "INVENTORY_MAPPING_UPDATE",
    detail: `${rawSkus.join(", ")} → ${clean.length === 0 ? "ไม่ตัดสต็อก" : `${clean.length} รายการในคลัง`}`,
  });
  revalidatePath("/inventory");
  revalidatePath("/inventory/mapping");
  return { reconciled };
}

/** One-click setup: every product whose packing-list name is exactly the
 * name of a stock item gets mapped 1:1, for products not mapped yet. */
export async function autoMapByName(): Promise<{ mapped: number }> {
  await requireAdmin();
  const { listSkuMappings } = await import("./inventory");
  const [groups, items] = await Promise.all([listSkuMappings(), prisma.inventoryItem.findMany({ select: { id: true, name: true } })]);
  const byName = new Map(items.map((i) => [i.name, i.id]));
  let mapped = 0;
  for (const g of groups) {
    const id = byName.get(g.displaySku);
    if (!id || g.components.length > 0) continue;
    await setSkuComponents(g.rawSkus, [{ inventoryItemId: id, quantity: 1 }]);
    mapped++;
  }
  return { mapped };
}

export async function updateInventoryItem(
  id: string,
  fields: { unit: string; reorderPoint: string; unitCost: string },
): Promise<{ error?: string }> {
  await requireAdmin();
  const reorderPoint = fields.reorderPoint.trim() === "" ? null : num(fields.reorderPoint.trim());
  const unitCost = fields.unitCost.trim() === "" ? null : num(fields.unitCost.trim());
  if (fields.reorderPoint.trim() !== "" && reorderPoint === null) return { error: "จุดสั่งซื้อต้องเป็นตัวเลข" };
  if (fields.unitCost.trim() !== "" && unitCost === null) return { error: "ต้นทุนต้องเป็นตัวเลข" };
  await prisma.inventoryItem.update({
    where: { id },
    data: { unit: fields.unit.trim() || "ชิ้น", reorderPoint, unitCost },
  });
  revalidatePath("/inventory");
  return {};
}

export interface StockEntryState {
  error?: string;
  saved?: number;
  mode?: "receive" | "count";
}

/** The on-screen counterpart of the Excel import: one number per item typed
 * straight into /inventory/count. Blank rows are left alone. */
export async function submitStockEntries(_prev: StockEntryState, formData: FormData): Promise<StockEntryState> {
  const user = await requireAdmin();
  const mode = formData.get("mode") === "count" ? "count" : "receive";
  const items = await prisma.inventoryItem.findMany({ select: { id: true, name: true } });
  const rows: StockFileRow[] = [];
  for (const item of items) {
    const raw = formData.get(`qty-${item.id}`);
    if (typeof raw !== "string" || raw.trim() === "") continue;
    const q = num(raw.trim());
    if (q === null) return { error: `"${item.name}" ต้องเป็นตัวเลข` };
    if (mode === "receive" && q <= 0) return { error: `"${item.name}" รับเข้าต้องมากกว่า 0` };
    if (q < 0) return { error: `"${item.name}" ติดลบไม่ได้` };
    rows.push({ name: item.name, unit: null, quantity: q, unitCost: null, reorderPoint: null });
  }
  if (rows.length === 0) return { error: "ยังไม่ได้กรอกจำนวนสักรายการ" };

  const result = await applyStockFile(rows, mode, { userId: user.id, fileName: "" });
  await logActivity({
    userId: user.id,
    username: user.username,
    action: "INVENTORY_IMPORT",
    detail: `${mode === "receive" ? "รับเข้า" : "นับสต็อก"} ${result.moved} รายการ (กรอกในระบบ)`,
  });
  revalidatePath("/inventory");
  revalidatePath("/inventory/count");
  return { saved: result.moved, mode };
}

export interface NewItemState {
  error?: string;
  createdName?: string;
}

export async function createInventoryItem(_prev: NewItemState, formData: FormData): Promise<NewItemState> {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").replace(/\s+/g, " ").trim();
  if (!name) return { error: "ใส่ชื่อสินค้าก่อนครับ" };
  if (await prisma.inventoryItem.findUnique({ where: { name }, select: { id: true } })) return { error: `มี "${name}" ในคลังแล้ว` };
  const unitCostRaw = String(formData.get("unitCost") ?? "").trim();
  const reorderRaw = String(formData.get("reorderPoint") ?? "").trim();
  const unitCost = unitCostRaw ? num(unitCostRaw) : null;
  const reorderPoint = reorderRaw ? num(reorderRaw) : null;
  if (unitCostRaw && unitCost === null) return { error: "ต้นทุนต้องเป็นตัวเลข" };
  if (reorderRaw && reorderPoint === null) return { error: "จุดสั่งซื้อต้องเป็นตัวเลข" };
  await prisma.inventoryItem.create({
    data: { name, unit: String(formData.get("unit") ?? "").trim() || "ชิ้น", unitCost, reorderPoint },
  });
  revalidatePath("/inventory");
  revalidatePath("/inventory/count");
  revalidatePath("/inventory/mapping");
  return { createdName: name };
}
