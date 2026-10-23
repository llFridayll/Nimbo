import "server-only";
import { OrderStatus, Prisma, StockMovementType } from "@prisma/client";
import { prisma } from "./db";
import { currentShippingCutoffWindow } from "./dateUtils";
import { NEEDS_SHIPPING_STATUSES, shippingWindowWhere } from "./shippingSummary";
import { getSkuAliasMap, resolveDisplaySku } from "./skuAlias";

/** Statuses whose goods came back to (or never left) the shelf. An order
 * that reaches one of these after its stock was taken gets it put back. */
const NO_STOCK_STATUSES: OrderStatus[] = [OrderStatus.CANCELLED, OrderStatus.RETURNED];

type Tx = Prisma.TransactionClient;

// The 5-minute sync upserts hundreds of orders; until the warehouse has any
// stock items there is nothing to reconcile, so don't spend two queries per
// order finding that out. Re-checked once a minute. Items, not mappings: an
// order whose SKU was just unmapped still has a deduction to hand back.
let mappingCheck: { at: number; any: boolean } | null = null;
async function stockTrackingEnabled(): Promise<boolean> {
  if (mappingCheck && Date.now() - mappingCheck.at < 60_000) return mappingCheck.any;
  const any = (await prisma.inventoryItem.count()) > 0;
  mappingCheck = { at: Date.now(), any };
  return any;
}
/** Call after mappings change so the next reconcile doesn't wait a minute. */
export function invalidateStockTrackingCheck() {
  mappingCheck = null;
}

/** Writes one movement and moves onHand by the same amount, in the caller's
 * transaction, so the two can never disagree. */
async function writeMovement(
  tx: Tx,
  data: {
    inventoryItemId: string;
    type: StockMovementType;
    quantity: number;
    orderId?: string | null;
    note?: string | null;
    fileName?: string | null;
    userId?: string | null;
  },
) {
  const item = await tx.inventoryItem.update({
    where: { id: data.inventoryItemId },
    data: { onHand: { increment: data.quantity } },
    select: { onHand: true },
  });
  await tx.stockMovement.create({ data: { ...data, balanceAfter: item.onHand } });
}

/** Brings one order's stock deduction in line with its current state.
 *
 * Stock leaves the shelf the moment the order gets its tracking number
 * (printedAt), and comes back if the order is later cancelled or returned.
 * Rather than react to individual events, this compares what the order
 * *should* have taken with what its movements say it took, and writes only
 * the difference — so it is safe to call after every sync, re-import or
 * manual change, any number of times. */
export async function reconcileOrderStock(orderId: string): Promise<void> {
  if (!(await stockTrackingEnabled())) return;
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, platformOrderId: true, status: true, printedAt: true, items: { select: { sku: true, quantity: true } } },
  });
  if (!order) return;

  const skus = [...new Set(order.items.map((i) => i.sku))];
  const [components, past] = await Promise.all([
    skus.length
      ? prisma.skuComponent.findMany({
          where: { rawSku: { in: skus } },
          select: { rawSku: true, quantity: true, inventoryItem: { select: { id: true, trackingFrom: true } } },
        })
      : Promise.resolve([]),
    prisma.stockMovement.groupBy({
      by: ["inventoryItemId"],
      where: { orderId: order.id, type: { in: [StockMovementType.SALE, StockMovementType.SALE_REVERSAL] } },
      _sum: { quantity: true },
    }),
  ]);

  const shouldTake = new Map<string, number>();
  const takes = order.printedAt !== null && !NO_STOCK_STATUSES.includes(order.status);
  for (const item of order.items) {
    for (const c of components) {
      if (c.rawSku !== item.sku) continue;
      // Labelled before this item's first stock figure: already not on the
      // shelf that figure describes.
      const counts = takes && order.printedAt! >= c.inventoryItem.trackingFrom;
      shouldTake.set(c.inventoryItem.id, (shouldTake.get(c.inventoryItem.id) ?? 0) + (counts ? item.quantity * c.quantity : 0));
    }
  }
  const taken = new Map(past.map((p) => [p.inventoryItemId, -(p._sum.quantity ?? 0)]));

  const itemIds = new Set([...shouldTake.keys(), ...taken.keys()]);
  const changes = [...itemIds]
    .map((id) => ({ id, diff: (shouldTake.get(id) ?? 0) - (taken.get(id) ?? 0) }))
    .filter((c) => Math.abs(c.diff) > 1e-9);
  if (changes.length === 0) return;

  await prisma.$transaction(async (tx) => {
    for (const c of changes) {
      await writeMovement(tx, {
        inventoryItemId: c.id,
        type: c.diff > 0 ? StockMovementType.SALE : StockMovementType.SALE_REVERSAL,
        quantity: -c.diff,
        orderId: order.id,
        note:
          c.diff > 0
            ? `ออเดอร์ #${order.platformOrderId} ได้เลขพัสดุ`
            : `ออเดอร์ #${order.platformOrderId} ${NO_STOCK_STATUSES.includes(order.status) ? "ยกเลิก/คืนสินค้า" : "ปรับจำนวน"}`,
      });
    }
  });
}

/** Re-runs reconcileOrderStock for every order that could touch the given
 * SKUs since stock tracking began — after a SKU's mapping changes, orders
 * already labelled today need their deduction recomputed. */
export async function reconcileOrdersForSkus(rawSkus: string[]): Promise<number> {
  if (rawSkus.length === 0) return 0;
  const earliest = await prisma.inventoryItem.aggregate({ _min: { trackingFrom: true } });
  const since = earliest._min.trackingFrom;
  if (!since) return 0;
  // Orders already holding a deduction are included even if labelled before
  // `since`, so removing a mapping can hand their stock back.
  const withMovements = await prisma.stockMovement.findMany({
    where: { orderId: { not: null } },
    distinct: ["orderId"],
    select: { orderId: true },
  });
  const orders = await prisma.order.findMany({
    where: {
      OR: [{ printedAt: { gte: since } }, { id: { in: withMovements.map((m) => m.orderId!) } }],
      items: { some: { sku: { in: rawSkus } } },
    },
    select: { id: true },
  });
  for (const o of orders) await reconcileOrderStock(o.id);
  return orders.length;
}

export interface StockFileRow {
  name: string;
  unit: string | null;
  quantity: number | null;
  unitCost: number | null;
  reorderPoint: number | null;
}

export interface StockFileResult {
  created: number;
  updated: number;
  moved: number;
  skipped: number;
}

/** Applies an uploaded stock sheet. "receive" adds each row's quantity;
 * "count" sets on-hand to it (the movement records the difference). Unknown
 * names become new items, which is how the first sheet sets everything up. */
export async function applyStockFile(
  rows: StockFileRow[],
  mode: "receive" | "count",
  ctx: { userId: string; fileName: string },
): Promise<StockFileResult> {
  const result: StockFileResult = { created: 0, updated: 0, moved: 0, skipped: 0 };
  await prisma.$transaction(
    async (tx) => {
      for (const row of rows) {
        let item = await tx.inventoryItem.findUnique({ where: { name: row.name } });
        let touched = false;
        if (!item) {
          item = await tx.inventoryItem.create({
            data: { name: row.name, unit: row.unit ?? "ชิ้น", unitCost: row.unitCost, reorderPoint: row.reorderPoint },
          });
          result.created++;
          touched = true;
        } else {
          const patch: Prisma.InventoryItemUpdateInput = {};
          if (row.unit) patch.unit = row.unit;
          if (row.unitCost !== null) patch.unitCost = row.unitCost;
          if (row.reorderPoint !== null) patch.reorderPoint = row.reorderPoint;
          if (Object.keys(patch).length > 0) {
            item = await tx.inventoryItem.update({ where: { id: item.id }, data: patch });
            result.updated++;
            touched = true;
          }
        }

        if (row.quantity === null) {
          if (!touched) result.skipped++;
          continue;
        }
        const delta = mode === "receive" ? row.quantity : row.quantity - item.onHand;
        if (Math.abs(delta) < 1e-9 && mode === "receive") continue;
        await writeMovement(tx, {
          inventoryItemId: item.id,
          type: mode === "receive" ? StockMovementType.RECEIVE : StockMovementType.COUNT,
          quantity: delta,
          note:
            mode === "receive"
              ? ctx.fileName
                ? "รับเข้าจากไฟล์"
                : "รับเข้า (กรอกในระบบ)"
              : `นับสต็อกได้ ${row.quantity.toLocaleString("th-TH")}`,
          fileName: ctx.fileName || null,
          userId: ctx.userId,
        });
        result.moved++;
      }
    },
    { timeout: 60_000 },
  );
  return result;
}

export type StockLevel = "out" | "low" | "ok" | "untracked";

export interface InventoryRow {
  id: string;
  name: string;
  unit: string;
  onHand: number;
  reorderPoint: number | null;
  unitCost: number | null;
  value: number | null;
  level: StockLevel;
  /** Still to be packed on today's list and not yet taken off the shelf. */
  neededToday: number;
  shortToday: number;
  skuCount: number;
}

export interface InventoryOverview {
  rows: InventoryRow[];
  totalValue: number;
  lowCount: number;
  shortTodayCount: number;
  /** Display names on today's packing list with no stock mapping at all. */
  unmappedToday: string[];
}

function levelOf(onHand: number, reorderPoint: number | null): StockLevel {
  if (onHand <= 0) return "out";
  if (reorderPoint !== null && onHand <= reorderPoint) return "low";
  return "ok";
}

export async function getInventoryOverview(now: Date = new Date()): Promise<InventoryOverview> {
  const window = currentShippingCutoffWindow(now);
  const [items, pendingItems, aliases] = await Promise.all([
    prisma.inventoryItem.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { components: true } } },
    }),
    // Lines on today's list that will still take stock when their tracking
    // number arrives. Lines that already have one were deducted then.
    prisma.orderItem.findMany({
      where: {
        order: { AND: [shippingWindowWhere(window, { now }), { status: { in: NEEDS_SHIPPING_STATUSES }, printedAt: null }] },
      },
      select: { sku: true, quantity: true },
    }),
    getSkuAliasMap(),
  ]);

  const skus = [...new Set(pendingItems.map((i) => i.sku))];
  const components = skus.length
    ? await prisma.skuComponent.findMany({ where: { rawSku: { in: skus } }, select: { rawSku: true, inventoryItemId: true, quantity: true } })
    : [];
  const need = new Map<string, number>();
  const unmapped = new Set<string>();
  for (const line of pendingItems) {
    const mine = components.filter((c) => c.rawSku === line.sku);
    if (mine.length === 0) unmapped.add(resolveDisplaySku(aliases, line.sku));
    for (const c of mine) need.set(c.inventoryItemId, (need.get(c.inventoryItemId) ?? 0) + line.quantity * c.quantity);
  }

  const rows: InventoryRow[] = items.map((it) => {
    const neededToday = need.get(it.id) ?? 0;
    return {
      id: it.id,
      name: it.name,
      unit: it.unit,
      onHand: it.onHand,
      reorderPoint: it.reorderPoint,
      unitCost: it.unitCost,
      value: it.unitCost !== null ? Math.max(0, it.onHand) * it.unitCost : null,
      level: it._count.components === 0 ? "untracked" : levelOf(it.onHand, it.reorderPoint),
      neededToday,
      shortToday: Math.max(0, neededToday - Math.max(0, it.onHand)),
      skuCount: it._count.components,
    };
  });

  return {
    rows,
    totalValue: rows.reduce((s, r) => s + (r.value ?? 0), 0),
    lowCount: rows.filter((r) => r.level === "low" || r.level === "out").length,
    shortTodayCount: rows.filter((r) => r.shortToday > 0).length,
    unmappedToday: [...unmapped].sort((a, b) => a.localeCompare(b, "th")),
  };
}

/** Items short for today's packing list — shown as a warning there. */
export async function getTodayShortages(now: Date = new Date()) {
  const o = await getInventoryOverview(now);
  return o.rows.filter((r) => r.shortToday > 0);
}

export interface SkuMappingGroup {
  displaySku: string;
  rawSkus: string[];
  productName: string;
  soldQuantity: number;
  components: { inventoryItemId: string; name: string; unit: string; quantity: number }[];
}

/** Every product sold in the last 180 days, grouped by its packing-list
 * name (so the Shopee and TikTok SKUs for one product are set up together),
 * with its current stock mapping. */
export async function listSkuMappings(): Promise<SkuMappingGroup[]> {
  const [sold, aliases, components] = await Promise.all([
    prisma.$queryRaw<{ sku: string; productName: string; qty: number }[]>`
      SELECT i."sku", MAX(i."productName") AS "productName", SUM(i."quantity")::int AS qty
      FROM "OrderItem" i JOIN "Order" o ON o."id" = i."orderId"
      WHERE o."orderDate" > now() - interval '180 days' AND i."sku" <> ''
      GROUP BY i."sku"`,
    getSkuAliasMap(),
    prisma.skuComponent.findMany({ include: { inventoryItem: { select: { name: true, unit: true } } } }),
  ]);
  const groups = new Map<string, SkuMappingGroup>();
  for (const s of sold) {
    const display = resolveDisplaySku(aliases, s.sku);
    const g = groups.get(display) ?? { displaySku: display, rawSkus: [], productName: s.productName, soldQuantity: 0, components: [] };
    g.rawSkus.push(s.sku);
    g.soldQuantity += s.qty;
    groups.set(display, g);
  }
  for (const g of groups.values()) {
    // Every raw SKU in a group is saved with the same components, so the
    // first one that has any speaks for the group.
    const own = components.filter((c) => c.rawSku === g.rawSkus.find((r) => components.some((x) => x.rawSku === r)));
    g.components = own.map((c) => ({ inventoryItemId: c.inventoryItemId, name: c.inventoryItem.name, unit: c.inventoryItem.unit, quantity: c.quantity }));
  }
  return [...groups.values()].sort((a, b) => b.soldQuantity - a.soldQuantity);
}
