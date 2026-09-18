import { Platform } from "@prisma/client";
import { generateMockOrders } from "../src/lib/platforms/mockData";
import { upsertOrder } from "../src/lib/sync";
import { prisma } from "../src/lib/db";

async function main() {
  console.log("Seeding mock orders for TikTok Shop...");

  const tiktokOrders = generateMockOrders(Platform.TIKTOK, 20, 0);

  for (const order of tiktokOrders) {
    await upsertOrder(order);
  }

  console.log(`Seeded ${tiktokOrders.length} orders.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
