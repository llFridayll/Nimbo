"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { UserRole } from "@prisma/client";
import { PasswordInput } from "@/components/PasswordInput";
import {
  changeOwnPassword,
  createEmployee,
  deleteEmployee,
  resetEmployeePassword,
  setEmployeeActive,
  type EmployeeFormState,
} from "@/lib/employeeActions";

const passwordFieldClass =
  "w-full rounded-md border border-gray-300 px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100";

export interface EmployeeRow {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
}

const initialState: EmployeeFormState = {};

function AddEmployeeForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(async (prev: EmployeeFormState, formData: FormData) => {
    const result = await createEmployee(prev, formData);
    if (!result.error) formRef.current?.reset();
    return result;
  }, initialState);

  return (
    <form ref={formRef} action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">ชื่อผู้ใช้</label>
        <input
          name="username"
          required
          autoComplete="off"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">ชื่อพนักงาน</label>
        <input
          name="displayName"
          required
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">รหัสผ่านเริ่มต้น</label>
        <input
          name="password"
          type="text"
          required
          autoComplete="off"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">สิทธิ์</label>
        <select
          name="role"
          defaultValue={UserRole.STAFF}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
        >
          <option value={UserRole.STAFF}>พนักงาน</option>
          <option value={UserRole.ADMIN}>ผู้ดูแลระบบ</option>
        </select>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="h-fit rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover disabled:opacity-60"
      >
        {pending ? "กำลังเพิ่ม..." : "+ เพิ่มพนักงาน"}
      </button>
      {state.error && <p className="text-sm text-red-600 sm:col-span-2 lg:col-span-5">{state.error}</p>}
    </form>
  );
}

/** Admin resetting someone ELSE's forgotten password — no old-password
 * prompt (the admin doing this never knows it), but still asks for the new
 * password twice so a typo doesn't lock the employee out silently. */
function ResetPasswordForm({ userId, onDone }: { userId: string; onDone: () => void }) {
  const [state, formAction, pending] = useActionState(async (prevState: EmployeeFormState, formData: FormData) => {
    const result = await resetEmployeePassword(userId, prevState, formData);
    if (!result.error) onDone();
    return result;
  }, initialState);

  return (
    <form action={formAction} className="mt-2 flex flex-wrap items-center gap-2">
      <input name="password" type="text" placeholder="รหัสผ่านใหม่" required autoComplete="off" className={passwordFieldClass} />
      <input
        name="confirmPassword"
        type="text"
        placeholder="พิมพ์รหัสผ่านใหม่อีกครั้ง"
        required
        autoComplete="off"
        className={passwordFieldClass}
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-gray-800 px-3 py-1 text-xs font-medium text-white hover:bg-gray-700 disabled:opacity-60"
      >
        {pending ? "กำลังบันทึก..." : "ยืนยันรีเซ็ตรหัสผ่าน"}
      </button>
      <button type="button" onClick={onDone} className="text-xs text-gray-400 hover:text-gray-600">
        ยกเลิก
      </button>
      {state.error && <span className="w-full text-xs text-red-600">{state.error}</span>}
    </form>
  );
}

/** The logged-in admin changing their OWN password — requires the current
 * password first, since anyone at an unlocked, unattended session could
 * otherwise silently take over the account. */
function ChangeOwnPasswordForm({ onDone }: { onDone: () => void }) {
  const [state, formAction, pending] = useActionState(async (prevState: EmployeeFormState, formData: FormData) => {
    const result = await changeOwnPassword(prevState, formData);
    if (!result.error) onDone();
    return result;
  }, initialState);

  return (
    <form action={formAction} className="mt-2 flex flex-wrap items-center gap-2">
      <PasswordInput
        name="currentPassword"
        placeholder="รหัสผ่านเดิม"
        required
        autoComplete="current-password"
        wrapperClassName="w-full"
        inputClassName={passwordFieldClass}
      />
      <PasswordInput
        name="password"
        placeholder="รหัสผ่านใหม่"
        required
        autoComplete="new-password"
        wrapperClassName="w-full"
        inputClassName={passwordFieldClass}
      />
      <PasswordInput
        name="confirmPassword"
        placeholder="พิมพ์รหัสผ่านใหม่อีกครั้ง"
        required
        autoComplete="new-password"
        wrapperClassName="w-full"
        inputClassName={passwordFieldClass}
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-gray-800 px-3 py-1 text-xs font-medium text-white hover:bg-gray-700 disabled:opacity-60"
      >
        {pending ? "กำลังบันทึก..." : "ยืนยันเปลี่ยนรหัสผ่าน"}
      </button>
      <button type="button" onClick={onDone} className="text-xs text-gray-400 hover:text-gray-600">
        ยกเลิก
      </button>
      {state.error && <span className="w-full text-xs text-red-600">{state.error}</span>}
    </form>
  );
}

function EmployeeRowItem({ employee, isSelf }: { employee: EmployeeRow; isSelf: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [resettingPassword, setResettingPassword] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);

  function handleToggleActive() {
    setRowError(null);
    startTransition(async () => {
      try {
        await setEmployeeActive(employee.id, !employee.isActive);
      } catch (err) {
        setRowError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
      }
    });
  }

  function handleDelete() {
    if (!confirm(`ลบบัญชี "${employee.displayName}" ใช่ไหม?`)) return;
    setRowError(null);
    startTransition(async () => {
      try {
        await deleteEmployee(employee.id);
      } catch (err) {
        setRowError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
      }
    });
  }

  return (
    <li className="rounded-lg border border-gray-100 px-4 py-3 dark:border-gray-800">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium text-gray-800 dark:text-gray-200">{employee.displayName}</p>
            {isSelf && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500 dark:bg-gray-700 dark:text-gray-400">คุณ</span>}
            {!employee.isActive && (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                ปิดใช้งาน
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            @{employee.username} · {employee.role === UserRole.ADMIN ? "ผู้ดูแลระบบ" : "พนักงาน"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => setResettingPassword((v) => !v)}
            className="rounded-md border border-gray-200 px-2.5 py-1.5 font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            เปลี่ยนรหัสผ่าน
          </button>
          {!isSelf && (
            <>
              <button
                type="button"
                onClick={handleToggleActive}
                disabled={isPending}
                className="rounded-md border border-gray-200 px-2.5 py-1.5 font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                {employee.isActive ? "ปิดใช้งาน" : "เปิดใช้งาน"}
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isPending}
                className="rounded-md border border-red-200 px-2.5 py-1.5 font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
              >
                ลบ
              </button>
            </>
          )}
        </div>
      </div>
      {resettingPassword &&
        (isSelf ? (
          <ChangeOwnPasswordForm onDone={() => setResettingPassword(false)} />
        ) : (
          <ResetPasswordForm userId={employee.id} onDone={() => setResettingPassword(false)} />
        ))}
      {rowError && <p className="mt-2 text-xs text-red-600">{rowError}</p>}
    </li>
  );
}

export function EmployeeManager({ employees, currentUserId }: { employees: EmployeeRow[]; currentUserId: string }) {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <h2 className="mb-4 text-sm font-semibold text-gray-900 dark:text-gray-100">เพิ่มพนักงานใหม่</h2>
        <AddEmployeeForm />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <h2 className="mb-4 text-sm font-semibold text-gray-900 dark:text-gray-100">รายชื่อพนักงาน ({employees.length})</h2>
        <ul className="space-y-2">
          {employees.map((employee) => (
            <EmployeeRowItem key={employee.id} employee={employee} isSelf={employee.id === currentUserId} />
          ))}
        </ul>
      </div>
    </div>
  );
}
