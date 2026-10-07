// One-off backfill of Order.printedAt under the "the day the tracking number
// arrives is the day it ships" rule (src/lib/printedAt.ts).
//
// Until 2026-10-03, any order first seen already carrying a tracking number
// was stamped with its ORDER date, which is how most orders arrive (the
// 10-day sync lookback, and every file import). Measured that day: 70.8% of
// TikTok orders sat in a different 14:00 cutoff window from the one their
// label was actually created in.
//
// Each row is replayed through printedAtFor() as if it were being inserted at
// its own createdAt — the moment this system first saw it — so the result is
// exactly what the fixed code would have written at the time.
//
//   npx tsx scripts/backfill-printed-at.ts            dry run: counts only
//   npx tsx scripts/backfill-printed-at.ts --apply    write (backs up first)
//
// Safe to re-run. The backup file holds every changed row's previous value.
import { writeFileSync } from "node:fs";
import { OrderStatus, Platform, PrismaClient } from "@prisma/client";
import { printedAtFor } from "../src/lib/printedAt";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const CHUNK = 500;

type Row = {
  id: string;
  platform: Platform;
  status: OrderStatus;
  orderDate: Date;
  createdAt: Date;
  trackingNumber: string | null;
  printedAt: Date | null;
  rawPayload: unknown;
};

function first(payload: unknown): Record<string, unknown> | null {
  const row = Array.isArray(payload) ? payload[0] : payload;
  return row && typeof row === "object" ? (row as Record<string, unknown>) : null;
}

function bangkok(value: unknown): Date | undefined {
  const s = typeof value === "string" ? value.trim() : "";
  if (!s || s === "-") return undefined;
  const d = new Date(`${s.replace(" ", "T")}+07:00`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function sourceTimes(row: Row): { labelCreatedAt?: Date; shippedAt?: Date } {
  const raw = first(row.rawPayload);
  if (!raw) return {};
  if (row.platform === Platform.TIKTOK) {
    const rts = Number(raw.rts_time);
    return rts > 0 ? { labelCreatedAt: new Date(rts * 1000) } : {};
  }
  if (row.platform === Platform.SHOPEE) return { shippedAt: bangkok(raw["เวลาส่งสินค้า"]) };
  return {};
}

async function main() {
  const rows = (await prisma.order.findMany({
    where: { trackingNumber: { not: null } },
    select: { id: true, platform: true, status: true, orderDate: true, createdAt: true, trackingNumber: true, printedAt: true, rawPayload: true },
  })) as Row[];

  const changes: { id: string; platform: Platform; from: Date | null; to: Date }[] = [];
  for (const row of rows) {
    const next = printedAtFor({ ...row, ...sourceTimes(row) }, null, row.createdAt);
    if (next instanceof Date && next.getTime() !== row.printedAt?.getTime()) {
      changes.push({ id: row.id, platform: row.platform, from: row.printedAt, to: next });
    }
  }

  const perPlatform = new Map<Platform, number>();
  for (const c of changes) perPlatform.set(c.platform, (perPlatform.get(c.platform) ?? 0) + 1);
  console.log(`ออเดอร์ที่มีเลขพัสดุ ${rows.length} — ต้องแก้ ${changes.length}`);
  for (const [platform, n] of perPlatform) console.log(`  ${platform}: ${n}`);

  if (!APPLY) {
    console.log("\n(dry run — ใส่ --apply เพื่อเขียนจริง)");
    return;
  }

  const backup = `printedAt-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(backup, JSON.stringify(changes.map(({ id, from }) => ({ id, printedAt: from }))));
  console.log(`\nสำรองค่าเดิมไว้ที่ ${backup}`);

  // One UPDATE per chunk instead of one per row: thousands of single-row
  // round trips to the Singapore database would take minutes.
  for (let i = 0; i < changes.length; i += CHUNK) {
    const chunk = changes.slice(i, i + CHUNK);
    const values = chunk.map((_, j) => `($${j * 2 + 1}, $${j * 2 + 2}::timestamp)`).join(", ");
    const params = chunk.flatMap((c) => [c.id, c.to.toISOString().replace("T", " ").replace("Z", "")]);
    await prisma.$executeRawUnsafe(
      `UPDATE "Order" o SET "printedAt" = v.p FROM (VALUES ${values}) AS v(id, p) WHERE o.id = v.id`,
      ...params,
    );
    console.log(`  เขียนแล้ว ${Math.min(i + CHUNK, changes.length)} / ${changes.length}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
