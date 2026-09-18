import { OrderStatus, Platform, ProblemType, ProblemPriority, ViolationSource } from "@prisma/client";
import type { ActivityAction } from "@/lib/activityLog";

export const statusLabel: Record<OrderStatus, string> = {
  NEW: "ออเดอร์ใหม่",
  PENDING_SHIPMENT: "รอจัดส่ง",
  SHIPPED: "จัดส่งแล้ว",
  DELIVERED: "ส่งสำเร็จ",
  CANCELLED: "ยกเลิก",
  REFUND_REQUESTED: "ขอคืนเงิน",
  RETURNED: "คืนสินค้า",
  PROBLEM: "มีปัญหา",
};

export const statusColor: Record<OrderStatus, string> = {
  NEW: "bg-blue-100 text-blue-700 border-blue-200",
  PENDING_SHIPMENT: "bg-amber-100 text-amber-700 border-amber-200",
  SHIPPED: "bg-indigo-100 text-indigo-700 border-indigo-200",
  DELIVERED: "bg-emerald-100 text-emerald-700 border-emerald-200",
  CANCELLED: "bg-gray-100 text-gray-600 border-gray-200",
  REFUND_REQUESTED: "bg-orange-100 text-orange-700 border-orange-200",
  RETURNED: "bg-rose-100 text-rose-700 border-rose-200",
  PROBLEM: "bg-red-100 text-red-700 border-red-200",
};

/** Solid dot/accent colors per status — used for the small indicator dot on
 * dashboard stat cards, kept separate from statusColor (the pill background)
 * since a pill-strength color would be too heavy as a full accent. */
export const statusAccent: Record<OrderStatus, string> = {
  NEW: "bg-blue-500",
  PENDING_SHIPMENT: "bg-amber-500",
  SHIPPED: "bg-indigo-500",
  DELIVERED: "bg-emerald-500",
  CANCELLED: "bg-gray-400",
  REFUND_REQUESTED: "bg-orange-500",
  RETURNED: "bg-rose-500",
  PROBLEM: "bg-red-500",
};

export const platformLabel: Record<Platform, string> = {
  SHOPEE: "Shopee",
  TIKTOK: "TikTok Shop",
  LAZADA: "Lazada",
};

export const platformColor: Record<Platform, string> = {
  SHOPEE: "bg-orange-500",
  TIKTOK: "bg-black",
  LAZADA: "bg-purple-600",
};

/** Same palette as platformColor, but as literal hex — Recharts' SVG `fill`
 * prop can't consume a Tailwind class string like platformColor's. */
export const platformHexColor: Record<Platform, string> = {
  SHOPEE: "#f97316",
  TIKTOK: "#000000",
  LAZADA: "#9333ea",
};

export function roleLabel(isAdmin: boolean): string {
  return isAdmin ? "ผู้ดูแลระบบ" : "พนักงาน";
}

export const problemTypeLabel: Record<ProblemType, string> = {
  DELAYED_SHIPMENT: "จัดส่งล่าช้า",
  BUYER_COMPLAINT: "ลูกค้าร้องเรียน",
  REFUND_DISPUTE: "ข้อพิพาทคืนเงิน",
  LOST_PACKAGE: "พัสดุสูญหาย/ผิดปกติ",
  DAMAGED_ITEM: "สินค้าเสียหาย",
  WRONG_ITEM: "ส่งผิดรายการ",
  CHARGEBACK: "Chargeback",
  OTHER: "อื่นๆ",
};

export const priorityLabel: Record<ProblemPriority, string> = {
  LOW: "ต่ำ",
  MEDIUM: "ปานกลาง",
  HIGH: "สูง",
  URGENT: "ด่วนมาก",
};

export const priorityColor: Record<ProblemPriority, string> = {
  LOW: "bg-gray-100 text-gray-600",
  MEDIUM: "bg-amber-100 text-amber-700",
  HIGH: "bg-orange-100 text-orange-700",
  URGENT: "bg-red-100 text-red-700",
};

export const activityActionLabel: Record<ActivityAction, string> = {
  LOGIN: "เข้าสู่ระบบ",
  LOGOUT: "ออกจากระบบ",
  EMPLOYEE_CREATE: "เพิ่มพนักงาน",
  EMPLOYEE_ACTIVATE: "เปิดใช้งานบัญชีพนักงาน",
  EMPLOYEE_DEACTIVATE: "ปิดใช้งานบัญชีพนักงาน",
  EMPLOYEE_DELETE: "ลบบัญชีพนักงาน",
  EMPLOYEE_PASSWORD_RESET: "รีเซ็ตรหัสผ่านพนักงาน",
  PASSWORD_CHANGE_SELF: "เปลี่ยนรหัสผ่านตัวเอง",
  PROBLEM_RESOLVE: "แก้ไขปัญหาออเดอร์",
  PROBLEM_REOPEN: "เปิดปัญหาออเดอร์ใหม่",
  ORDER_STATUS_MANUAL_CHANGE: "เปลี่ยนสถานะออเดอร์ด้วยมือ",
  MANUAL_SYNC: "กดอัปเดตข้อมูลทุกช่องทาง",
  LINE_SUMMARY_SENT: "ส่งสรุปออเดอร์จัดส่งเข้า LINE",
  ORDER_FILE_MANUAL_IMPORT: "นำเข้าออเดอร์ด้วยไฟล์ (Shopee/Lazada)",
  LINE_TARGET_RESET: "รีเซ็ตกลุ่ม LINE ปลายทาง",
};

// Only two (package_status, package_sub_status) pairs have actually been
// observed against TikTok's live API so far — see fetchTikTokPackageStatus.
// Anything else falls back to a readably-formatted version of the raw
// strings rather than guessing at a translation that might be wrong.
const KNOWN_PACKAGE_STATUS_LABELS: Record<string, string> = {
  "TO_FULFILL|STOCKING": "กำลังเตรียมพัสดุ (รอจัดสต๊อก)",
  "COMPLETED|DELIVERED": "จัดส่งสำเร็จแล้ว",
};

function titleCaseFromSnake(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function packageStatusLabel(packageStatus: string, packageSubStatus?: string): string {
  const key = packageSubStatus ? `${packageStatus}|${packageSubStatus}` : packageStatus;
  const known = KNOWN_PACKAGE_STATUS_LABELS[key];
  if (known) return known;
  return packageSubStatus ? `${titleCaseFromSnake(packageStatus)} / ${titleCaseFromSnake(packageSubStatus)}` : titleCaseFromSnake(packageStatus);
}

export const violationSourceLabel: Record<ViolationSource, string> = {
  LIVESTREAM: "ไลฟ์สด",
  VIDEO_CONTENT: "คลิปวิดีโอ",
  PRODUCT_LISTING: "หน้าสินค้า/ประกาศขาย",
  ACCOUNT: "บัญชีร้านค้า",
  OTHER: "อื่นๆ",
};
