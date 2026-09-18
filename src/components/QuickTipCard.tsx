import { LightbulbIcon } from "@/components/icons";

const TIPS = [
  "กดปุ่มอัปเดตข้อมูลทุกช่องทางเป็นประจำ เพื่อให้ข้อมูลล่าสุดและลดปัญหาออเดอร์ตกหล่น",
  "ใช้ช่องค้นหาด้านบนเพื่อค้นหาออเดอร์ด้วยเลขคำสั่งซื้อ ชื่อลูกค้า เบอร์โทร หรือเลข Tracking ได้ทันที",
  "ตรวจสอบ Problem Center เป็นประจำเพื่อจัดการออเดอร์ที่มีปัญหาก่อนลูกค้าร้องเรียน",
  "หน้าสรุปออเดอร์จัดส่งช่วยให้แพ็คของได้ตรงตามรอบตัดยอดของแต่ละวัน",
];

export function QuickTipCard() {
  const tip = TIPS[new Date().getDate() % TIPS.length];
  return (
    <div className="flex items-start gap-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-500 dark:bg-amber-900/30 dark:text-amber-400">
        <LightbulbIcon className="h-4 w-4" />
      </span>
      <div>
        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Quick Tip</p>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{tip}</p>
      </div>
    </div>
  );
}
