import { NextRequest, NextResponse } from "next/server";
import { Platform } from "@prisma/client";
import { prisma } from "@/lib/db";
import { fetchTikTokLabelPdfBytes, getTikTokPackageId } from "@/lib/tiktokLabelPdf";
import { getSessionPayload } from "@/lib/session";

/** Proxies the real courier shipping label PDF for this order, fetched live
 * from TikTok Shop (barcode/QR/COD info the courier generated — not
 * something we render ourselves).
 *
 * Streams the PDF bytes back from our own origin instead of redirecting to
 * TikTok's signed URL — the print-label page embeds this in an <iframe> and
 * calls contentWindow.print() on it, which only works same-origin.
 *
 * This route sits outside proxy.ts's auth gate (like the rest of /api) —
 * check the session directly rather than getCurrentUser(), which redirects. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const session = await getSessionPayload();
  if (!session?.userId) return NextResponse.json({ error: "ยังไม่ได้เข้าสู่ระบบ" }, { status: 401 });

  const { orderId } = await params;

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.platform !== Platform.TIKTOK) {
    return NextResponse.json({ error: "ไม่พบออเดอร์นี้ หรือไม่ใช่ออเดอร์จาก TikTok Shop" }, { status: 404 });
  }
  if (!getTikTokPackageId(order)) {
    return NextResponse.json(
      { error: "ยังไม่มีข้อมูลพัสดุสำหรับออเดอร์นี้ (อาจยังไม่ถูกอัปเดตจาก TikTok)" },
      { status: 400 }
    );
  }

  try {
    const pdfBytes = await fetchTikTokLabelPdfBytes(order);
    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `inline; filename="label-${order.platformOrderId}.pdf"`,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
