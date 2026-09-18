import { requireAdmin } from "@/lib/dal";
import { OrderImportForm } from "@/components/OrderImportForm";
import { getLineTargetStatus } from "@/lib/lineTargetActions";
import { ResetLineTargetButton } from "@/components/ResetLineTargetButton";

export default async function OrderImportPage() {
  await requireAdmin();
  const { isSet: lineTargetIsSet } = await getLineTargetStatus();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">นำเข้าออเดอร์ด้วยไฟล์ (Shopee/Lazada)</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          ใช้ชั่วคราวระหว่างที่ยังเชื่อมต่อ API ของ Shopee/Lazada ไม่ได้ — อัปโหลดไฟล์ order export จาก Seller Center ของแต่ละแพลตฟอร์ม
          ระบบจะนำเข้าและอัปเดตสถานะออเดอร์ให้เหมือนซิงก์อัตโนมัติ
        </p>
        <p className="mt-1 text-sm text-amber-600 dark:text-amber-400">
          ระบบรู้ว่าไฟล์เป็นของแพลตฟอร์ม/ร้านไหนจาก<strong>ชื่อไฟล์</strong> — ต้องขึ้นต้นด้วย <code>SP-{"{ชื่อร้าน}"}</code> (Shopee) หรือ{" "}
          <code>LZD-{"{ชื่อร้าน}"}</code> (Lazada) เช่น <code>SP-Kgarden-Order.all....xlsx</code> (ร้านที่รู้จัก: Kgarden, รั้วตราไก่,
          Thai Euro Fence, Thai Euro Kool, River Floor — River Floor มีเฉพาะฝั่ง Shopee) — เปลี่ยนชื่อไฟล์ก่อนอัปโหลดถ้าชื่อยังไม่ตรงรูปแบบนี้
        </p>
      </div>

      <OrderImportForm />

      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">กลุ่ม LINE ปลายทาง (รับสรุปออเดอร์จัดส่ง / นำเข้าไฟล์ผ่านแชท)</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {lineTargetIsSet
            ? "ตอนนี้มีกลุ่ม/แชท LINE ผูกไว้เป็นปลายทางอยู่แล้ว — ข้อความจากแชทอื่นจะไม่ถูกใช้งานจนกว่าจะรีเซ็ตตรงนี้ก่อน"
            : "ยังไม่มีกลุ่ม/แชท LINE ผูกไว้ — ส่งข้อความอะไรก็ได้จากกลุ่มที่ต้องการเข้าไปในบอทได้เลย ระบบจะจดจำกลุ่มนั้นให้อัตโนมัติ"}
        </p>
        {lineTargetIsSet && (
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
            ถ้าจะเปลี่ยนไปใช้กลุ่มอื่น ให้กดรีเซ็ตก่อน แล้วส่งข้อความจากกลุ่มใหม่เข้าบอทอีกครั้ง
          </p>
        )}
        <div className="mt-3">
          <ResetLineTargetButton disabled={!lineTargetIsSet} />
        </div>
      </div>
    </div>
  );
}
