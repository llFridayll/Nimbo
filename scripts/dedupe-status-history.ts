// One-off cleanup of OrderStatusHistory rows that repeat the status of the
// row before them.
//
// Until 2026-10-12, upsertOrder (src/lib/sync.ts) wrote the platform's status
// first and flipped the order to PROBLEM afterwards, so every sync of a
// flagged order logged the platform status again; new orders also got a
// second row on top of the one created at their orderDate. Measured that day:
// 9,281 of 18,572 rows were such repeats.
//
// Keeps the first row of every run of the same status, and any row with a
// note (manual changes write "เปลี่ยนสถานะด้วยมือ…" there).
//
//   npx tsx scripts/dedupe-status-history.ts            dry run: counts only
//   npx tsx scripts/dedupe-status-history.ts --apply    delete (backs up first)
//
// Safe to re-run. The backup file holds every deleted row in full.
import { writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const CHUNK = 500;

type Row = {
  id: string;
  orderId: string;
  status: string;
  note: string | null;
  occurredAt: Date;
  createdAt: Date;
};

async function main() {
  const repeats = await prisma.$queryRaw<Row[]>`
    SELECT id, "orderId", status::text AS status, note, "occurredAt", "createdAt"
    FROM (
      SELECT *, lag(status) OVER (PARTITION BY "orderId" ORDER BY "occurredAt", "createdAt", id) AS prev
      FROM "OrderStatusHistory"
    ) t
    WHERE prev = status AND note IS NULL`;

  const orders = new Set(repeats.map((r) => r.orderId)).size;
  console.log(`rows to delete: ${repeats.length} across ${orders} orders`);
  if (!APPLY || repeats.length === 0) {
    if (!APPLY) console.log("dry run — pass --apply to delete");
    return;
  }

  const file = `statusHistory-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(file, JSON.stringify(repeats, null, 1));
  console.log(`backup: ${file}`);

  let deleted = 0;
  for (let i = 0; i < repeats.length; i += CHUNK) {
    const ids = repeats.slice(i, i + CHUNK).map((r) => r.id);
    deleted += (await prisma.orderStatusHistory.deleteMany({ where: { id: { in: ids } } })).count;
  }
  console.log(`deleted: ${deleted}`);
}

main().finally(() => prisma.$disconnect());
