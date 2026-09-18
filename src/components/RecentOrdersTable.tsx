import Link from "next/link";
import type { RecentOrderRow } from "@/lib/dashboardStats";
import { platformColor } from "@/lib/labels";
import { StatusBadge } from "@/components/Badges";
import { OrderRowMenu } from "@/components/OrderRowMenu";

function formatOrderDateTime(date: Date): string {
  return date.toLocaleString("th-TH", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function RecentOrdersTable({ orders }: { orders: RecentOrderRow[] }) {
  if (orders.length === 0) {
    return <p className="py-8 text-center text-sm text-gray-400 dark:text-gray-500">ยังไม่มีออเดอร์ในระบบ</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-gray-100 dark:border-gray-800 text-left text-xs text-gray-400 dark:text-gray-500">
            <th className="py-2 pr-3 font-medium">ช่องทาง</th>
            <th className="py-2 pr-3 font-medium">เลขคำสั่งซื้อ</th>
            <th className="py-2 pr-3 font-medium">ลูกค้า</th>
            <th className="py-2 pr-3 font-medium">ยอดชำระ</th>
            <th className="py-2 pr-3 font-medium">สถานะ</th>
            <th className="py-2 pr-3 font-medium">วันที่/เวลาสั่ง</th>
            <th className="py-2 pl-3 text-right font-medium">การจัดการ</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id} className="border-b border-gray-50 dark:border-gray-800/60 last:border-0">
              <td className="py-2.5 pr-3">
                <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white ${platformColor[order.platform]}`}>
                  {order.platform.charAt(0)}
                </span>
              </td>
              <td className="py-2.5 pr-3 font-medium text-gray-800 dark:text-gray-200">#{order.platformOrderId}</td>
              <td className="py-2.5 pr-3 text-gray-600 dark:text-gray-300">{order.buyerNameMasked}</td>
              <td className="py-2.5 pr-3 text-gray-600 dark:text-gray-300">
                {order.totalAmount.toLocaleString()} {order.currency}
              </td>
              <td className="py-2.5 pr-3">
                <StatusBadge status={order.status} />
              </td>
              <td className="py-2.5 pr-3 whitespace-nowrap text-gray-400 dark:text-gray-500">{formatOrderDateTime(order.orderDate)}</td>
              <td className="py-2.5 pl-3">
                <div className="flex items-center justify-end gap-2">
                  <Link href={`/orders/${order.id}`} className="text-xs font-medium text-primary hover:underline">
                    ดูรายละเอียด
                  </Link>
                  <OrderRowMenu orderId={order.id} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
