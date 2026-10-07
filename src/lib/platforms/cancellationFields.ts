// Pulling a cancellation out of what Shopee and Lazada put in their order
// exports. Deliberately has no "server-only" guard and touches no database:
// both file parsers and the one-off backfill that reprocesses already-imported
// rawPayload need these, and the backfill runs as a plain Node script.
//
// Both platforms report the cancellation in the order export itself — the
// separate Seller Center "cancellation report" is not the only source, which
// is what the earlier `REASONLESS_PLATFORMS` assumption got wrong.

export interface ParsedCancellation {
  cancelReason?: string;
  cancelInitiator?: string;
}

// Shopee packs both halves into one cell, e.g.
// "ยกเลิกโดยผู้ซื้อ เหตุผล : ไม่ต้องการซื้อสินค้านี้แล้ว" — and, for its own
// automatic cancellations, splices a literal "<br>" in between:
// "ยกเลิกโดยอัตโนมัติจากระบบของ Shopee <br>เหตุผล : ไม่มีการชำระเงิน".
// Splitting it is what lets a Shopee buyer cancellation land in the same bar
// as a TikTok one on the report instead of a lookalike row of its own.
const SHOPEE_REASON_SEPARATOR = /\s*เหตุผล\s*[:：]\s*/;

function shopeeInitiator(prefix: string): string | undefined {
  if (prefix.includes("ผู้ซื้อ")) return "BUYER";
  if (prefix.includes("ผู้ขาย")) return "SELLER";
  // Checked last: Shopee's automatic wording ("ยกเลิกโดยอัตโนมัติจากระบบของ
  // Shopee") names neither party, so anything left that mentions the system or
  // an automatic action is platform-initiated.
  if (prefix.includes("ระบบ") || prefix.includes("อัตโนมัติ")) return "SYSTEM";
  return undefined;
}

/** Reads Shopee's "เหตุผลในการยกเลิกคำสั่งซื้อ" cell. */
export function parseShopeeCancellation(raw: string): ParsedCancellation {
  // Collapse the "<br>" and any run of whitespace first — Shopee writes the
  // same reason both as "อื่น ๆ" and "อื่นๆ", which would otherwise split one
  // reason across two rows of the breakdown.
  const cleaned = raw.replace(/<br\s*\/?>/gi, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return {};

  const [prefix, ...rest] = cleaned.split(SHOPEE_REASON_SEPARATOR);
  const reason = rest.join(" ").trim();
  return {
    // No "เหตุผล :" part at all means the cell holds the reason on its own.
    cancelReason: (reason || prefix).replace("อื่น ๆ", "อื่นๆ") || undefined,
    cancelInitiator: shopeeInitiator(prefix),
  };
}

// Lazada's own wording is sometimes at odds with the reason text next to it
// (an order reading "ร้านค้าขอยกเลิก" still arrives tagged cancel-buyer). This
// records what the platform reports rather than second-guessing it.
const LAZADA_INITIATOR_MAP: Record<string, string> = {
  "cancel-buyer": "BUYER",
  "cancel-seller": "SELLER",
  "cancel-system": "SYSTEM",
};

/** Reads Lazada's buyerFailedDelivery* columns. Lazada files a cancellation
 * under them, which is also where a buyer's own reason lands. */
export function parseLazadaCancellation(reason: string, detail: string, initiator: string): ParsedCancellation {
  return {
    cancelReason: reason.trim() || detail.trim() || undefined,
    cancelInitiator: LAZADA_INITIATOR_MAP[initiator.trim().toLowerCase()],
  };
}
