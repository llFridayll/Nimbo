// One-off backfill: existing TikTok orders already have their full raw API
// response saved in `rawPayload` (recipient_address.district_info included),
// so buyerRegion can be filled in for historical orders straight from data
// already in the DB — no need to re-sync from TikTok's API.
import { PrismaClient, Platform } from "@prisma/client";

const prisma = new PrismaClient();

interface DistrictInfo {
  address_level: string;
  address_name: string;
}

function extractBuyerRegion(districtInfo: DistrictInfo[] | undefined): string | undefined {
  if (!districtInfo?.length) return undefined;
  const province = districtInfo.find((d) => d.address_level === "L1")?.address_name;
  const district = districtInfo.find((d) => d.address_level === "L2")?.address_name;
  return [district, province].filter(Boolean).join(", ") || undefined;
}

async function main() {
  const orders = await prisma.order.findMany({
    where: { platform: Platform.TIKTOK, buyerRegion: null, rawPayload: { not: undefined } },
    select: { id: true, rawPayload: true },
  });

  let updated = 0;
  for (const order of orders) {
    const raw = order.rawPayload as { recipient_address?: { district_info?: DistrictInfo[] } } | null;
    const region = extractBuyerRegion(raw?.recipient_address?.district_info);
    if (!region) continue;
    await prisma.order.update({ where: { id: order.id }, data: { buyerRegion: region } });
    updated++;
  }

  console.log(`Checked ${orders.length} orders, backfilled buyerRegion on ${updated}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
