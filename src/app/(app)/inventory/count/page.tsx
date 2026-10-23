import Link from "next/link";
import { requireAdmin } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { StockEntryForm } from "@/components/StockEntryForm";

export const dynamic = "force-dynamic";

export default async function StockCountPage() {
  await requireAdmin();
  const items = await prisma.inventoryItem.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, unit: true, onHand: true } });
  return (
    <div className="space-y-6">
      <div>
        <Link href="/inventory" className="text-sm text-primary hover:underline">
          ← คลังสินค้า
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-gray-900 dark:text-gray-100">กรอกสต็อก</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">พิมพ์จำนวนในช่องของสินค้าที่ต้องการ แล้วกดบันทึกครั้งเดียว</p>
      </div>
      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 px-6 py-10 text-center text-sm text-gray-500 dark:border-gray-700">
          ยังไม่มีสินค้าในคลัง เพิ่มได้ที่หน้า<Link href="/inventory" className="font-medium text-primary underline">คลังสินค้า</Link>
        </p>
      ) : (
        <StockEntryForm items={items} />
      )}
    </div>
  );
}
