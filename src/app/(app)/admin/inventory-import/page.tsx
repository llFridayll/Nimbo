import Link from "next/link";
import { requireAdmin } from "@/lib/dal";
import { InventoryImportForm } from "@/components/InventoryImportForm";

export const dynamic = "force-dynamic";

export default async function InventoryImportPage() {
  await requireAdmin();
  return (
    <div className="space-y-6">
      <div>
        <Link href="/inventory" className="text-sm text-primary hover:underline">
          ← คลังสินค้า
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-gray-900 dark:text-gray-100">นำเข้าไฟล์สต็อก</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">ใช้ได้ทั้งตั้งยอดเริ่มต้น รับของเข้า และปรับยอดหลังนับของ</p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-400">
        <p className="font-medium text-gray-800 dark:text-gray-200">รูปแบบไฟล์</p>
        <ul className="mt-1.5 list-inside list-disc space-y-1 text-xs">
          <li>
            คอลัมน์ที่อ่าน: <b>ชื่อสินค้า</b> (ต้องมี), <b>จำนวน</b>, หน่วย, ต้นทุนต่อหน่วย, จุดสั่งซื้อ — ชื่อคอลัมน์อื่นในไฟล์จะถูกข้าม
          </li>
          <li>นับจำนวนเป็นหน่วยเล็กที่สุดที่ใช้ในคลัง เช่น นับหลังคาเป็น &ldquo;แผ่น&rdquo; ไม่ใช่ &ldquo;ถุง&rdquo;</li>
          <li>ชื่อที่ยังไม่มีในคลังจะถูกสร้างเป็นสินค้าใหม่ ชื่อต้องตรงทุกตัวอักษรถึงจะนับเป็นตัวเดิม</li>
          <li>เว้นช่องจำนวนว่างได้ ถ้าต้องการแค่แก้ต้นทุนหรือจุดสั่งซื้อ</li>
          <li>
            ผูก SKU ในไฟล์เดียวกันได้: คอลัมน์ <b>SKU ที่ขาย</b> (หลาย SKU คั่นด้วย &ldquo;|&rdquo;) และ <b>ตัดต่อชิ้นที่ขาย</b> (ไม่ใส่ = 1)
          </li>
        </ul>
        <a href="/api/inventory/template" className="mt-2 inline-block text-xs font-medium text-primary hover:underline">
          ดาวน์โหลดไฟล์ตั้งต้น (.xlsx) — มีชื่อสินค้าให้แล้ว เติมแค่จำนวน
        </a>
      </div>

      <InventoryImportForm />
    </div>
  );
}
