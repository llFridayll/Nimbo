"use server";

import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/dal";
import { revalidatePath } from "next/cache";

/** Renames how `rawSku` (the platform's own seller_sku) displays across the
 * shipping summary, LINE messages, and Excel export — an empty value or one
 * matching rawSku itself resets back to showing the platform's raw name.
 * Admin-only (see SkuAliasEditor: staff don't even get the edit control). */
export async function setSkuAlias(rawSku: string, displaySku: string): Promise<void> {
  await requireAdmin();

  const trimmed = displaySku.trim();
  if (!trimmed || trimmed === rawSku) {
    await prisma.skuAlias.deleteMany({ where: { rawSku } });
  } else {
    await prisma.skuAlias.upsert({
      where: { rawSku },
      create: { rawSku, displaySku: trimmed },
      update: { displaySku: trimmed },
    });
  }

  revalidatePath("/orders/shipping-summary");
}
