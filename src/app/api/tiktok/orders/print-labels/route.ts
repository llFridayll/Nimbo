import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { Platform } from "@prisma/client";
import { prisma } from "@/lib/db";
import { fetchTikTokLabelPdfBytes, getTikTokPackageId } from "@/lib/tiktokLabelPdf";
import { getSessionPayload } from "@/lib/session";

/** Merges several orders' real TikTok shipping-label PDFs into one combined
 * PDF so a batch of orders can be printed in a single print job, the same
 * way the packing-slip bulk print already works. Orders whose label isn't
 * available yet (no package_id synced, or TikTok's package-already-picked-up
 * error) get a one-page placeholder instead of being silently dropped, so
 * the picker still knows that order needs attention.
 *
 * This route sits outside proxy.ts's auth gate (like the rest of /api) —
 * check the session directly rather than getCurrentUser(), which redirects. */
export async function GET(req: NextRequest) {
  const session = await getSessionPayload();
  if (!session?.userId) return NextResponse.json({ error: "ยังไม่ได้เข้าสู่ระบบ" }, { status: 401 });

  const ids = req.nextUrl.searchParams.getAll("ids");
  if (ids.length === 0) {
    return NextResponse.json({ error: "ยังไม่ได้เลือก Order" }, { status: 400 });
  }

  const orders = await prisma.order.findMany({ where: { id: { in: ids } } });
  const byId = new Map(orders.map((o) => [o.id, o]));
  // Preserve the order the caller listed them in.
  const sortedOrders = ids.map((id) => byId.get(id)).filter((o): o is NonNullable<typeof o> => Boolean(o));

  if (sortedOrders.length === 0) {
    return NextResponse.json({ error: "ไม่พบ Order ที่เลือก" }, { status: 404 });
  }

  const merged = await PDFDocument.create();
  const font = await merged.embedFont(StandardFonts.Helvetica);

  // pdf-lib's standard fonts only support WinAnsi (no Thai glyphs) — strip
  // anything outside that range rather than crash the whole batch over one
  // placeholder page's text.
  function toWinAnsi(text: string): string {
    return text.replace(/[^\x00-\xff]/g, "");
  }

  async function addPlaceholderPage(orderLabel: string, reason: string) {
    const page = merged.addPage([298, 420]); // roughly A6, matching the real labels
    page.drawText("Shipping label unavailable", { x: 20, y: 380, size: 12, font, color: rgb(0.8, 0, 0) });
    page.drawText(orderLabel, { x: 20, y: 355, size: 11, font });
    page.drawText(toWinAnsi(reason) || "(see order detail page for the reason)", {
      x: 20,
      y: 330,
      size: 9,
      font,
      maxWidth: 258,
      color: rgb(0.4, 0.4, 0.4),
    });
  }

  for (const order of sortedOrders) {
    const orderLabel = `Order #${order.platformOrderId}`;
    if (order.platform !== Platform.TIKTOK) {
      await addPlaceholderPage(orderLabel, "Not a TikTok Shop order");
      continue;
    }
    if (!getTikTokPackageId(order)) {
      await addPlaceholderPage(orderLabel, "No package data synced for this order yet");
      continue;
    }
    try {
      const pdfBytes = await fetchTikTokLabelPdfBytes(order);
      const labelDoc = await PDFDocument.load(pdfBytes);
      const pages = await merged.copyPages(labelDoc, labelDoc.getPageIndices());
      for (const page of pages) merged.addPage(page);
    } catch (err) {
      await addPlaceholderPage(orderLabel, (err as Error).message);
    }
  }

  const mergedBytes = await merged.save();
  return new NextResponse(Buffer.from(mergedBytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="shipping-labels.pdf"`,
    },
  });
}
