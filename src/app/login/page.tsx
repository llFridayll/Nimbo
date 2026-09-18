"use client";

import Image from "next/image";
import { useActionState } from "react";
import { login, type LoginState } from "@/lib/authActions";
import { PasswordInput } from "@/components/PasswordInput";

const initialState: LoginState = {};

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F5F7FA] px-4 dark:bg-slate-950">
      <div className="w-full max-w-sm">
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="mb-6 flex flex-col items-center text-center">
            <Image src="/nimbo-logo-icon.png" alt="Nimbo" width={48} height={48} className="h-12 w-12" priority />
            <h1 className="mt-3 text-xl font-bold text-primary dark:text-gray-100">Nimbo</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">ระบบจัดการออเดอร์หลายช่องทาง</p>
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">สำหรับเจ้าหน้าที่ที่ได้รับอนุญาต</p>
          </div>

          <form action={formAction} className="space-y-4">
            <div>
              <label htmlFor="username" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                ชื่อผู้ใช้
              </label>
              <input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                required
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
              />
            </div>
            <div>
              <label htmlFor="password" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                รหัสผ่าน
              </label>
              <PasswordInput
                id="password"
                name="password"
                autoComplete="current-password"
                required
                inputClassName="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
              />
            </div>

            {state.error && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                {state.error}
              </p>
            )}

            <button
              type="submit"
              disabled={pending}
              className="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
            >
              {pending ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
            </button>
          </form>
        </div>

        <div className="mt-4 text-center text-xs text-gray-400 dark:text-gray-500">
          <p>Nimbo v1.0</p>
          <p className="mt-0.5">มีปัญหาการเข้าใช้งาน? ติดต่อผู้ดูแลระบบ</p>
        </div>
      </div>
    </div>
  );
}
