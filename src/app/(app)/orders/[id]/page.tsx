import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { PlatformBadge } from "@/components/Badges";
import { statusLabel, problemTypeLabel, priorityLabel, priorityColor, packageStatusLabel } from "@/lib/labels";
import { PrintButton } from "@/components/PrintButton";
import { OrderStatusEditor } from "@/components/OrderStatusEditor";
import { OrderPrintSlip } from "@/components/OrderPrintSlip";
import { getOrderDiscountInfo } from "@/lib/discountInfo";
import { fetchTikTokPackageStatus } from "@/lib/platforms/tiktok";

export const dynamic = "force-dynamic";

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      items: true,
      problem: true,
      statusHistory: { orderBy: { occurredAt: "asc" } },
    },
  });

  if (!order) notFound();

  const rawPayload = order.rawPayload as { packages?: { id?: string }[] } | null;
  const packageId = rawPayload?.packages?.[0]?.id;
  const hasTikTokPackage = order.platform === "TIKTOK" && Boolean(packageId);
  const discountInfo = getOrderDiscountInfo(order.platform, order.rawPayload);

  // Live "where's it now" check, straight from TikTok — only worth calling
  // for orders still in flight. An already-delivered/cancelled order's
  // package status won't change again, so there's nothing to gain from
  // hitting TikTok's API on every page view for old orders.
  const isInFlight = order.status === "PENDING_SHIPMENT" || order.status === "SHIPPED";
  const packageStatus =
    hasTikTokPackage && isInFlight && packageId
      ? await fetchTikTokPackageStatus(packageId, order.shopId).catch(() => null)
      : null;

  return (
    <div className="space-y-6">
      {/* Printed output reuses the same slip as the bulk print page — everything
       * below (the interactive screen view) is hidden while printing instead. */}
      <div className="hidden print:block">
        <OrderPrintSlip order={order} />
      </div>

      <div className="print:hidden space-y-6">
        <Link href="/orders" className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100">
          ← กลับไปหน้ารายการ Order
        </Link>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Order #{order.platformOrderId}</h1>
            <PlatformBadge platform={order.platform} />
            <OrderStatusEditor orderId={order.id} status={order.status} />
          </div>
          <div className="flex items-center gap-2">
            {hasTikTokPackage && (
              <a
                href={`/orders/${order.id}/print-label`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                🏷️ พิมพ์ใบปะหน้าพัสดุ (TikTok)
              </a>
            )}
            <PrintButton />
          </div>
        </div>

        {order.problem && !order.problem.isResolved && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-red-800">
                  ⚠️ ปัญหา: {problemTypeLabel[order.problem.type]}
                </p>
                <p className="mt-1 text-sm text-red-700">{order.problem.description}</p>
              </div>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${priorityColor[order.problem.priority]}`}>
                {priorityLabel[order.problem.priority]}
              </span>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <section className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
              <h2 className="mb-4 text-sm font-semibold text-gray-900 dark:text-gray-100">รายการสินค้า</h2>
              <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="text-left text-xs text-gray-500 dark:text-gray-400">
                  <tr>
                    <th className="whitespace-nowrap py-2 pr-3 font-medium">SKU</th>
                    <th className="py-2 pr-3 font-medium">สินค้า</th>
                    <th className="whitespace-nowrap py-2 px-3 text-right font-medium">จำนวน</th>
                    {discountInfo && (
                      <>
                        <th className="whitespace-nowrap py-2 px-3 text-right font-medium">ราคาเต็ม/ชิ้น</th>
                        <th className="whitespace-nowrap py-2 px-3 text-right font-medium">ส่วนลด/ชิ้น</th>
                      </>
                    )}
                    <th className="whitespace-nowrap py-2 px-3 text-right font-medium">ราคาขายจริง/ชิ้น</th>
                    <th className="whitespace-nowrap py-2 pl-3 text-right font-medium">รวม</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {order.items.map((item) => {
                    const itemDiscount = discountInfo?.items.get(item.sku);
                    return (
                      <tr key={item.id}>
                        <td className="whitespace-nowrap py-2 pr-3 text-gray-500 dark:text-gray-400">{item.sku}</td>
                        <td className="py-2 pr-3 font-medium text-gray-800 dark:text-gray-200">{item.productName}</td>
                        <td className="whitespace-nowrap py-2 px-3 text-right text-gray-600 dark:text-gray-400">{item.quantity}</td>
                        {discountInfo && (
                          <>
                            <td className="whitespace-nowrap py-2 px-3 text-right text-gray-400 dark:text-gray-500 line-through">
                              {itemDiscount ? itemDiscount.unitOriginalPrice.toLocaleString() : "-"}
                            </td>
                            <td className="whitespace-nowrap py-2 px-3 text-right text-red-600">
                              {itemDiscount && itemDiscount.unitDiscount > 0 ? `-${itemDiscount.unitDiscount.toLocaleString()}` : "-"}
                            </td>
                          </>
                        )}
                        <td className="whitespace-nowrap py-2 px-3 text-right text-gray-600 dark:text-gray-400">
                          {Number(item.unitPrice).toLocaleString()}
                        </td>
                        <td className="whitespace-nowrap py-2 pl-3 text-right font-medium text-gray-800 dark:text-gray-200">
                          {(Number(item.unitPrice) * item.quantity).toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  {discountInfo && discountInfo.totalDiscount > 0 && (
                    <>
                      <tr>
                        <td colSpan={discountInfo ? 6 : 4} className="pt-3 pr-3 text-right text-sm text-gray-500 dark:text-gray-400">
                          ราคาสินค้ารวม (ก่อนหักส่วนลด)
                        </td>
                        <td className="whitespace-nowrap py-2 pl-3 pt-3 text-right text-sm text-gray-500 dark:text-gray-400 line-through">
                          {discountInfo.totalOriginalPrice.toLocaleString()}
                        </td>
                      </tr>
                      <tr>
                        <td colSpan={discountInfo ? 6 : 4} className="pr-3 text-right text-sm text-red-600">
                          ส่วนลดที่ลูกค้าได้รับ
                        </td>
                        <td className="whitespace-nowrap py-2 pl-3 text-right text-sm text-red-600">
                          -{discountInfo.totalDiscount.toLocaleString()}
                        </td>
                      </tr>
                    </>
                  )}
                  <tr>
                    <td colSpan={discountInfo ? 6 : 4} className="pt-3 pr-3 text-right text-sm font-semibold text-gray-900 dark:text-gray-100">
                      ยอดชำระรวม
                    </td>
                    <td className="whitespace-nowrap py-2 pl-3 pt-3 text-right text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {Number(order.totalAmount).toLocaleString()} {order.currency}
                    </td>
                  </tr>
                </tfoot>
              </table>
              </div>
            </section>

            <section className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
              <h2 className="mb-4 text-sm font-semibold text-gray-900 dark:text-gray-100">ประวัติสถานะ</h2>
              <ol className="space-y-4 border-l border-gray-200 dark:border-gray-700 pl-4">
                {order.statusHistory.map((h) => (
                  <li key={h.id} className="relative">
                    <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-primary" />
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{statusLabel[h.status]}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">{new Date(h.occurredAt).toLocaleString("th-TH")}</p>
                    {h.note && <p className="text-xs text-gray-500 dark:text-gray-400">{h.note}</p>}
                  </li>
                ))}
              </ol>
            </section>
          </div>

          <div className="space-y-6">
            <section className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
              <h2 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">ข้อมูลลูกค้า</h2>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-500 dark:text-gray-400">ชื่อ</dt>
                  <dd className="text-gray-800 dark:text-gray-200">{order.buyerName ?? "-"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500 dark:text-gray-400">เบอร์โทร</dt>
                  <dd className="text-gray-800 dark:text-gray-200">{order.buyerPhone ?? "-"}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="shrink-0 text-gray-500 dark:text-gray-400">รหัสลูกค้า (TikTok)</dt>
                  <dd className="truncate text-right text-gray-800 dark:text-gray-200" title={order.buyerUsername ?? undefined}>
                    {order.buyerUsername ?? "-"}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="shrink-0 text-gray-500 dark:text-gray-400">พื้นที่จัดส่ง</dt>
                  <dd className="text-right text-gray-800 dark:text-gray-200">{order.buyerRegion ?? "-"}</dd>
                </div>
              </dl>
              {/* Street-level address is masked by TikTok Shop's API itself
                  (privacy protection) before it ever reaches this app — only
                  the district/province survive unmasked, shown above. The
                  full address still gets printed correctly on shipping
                  labels since TikTok fills that in server-side. */}
              <p className="mt-3 text-xs text-gray-400 dark:text-gray-500">
                *ที่อยู่แบบเต็มถูกปิดบังจากฝั่ง TikTok Shop เพื่อความเป็นส่วนตัวของลูกค้า ระบบเห็นได้แค่ระดับอำเภอ/จังหวัด
              </p>
            </section>

            <section className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
              <h2 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">การจัดส่ง</h2>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-500 dark:text-gray-400">บริษัทขนส่ง</dt>
                  <dd className="text-gray-800 dark:text-gray-200">{order.shippingCarrier ?? "-"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500 dark:text-gray-400">Tracking</dt>
                  <dd className="text-right text-gray-800 dark:text-gray-200">
                    {order.trackingNumber ? order.trackingNumber.split(" / ").map((code) => <div key={code}>{code}</div>) : "-"}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500 dark:text-gray-400">วิธีจัดส่ง</dt>
                  <dd className="text-gray-800 dark:text-gray-200">{order.shippingStatus ?? "-"}</dd>
                </div>
                {packageStatus && (
                  <div className="flex justify-between gap-4">
                    <dt className="shrink-0 text-gray-500 dark:text-gray-400">สถานะพัสดุล่าสุด</dt>
                    <dd className="text-right font-medium text-emerald-700 dark:text-emerald-400">
                      {packageStatusLabel(packageStatus.packageStatus, packageStatus.packageSubStatus)}
                    </dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-gray-500 dark:text-gray-400">วันที่สั่งซื้อ</dt>
                  <dd className="text-gray-800 dark:text-gray-200">{new Date(order.orderDate).toLocaleString("th-TH")}</dd>
                </div>
              </dl>
              {isInFlight && !packageStatus && (
                <p className="mt-3 text-xs text-gray-400 dark:text-gray-500">
                  *ยังเช็คสถานะพัสดุล่าสุดจาก TikTok Shop ไม่ได้ตอนนี้ (อาจยังไม่มีข้อมูลพัสดุ หรือ TikTok ตอบช้า)
                </p>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
