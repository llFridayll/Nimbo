// One-off backfill: fills buyerUsername with TikTok's opaque internal
// user_id (not a real username — TikTok doesn't expose one) from each
// order's already-stored rawPayload, for orders synced before this field
// was extracted.
import { PrismaClient, Platform } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const orders = await prisma.order.findMany({
    where: { platform: Platform.TIKTOK, buyerUsername: null, rawPayload: { not: undefined } },
    select: { id: true, rawPayload: true },
  });

  let updated = 0;
  for (const order of orders) {
    const raw = order.rawPayload as { user_id?: string | number } | null;
    if (raw?.user_id == null) continue;
    await prisma.order.update({ where: { id: order.id }, data: { buyerUsername: String(raw.user_id) } });
    updated++;
  }

  console.log(`Checked ${orders.length} orders, backfilled buyerUsername on ${updated}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
