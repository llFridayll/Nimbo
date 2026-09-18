import { Order, OrderItem, Platform, ProblemTicket } from "@prisma/client";
import { platformLabel, problemTypeLabel, priorityLabel, priorityColor } from "@/lib/labels";

type OrderWithItems = Order & { items: OrderItem[]; problem: ProblemTicket | null };

/** One printable packing-slip block for a single order. Pure presentation —
 * no data fetching — so both the single order detail page and the bulk
 * multi-select print page render an identical slip. */
export function OrderPrintSlip({ order }: { order: OrderWithItems }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">ใบสั่งซื้อ / Packing Slip</h2>
        <p className="text-sm text-gray-600">
          {platformLabel[order.platform as Platform]} · เลขคำสั่งซื้อ #{order.platformOrderId}
        </p>
      </div>

      {order.problem && (
        <div className="flex items-center justify-between rounded border border-gray-300 p-2 text-sm">
          <span>
            ⚠️ {problemTypeLabel[order.problem.type]} — {order.problem.description}
          </span>
          <span className={`rounded px-2 py-0.5 text-xs font-medium ${priorityColor[order.problem.priority]}`}>
            {priorityLabel[order.problem.priority]}
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="font-medium text-gray-900">ลูกค้า</p>
          <p>{order.buyerName ?? "-"}</p>
          <p>{order.buyerPhone ?? "-"}</p>
        </div>
        <div>
          <p className="font-medium text-gray-900">การจัดส่ง</p>
          <p>{order.shippingCarrier ?? "-"}</p>
          {order.trackingNumber ? (
            // A split-shipment order carries more than one tracking number
            // joined by " / " (see lazadaImport.ts / tiktok.ts) — one per
            // line here instead of crammed onto one.
            order.trackingNumber.split(" / ").map((code) => <p key={code}>Tracking: {code}</p>)
          ) : (
            <p>Tracking: -</p>
          )}
          <p>วันที่สั่ง: {new Date(order.orderDate).toLocaleString("th-TH")}</p>
        </div>
      </div>

      <table className="w-full text-sm">
        <thead className="text-left text-xs text-gray-500">
          <tr>
            <th className="pb-2 font-medium">SKU</th>
            <th className="pb-2 font-medium">สินค้า</th>
            <th className="pb-2 text-right font-medium">จำนวน</th>
            <th className="pb-2 text-right font-medium">ราคา/ชิ้น</th>
            <th className="pb-2 text-right font-medium">รวม</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {order.items.map((item) => (
            <tr key={item.id}>
              <td className="py-1.5 text-gray-500">{item.sku}</td>
              <td className="py-1.5 font-medium text-gray-800">{item.productName}</td>
              <td className="py-1.5 text-right">{item.quantity}</td>
              <td className="py-1.5 text-right">{Number(item.unitPrice).toLocaleString()}</td>
              <td className="py-1.5 text-right font-medium">
                {(Number(item.unitPrice) * item.quantity).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={4} className="pt-2 text-right text-sm font-semibold">
              ยอดชำระรวม
            </td>
            <td className="pt-2 text-right text-sm font-semibold">
              {Number(order.totalAmount).toLocaleString()} {order.currency}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
