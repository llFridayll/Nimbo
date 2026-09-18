import { Platform } from "@prisma/client";
import { prisma } from "@/lib/db";
import { PrintButton } from "@/components/PrintButton";
import { OrderPrintSlip } from "@/components/OrderPrintSlip";
import { getTikTokPackageId } from "@/lib/tiktokLabelPdf";

export const dynamic = "force-dynamic";

interface PrintPageProps {
  searchParams: Promise<{ ids?: string | string[] }>;
}

export default async function OrdersPrintPage({ searchParams }: PrintPageProps) {
  const params = await searchParams;
  const ids = params.ids ? (Array.isArray(params.ids) ? params.ids : [params.ids]) : [];

  if (ids.length === 0) {
    return <p className="text-sm text-gray-500">ยังไม่ได้เลือก Order — กลับไปหน้ารายการแล้วติ๊กเลือกก่อน</p>;
  }

  const orders = await prisma.order.findMany({
    where: { id: { in: ids } },
    include: { items: true, problem: true },
  });

  // Preserve the order the user checked them in rather than DB order.
  const byId = new Map(orders.map((o) => [o.id, o]));
  const sortedOrders = ids.map((id) => byId.get(id)).filter((o): o is NonNullable<typeof o> => Boolean(o));

  if (sortedOrders.length === 0) {
    return <p className="text-sm text-gray-500">ไม่พบ Order ที่เลือก</p>;
  }

  // Only orders that actually have a TikTok package synced get a real
  // barcode label — others would just show a placeholder page, so the
  // button's query only ever asks for the ones that can succeed.
  const tiktokLabelIds = sortedOrders.filter((o) => o.platform === Platform.TIKTOK && getTikTokPackageId(o)).map((o) => o.id);
  const labelQuery = tiktokLabelIds.map((id) => `ids=${encodeURIComponent(id)}`).join("&");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <p className="text-sm text-gray-600">เลือกไว้ {sortedOrders.length} รายการ พร้อมพิมพ์</p>
        <div className="flex items-center gap-2">
          {tiktokLabelIds.length > 0 && (
            <a
              href={`/orders/print-labels?${labelQuery}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              🏷️ พิมพ์ใบปะหน้าพัสดุ (TikTok) ({tiktokLabelIds.length})
            </a>
          )}
          <PrintButton />
        </div>
      </div>

      {sortedOrders.map((order, idx) => (
        <div
          key={order.id}
          className={`rounded-lg border border-gray-200 bg-white p-6 print:rounded-none print:border-0 print:p-0 ${
            idx < sortedOrders.length - 1 ? "break-after-page" : ""
          }`}
        >
          <OrderPrintSlip order={order} />
        </div>
      ))}
    </div>
  );
}
