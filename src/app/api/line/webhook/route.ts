import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSetting, setSetting } from "@/lib/settings";
import { LINE_TARGET_SETTING_KEY } from "@/lib/line";
import { importOrderFileFromLine } from "@/lib/orderFileLineImport";

const REPLY_URL = "https://api.line.me/v2/bot/message/reply";

interface LineEventSource {
  type: string;
  groupId?: string;
  userId?: string;
}

interface LineMessage {
  type: string; // "text" | "file" | "image" | ...
  id?: string; // present for non-text messages — used to download content
  fileName?: string; // present for "file"
}

interface LineEvent {
  type: string; // "message" | "join" | "follow" | ...
  replyToken?: string;
  source?: LineEventSource;
  message?: LineMessage;
}

function verifySignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("base64");
  // Both sides are base64 of a fixed-length HMAC, so this is safe to compare directly.
  return expected === signature;
}

async function replyMessage(replyToken: string, text: string) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) return;
  await fetch(REPLY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ replyToken, messages: [{ type: "text", text }] }),
  }).catch(() => {});
}

function sourceId(source?: LineEventSource): string | undefined {
  return source?.type === "group" ? source.groupId : source?.type === "user" ? source.userId : undefined;
}

// Public endpoint — LINE calls this directly, so it's exempt from the
// session proxy (matcher in src/proxy.ts already excludes /api/**).
//
// Handles two things from whichever chat the bot is in:
//  1. Registers that chat as the shipping-summary push target the first time
//     it messages the bot (or if it switches to a different chat) — silent
//     on every message after that, not just re-announcing itself every time.
//  2. A file message imports it as an order-export file, per the filename
//     convention in importFileNaming.ts (e.g. "SP-Kgarden-...xlsx").
export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  const secret = process.env.LINE_CHANNEL_SECRET;
  if (secret) {
    const signature = request.headers.get("x-line-signature");
    if (!verifySignature(rawBody, signature, secret)) {
      return NextResponse.json({ error: "invalid signature" }, { status: 401 });
    }
  }

  let events: LineEvent[] = [];
  try {
    events = (JSON.parse(rawBody) as { events?: LineEvent[] }).events ?? [];
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  try {
    for (const event of events) {
      const id = sourceId(event.source);
      if (!id) continue;

      const currentTarget = await getSetting(LINE_TARGET_SETTING_KEY);
      // Only the very first message from an as-yet-unclaimed bot registers
      // the target — once a chat has claimed it, a DIFFERENT chat messaging
      // the bot must never silently steal that slot (anyone who finds/adds
      // this public bot could otherwise redirect every future shipping
      // summary to themselves, and — since a claimed chat's file messages
      // flow straight into upsertOrder() below — inject fake orders with no
      // admin gate at all). Re-pairing to a new chat is an explicit admin
      // action (see resetLineTarget in lineTargetActions.ts), not automatic.
      if (!currentTarget) {
        await setSetting(LINE_TARGET_SETTING_KEY, id);
        if (event.replyToken) {
          await replyMessage(event.replyToken, "✅ ลงทะเบียนแชทนี้เป็นปลายทางส่งสรุปออเดอร์จัดส่งเรียบร้อยแล้ว");
        }
        continue; // this event was just the registration trigger, not real content to act on
      }
      if (currentTarget !== id) continue; // a stranger chat — ignore silently, never treat as real content

      if (event.type !== "message" || !event.message) continue;

      if (event.message.type === "file" && event.message.id && event.message.fileName) {
        const outcome = await importOrderFileFromLine(event.message.fileName, event.message.id);
        if (event.replyToken) {
          await replyMessage(event.replyToken, outcome.replyText);
        }
        continue;
      }
    }
  } catch (err) {
    console.error("[line webhook] failed to process event:", err);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
