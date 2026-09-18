import { NextRequest, NextResponse } from "next/server";
import { adapters } from "@/lib/platforms";
import { upsertOrder } from "@/lib/sync";
import { Platform } from "@prisma/client";

/** TODO(integration): implement once Shopee Partner credentials exist —
 * verify the push signature, then map Shopee's order_status_push payload
 * in shopeeAdapter.normalizeWebhookPayload. */
export async function POST(req: NextRequest) {
  const payload = await req.json();
  const normalized = adapters[Platform.SHOPEE].normalizeWebhookPayload(payload);
  if (!normalized) return NextResponse.json({ ok: false, reason: "not implemented yet" }, { status: 501 });

  await upsertOrder(normalized);
  return NextResponse.json({ ok: true });
}
