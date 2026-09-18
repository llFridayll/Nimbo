import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/dal";
import { EmployeeManager } from "@/components/EmployeeManager";

export const dynamic = "force-dynamic";

export default async function EmployeesPage() {
  const currentUser = await requireAdmin();

  const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">จัดการพนักงาน</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">เพิ่ม ปิดใช้งาน หรือเปลี่ยนรหัสผ่านบัญชีพนักงานที่ใช้เข้าระบบนี้</p>
      </div>

      <EmployeeManager
        currentUserId={currentUser.id}
        employees={users.map((u) => ({
          id: u.id,
          username: u.username,
          displayName: u.displayName,
          role: u.role,
          isActive: u.isActive,
          createdAt: u.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
