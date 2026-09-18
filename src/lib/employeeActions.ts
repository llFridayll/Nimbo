"use server";

import { revalidatePath } from "next/cache";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "./db";
import { getCurrentUser, requireAdmin } from "./dal";
import { hashPassword, verifyPassword } from "./passwords";
import { logActivity } from "./activityLog";

const EMPLOYEES_PATH = "/admin/employees";

const CreateEmployeeSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "ชื่อผู้ใช้ต้องมีอย่างน้อย 3 ตัวอักษร")
    .regex(/^[a-zA-Z0-9._-]+$/, "ใช้ได้เฉพาะตัวอักษรภาษาอังกฤษ ตัวเลข และ . _ -"),
  displayName: z.string().trim().min(1, "กรอกชื่อพนักงาน"),
  password: z.string().min(6, "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร"),
  role: z.enum(UserRole),
});

export interface EmployeeFormState {
  error?: string;
}

export async function createEmployee(_state: EmployeeFormState, formData: FormData): Promise<EmployeeFormState> {
  const admin = await requireAdmin();

  const validated = CreateEmployeeSchema.safeParse({
    username: formData.get("username"),
    displayName: formData.get("displayName"),
    password: formData.get("password"),
    role: formData.get("role"),
  });
  if (!validated.success) {
    return { error: validated.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" };
  }
  const { username, displayName, password, role } = validated.data;

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) return { error: "มีชื่อผู้ใช้นี้อยู่แล้ว" };

  await prisma.user.create({
    data: { username, displayName, role, passwordHash: await hashPassword(password) },
  });
  await logActivity({ userId: admin.id, username: admin.username, action: "EMPLOYEE_CREATE", detail: `สร้างบัญชี ${username} (${displayName})` });
  revalidatePath(EMPLOYEES_PATH);
  return {};
}

/** Deactivating (rather than only offering hard delete) keeps the account's
 * history intact and is instantly reversible if someone toggles the wrong
 * row — hard delete is still offered separately for actually removing a
 * mistaken/duplicate account. */
export async function setEmployeeActive(userId: string, isActive: boolean) {
  const admin = await requireAdmin();
  if (!isActive) await guardNotLastAdmin(userId, admin.id, "ปิดใช้งาน");
  const target = await prisma.user.update({ where: { id: userId }, data: { isActive } });
  await logActivity({
    userId: admin.id,
    username: admin.username,
    action: isActive ? "EMPLOYEE_ACTIVATE" : "EMPLOYEE_DEACTIVATE",
    detail: `${isActive ? "เปิด" : "ปิด"}ใช้งานบัญชี ${target.username} (${target.displayName})`,
  });
  revalidatePath(EMPLOYEES_PATH);
}

export async function deleteEmployee(userId: string) {
  const admin = await requireAdmin();
  await guardNotLastAdmin(userId, admin.id, "ลบ");
  const target = await prisma.user.delete({ where: { id: userId } });
  await logActivity({
    userId: admin.id,
    username: admin.username,
    action: "EMPLOYEE_DELETE",
    detail: `ลบบัญชี ${target.username} (${target.displayName})`,
  });
  revalidatePath(EMPLOYEES_PATH);
}

const NewPasswordFields = {
  password: z.string().min(6, "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร"),
  confirmPassword: z.string(),
};

const ResetPasswordSchema = z
  .object(NewPasswordFields)
  .refine((data) => data.password === data.confirmPassword, { error: "รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน", path: ["confirmPassword"] });

/** Admin resetting a DIFFERENT employee's forgotten password — no "current
 * password" prompt since the admin doing the reset never knows it. Use
 * changeOwnPassword (below) for a user changing their own password, which
 * does require it. */
export async function resetEmployeePassword(userId: string, _state: EmployeeFormState, formData: FormData): Promise<EmployeeFormState> {
  const admin = await requireAdmin();
  if (userId === admin.id) return { error: "เปลี่ยนรหัสผ่านของตัวเองผ่านช่องด้านบน (ต้องยืนยันรหัสผ่านเดิม)" };

  const validated = ResetPasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!validated.success) return { error: validated.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" };

  const target = await prisma.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(validated.data.password) } });
  await logActivity({
    userId: admin.id,
    username: admin.username,
    action: "EMPLOYEE_PASSWORD_RESET",
    detail: `รีเซ็ตรหัสผ่านให้ ${target.username} (${target.displayName})`,
  });
  revalidatePath(EMPLOYEES_PATH);
  return {};
}

const ChangeOwnPasswordSchema = z
  .object({ currentPassword: z.string().min(1, "กรอกรหัสผ่านเดิม"), ...NewPasswordFields })
  .refine((data) => data.password === data.confirmPassword, { error: "รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน", path: ["confirmPassword"] });

/** The logged-in user changing their own password — requires the current
 * password so someone at an already-unlocked, unattended session can't
 * silently take over the account by changing its password. */
export async function changeOwnPassword(_state: EmployeeFormState, formData: FormData): Promise<EmployeeFormState> {
  const currentUser = await getCurrentUser();

  const validated = ChangeOwnPasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!validated.success) return { error: validated.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" };

  const user = await prisma.user.findUniqueOrThrow({ where: { id: currentUser.id } });
  if (!(await verifyPassword(validated.data.currentPassword, user.passwordHash))) {
    return { error: "รหัสผ่านเดิมไม่ถูกต้อง" };
  }

  await prisma.user.update({ where: { id: currentUser.id }, data: { passwordHash: await hashPassword(validated.data.password) } });
  await logActivity({ userId: currentUser.id, username: currentUser.username, action: "PASSWORD_CHANGE_SELF" });
  revalidatePath(EMPLOYEES_PATH);
  return {};
}

/** Blocks removing/deactivating your own account or the last remaining
 * admin — either would lock everyone out of user management with no way
 * back in short of editing the database directly. */
async function guardNotLastAdmin(targetUserId: string, actingAdminId: string, action: "ลบ" | "ปิดใช้งาน") {
  if (targetUserId === actingAdminId) {
    throw new Error(`ไม่สามารถ${action}บัญชีของตัวเองได้`);
  }
  const target = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (target?.role === UserRole.ADMIN) {
    const otherActiveAdmins = await prisma.user.count({
      where: { role: UserRole.ADMIN, isActive: true, id: { not: targetUserId } },
    });
    if (otherActiveAdmins === 0) {
      throw new Error(`ไม่สามารถ${action}ผู้ดูแลระบบคนสุดท้ายได้`);
    }
  }
}
