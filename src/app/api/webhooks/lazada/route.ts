import { NextRequest, NextResponse } from "next/server";
import { adapters } from "@/lib/platforms";
import { upsertOrder } from "@/lib/sync";
import { Platform } from "@prisma/client";

/** TODO(integration): implement once Lazada Open Platform credentials exist —
 * verify the push signature, then map Lazada's order status webhook payload
 * in lazadaAdapter.normalizeWebhookPayload. */
export async function POST(req: NextRequest) {
  const payload = await req.json();
  const normalized = adapters[Platform.LAZADA].normalizeWebhookPayload(payload);
  if (!normalized) return NextResponse.json({ ok: false, reason: "not implemented yet" }, { status: 501 });

  await upsertOrder(normalized);
  return NextResponse.json({ ok: true });
}
