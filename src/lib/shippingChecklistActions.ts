"use server";

import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/dal";
import { revalidatePath } from "next/cache";

// One checkbox represents a whole shipment row — which can span more than one
// order when several orders share a tracking number (packed together) — so
// toggling it must flip every (order, SKU) pair in that row in one go.
export async function toggleShippingChecklistItems(shipDate: string, items: { orderId: string; sku: string }[], checked: boolean): Promise<void> {
  await getCurrentUser();

  await prisma.$transaction(
    items.map(({ orderId, sku }) =>
      prisma.shippingChecklistItem.upsert({
        where: { shipDate_orderId_sku: { shipDate, orderId, sku } },
        create: { shipDate, orderId, sku, checked },
        update: { checked },
      })
    )
  );

  revalidatePath("/orders/shipping-summary");
}
