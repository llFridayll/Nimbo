import { NextRequest, NextResponse } from "next/server";
import { currentShippingCutoffWindow, shippingCutoffWindowForDate } from "@/lib/dateUtils";
import { getShippingSummary, excludeShippingSummaryLines } from "@/lib/shippingSummary";
import { buildShippingSummarySlipWorkbook, shippingSummarySlipFilename } from "@/lib/shippingSummaryExcel";
import { getSessionPayload } from "@/lib/session";

// This route sits outside proxy.ts's auth gate (like the rest of /api), so
// unlike a Server Action there's no guarantee a session cookie is present —
// read it directly instead of getCurrentUser(), which redirects (a
// page-navigation behavior, not appropriate for a Route Handler).
export async function GET(request: NextRequest) {
  const session = await getSessionPayload();
  if (!session?.userId) {
    return NextResponse.json({ error: "ยังไม่ได้เข้าสู่ระบบ" }, { status: 401 });
  }

  const dateParam = request.nextUrl.searchParams.get("date");
  const window =
    dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
      ? shippingCutoffWindowForDate(new Date(`${dateParam}T12:00:00+07:00`))
      : currentShippingCutoffWindow();

  // A staff member may have removed a customer-cancelled item in the
  // preview screen before confirming the download — carried here as a
  // JSON-encoded array of ShippingPreviewItem.key so the file matches
  // exactly what they reviewed.
  let excludedKeys: string[] = [];
  const excludedParam = request.nextUrl.searchParams.get("excluded");
  if (excludedParam) {
    try {
      excludedKeys = JSON.parse(excludedParam);
    } catch {
      // Malformed param — fall back to exporting everything rather than 400ing a download.
    }
  }

  const summary = await getShippingSummary(window);
  const carriers = excludeShippingSummaryLines(summary.carriers, new Set(excludedKeys));
  const buffer = buildShippingSummarySlipWorkbook({ ...summary, carriers });
  const filename = shippingSummarySlipFilename(window.shipDate);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
