import { CancellationImportForm } from "@/components/CancellationImportForm";
import { requireAdmin } from "@/lib/dal";

export const dynamic = "force-dynamic";

export default async function CancellationImportPage() {
  await requireAdmin();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">นำเข้ารายการยกเลิก / คืนสินค้า</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          อัปโหลดไฟล์รายงานการยกเลิกหรือการคืนสินค้าจาก Shopee/Lazada Seller Center เพื่อเติมรายละเอียดให้ออเดอร์ที่มีอยู่แล้ว
        </p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-400">
        <p className="font-medium text-gray-800 dark:text-gray-200">ไฟล์นี้ทำอะไรกับข้อมูล</p>
        <ul className="mt-1.5 list-inside list-disc space-y-1 text-xs">
          <li>เลือกได้หลายไฟล์พร้อมกัน ปนกันทั้งสองชนิดได้ — ระบบดูจากคอลัมน์ในไฟล์เองว่าเป็นรายงานแบบไหน</li>
          <li>ไฟล์ยกเลิก → เติมเหตุผล / ผู้ยกเลิก / วันที่ยกเลิก</li>
          <li>ไฟล์คืนสินค้า → เติมเหตุผลการคืน / วันที่คืน / ยอดเงินคืน แล้วไปโผล่ที่หน้า &quot;การคืนสินค้า&quot;</li>
          <li>ไม่สร้างออเดอร์ใหม่ — เลขที่ไม่มีในระบบจะถูกข้ามและแสดงให้ดู</li>
          <li>ไม่เปลี่ยนสถานะออเดอร์ สถานะยังมาจากการ sync เท่านั้น</li>
          <li>อัปไฟล์เดิมซ้ำได้ ผลลัพธ์เหมือนเดิม (เขียนทับค่าเดิมด้วยค่าจากไฟล์)</li>
        </ul>
        <p className="mt-2 text-xs">
          สำหรับการยกเลิก หน้านี้เป็นตัวเสริมเท่านั้น — TikTok ได้เหตุผลมาพร้อม sync อัตโนมัติ ส่วน Shopee/Lazada
          ได้มาจากไฟล์ออเดอร์ที่นำเข้าตามปกติอยู่แล้ว ส่วนรายการคืนสินค้ามีได้จากหน้านี้ทางเดียว
        </p>
      </div>

      <CancellationImportForm />
    </div>
  );
}
