import "server-only";
import { prisma } from "@/lib/db";

function checklistKey(orderId: string, sku: string): string {
  return `${orderId} ${sku}`;
}

/** Manual true/false overrides staff have explicitly ticked for this ship
 * date, keyed by order+SKU (each order is tracked independently — two
 * different orders sharing a SKU must never share a checklist entry). A row
 * only exists here once someone has clicked the checkbox at least once —
 * everything else falls back to the tracking-number default (see
 * resolveShippingChecklistChecked below). */
export async function getShippingChecklistOverrides(shipDate: string): Promise<Map<string, boolean>> {
  const rows = await prisma.shippingChecklistItem.findMany({
    where: { shipDate },
    select: { orderId: true, sku: true, checked: true },
  });
  return new Map(rows.map((r) => [checklistKey(r.orderId, r.sku), r.checked]));
}

/** An order-item already carrying a tracking number has already been
 * printed/labeled, so it defaults to "shipped" without needing a manual
 * tick — staff only need to touch the checkbox to override that default. */
export function resolveShippingChecklistChecked(overrides: Map<string, boolean>, key: string, hasTrackingNumber: boolean): boolean {
  const override = overrides.get(key);
  return override === undefined ? hasTrackingNumber : override;
}

export { checklistKey };
