import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/db";
import { getSessionPayload } from "@/lib/session";

/** A ready-to-fill stock sheet: every stock item with its current figures,
 * or — before any exist — every packing-list name, so the first upload sets
 * the whole warehouse up. Fill "จำนวน" and upload it back. */
export async function GET() {
  const session = await getSessionPayload();
  if (!session?.userId) return NextResponse.json({ error: "ยังไม่ได้เข้าสู่ระบบ" }, { status: 401 });
  // Re-checked against the database, not just the cookie's role, so a
  // demoted or deactivated admin's still-valid cookie can't pull costs.
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { role: true, isActive: true } });
  if (!user?.isActive || user.role !== "ADMIN") return NextResponse.json({ error: "เฉพาะผู้ดูแลระบบ" }, { status: 403 });

  const items = await prisma.inventoryItem.findMany({ orderBy: { name: "asc" } });
  let rows: Record<string, string | number>[];
  if (items.length > 0) {
    rows = items.map((i) => ({
      ชื่อสินค้า: i.name,
      หน่วย: i.unit,
      คงเหลือในระบบ: i.onHand,
      จำนวน: "",
      ต้นทุนต่อหน่วย: i.unitCost ?? "",
      จุดสั่งซื้อ: i.reorderPoint ?? "",
    }));
  } else {
    const names = await prisma.skuAlias.findMany({ distinct: ["displaySku"], select: { displaySku: true }, orderBy: { displaySku: "asc" } });
    rows = names.map((n) => ({ ชื่อสินค้า: n.displaySku, หน่วย: "ชิ้น", จำนวน: "", ต้นทุนต่อหน่วย: "", จุดสั่งซื้อ: "" }));
  }
  const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ ชื่อสินค้า: "", หน่วย: "", จำนวน: "", ต้นทุนต่อหน่วย: "", จุดสั่งซื้อ: "" }]);
  ws["!cols"] = [{ wch: 40 }, { wch: 10 }, { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 12 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "สต็อก");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent("สต็อกสินค้า.xlsx")}`,
    },
  });
}
