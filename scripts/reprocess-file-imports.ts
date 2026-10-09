// One-off repair for Shopee and Lazada orders imported before the status and
// time fixes of 2026-10-08:
//   - Shopee "จัดส่งสำเร็จแล้ว", "การจัดส่ง" and "ผู้ซื้อได้รับสินค้าแล้ว ..."
//     fell through to PROBLEM;
//   - Lazada "confirmed" (buyer confirmed receipt) mapped to PENDING_SHIPMENT;
//   - Lazada's updateTime / deliveredDate were never read, so printedAt fell
//     back to the import time.
//
// Statuses a person set by hand are never overwritten.
//
// Every order's stored rawPayload rows are fed back through the current file
// parser — the same code a fresh upload uses — so nothing here re-implements
// the rules. Only orders whose status or printedAt would change are written,
// through upsertOrder, so status history and Problem Center tickets follow
// along exactly as they would on a re-import.
//
//   npx tsx scripts/reprocess-file-imports.ts            dry run
//   npx tsx scripts/reprocess-file-imports.ts --apply    write (backs up first)
//   ... --only <order no>,<order no>                     just those orders
import Module from "node:module";
import { writeFileSync } from "node:fs";

// The parsers and sync.ts are guarded with "server-only", which throws
// outside Next. Nothing here runs in a browser, so the guard is stubbed.
const originalLoad = (Module as unknown as { _load: (...a: unknown[]) => unknown })._load;
(Module as unknown as { _load: (...a: unknown[]) => unknown })._load = (request: unknown, ...rest: unknown[]) =>
  request === "server-only" ? {} : originalLoad(request, ...rest);

const APPLY = process.argv.includes("--apply");
// --only 261007198V2BNG,1130361758760271 limits the run to those order numbers.
const onlyArg = process.argv[process.argv.indexOf("--only") + 1];
const ONLY = process.argv.includes("--only") && onlyArg ? new Set(onlyArg.split(",").map((s) => s.trim())) : null;

async function main() {
  const XLSX = await import("xlsx");
  const { Platform } = await import("@prisma/client");
  const { prisma } = await import("../src/lib/db");
  const { upsertOrder } = await import("../src/lib/sync");
  const { printedAtFor } = await import("../src/lib/printedAt");
  const { parseShopeeExport } = await import("../src/lib/platforms/shopeeImport");
  const { parseLazadaExport } = await import("../src/lib/platforms/lazadaImport");

  const rows = await prisma.order.findMany({
    where: {
      platform: { in: [Platform.SHOPEE, Platform.LAZADA] },
      ...(ONLY ? { platformOrderId: { in: [...ONLY] } } : {}),
    },
    select: { id: true, platform: true, platformOrderId: true, shopName: true, status: true, printedAt: true, createdAt: true, rawPayload: true },
  });

  // Orders whose status a person changed by hand (orderActions.ts writes this
  // note). Their status is left exactly as set: on 2026-09-10 an admin marked
  // several Lazada orders delivered whose stored export still says
  // "canceled", and replaying the file would silently undo that decision.
  const manual = new Set(
    (
      await prisma.orderStatusHistory.findMany({
        where: { note: { startsWith: "เปลี่ยนสถานะด้วยมือ" }, order: { platform: { in: [Platform.SHOPEE, Platform.LAZADA] } } },
        select: { orderId: true },
      })
    ).map((h) => h.orderId),
  );

  const changes: { id: string; platformOrderId: string; platform: string; from: { status: string; printedAt: Date | null }; to: { status: string; printedAt: Date | null } }[] = [];
  const toUpsert: { normalized: unknown; printedAt: Date | null; id: string }[] = [];

  for (const row of rows) {
    if (!Array.isArray(row.rawPayload) || row.rawPayload.length === 0 || !row.shopName) continue;
    const sheet = XLSX.utils.json_to_sheet(row.rawPayload as Record<string, unknown>[]);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "orders");
    const buffer = XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;

    const parsed = row.platform === Platform.SHOPEE ? parseShopeeExport(buffer, row.shopName) : parseLazadaExport(buffer, row.shopName);
    const normalized = parsed.orders.find((o) => o.platformOrderId === row.platformOrderId);
    if (!normalized) continue;
    if (manual.has(row.id)) normalized.status = row.status;

    // Replayed as if first seen at createdAt — what the fixed code would
    // have written then. Leaves a row alone when the rules say "unchanged".
    const replayed = printedAtFor(normalized, null, row.createdAt);
    const printedAt = replayed === undefined ? row.printedAt : replayed;

    if (normalized.status !== row.status || printedAt?.getTime() !== row.printedAt?.getTime()) {
      changes.push({
        id: row.id,
        platformOrderId: row.platformOrderId,
        platform: row.platform,
        from: { status: row.status, printedAt: row.printedAt },
        to: { status: normalized.status, printedAt },
      });
      toUpsert.push({ normalized, printedAt, id: row.id });
    }
  }

  const summary = new Map<string, number>();
  for (const c of changes) {
    const key = `${c.platform} ${c.from.status} → ${c.to.status}${c.from.printedAt?.getTime() !== c.to.printedAt?.getTime() ? " (+printedAt)" : ""}`;
    summary.set(key, (summary.get(key) ?? 0) + 1);
  }
  console.log(`ออเดอร์ Shopee/Lazada ${rows.length} — ต้องแก้ ${changes.length}`);
  for (const [k, n] of [...summary].sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${n}`);

  if (!APPLY) {
    console.log("\n(dry run — ใส่ --apply เพื่อเขียนจริง)");
    await prisma.$disconnect();
    return;
  }

  const backup = `reprocess-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(backup, JSON.stringify(changes.map(({ id, platformOrderId, from }) => ({ id, platformOrderId, ...from }))));
  console.log(`\nสำรองค่าเดิมไว้ที่ ${backup}`);

  let done = 0;
  for (const { normalized, printedAt, id } of toUpsert) {
    await upsertOrder(normalized as Parameters<typeof upsertOrder>[0]);
    // upsertOrder keeps an existing printedAt unless the platform supplied a
    // label time, so the replayed value is set explicitly afterwards.
    await prisma.order.update({ where: { id }, data: { printedAt } });
    if (++done % 25 === 0) console.log(`  ${done} / ${toUpsert.length}`);
  }
  console.log(`เสร็จ ${done} รายการ`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
