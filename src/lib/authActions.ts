"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "./db";
import { verifyPassword } from "./passwords";
import { createSession, deleteSession, getSessionPayload } from "./session";
import { logActivity } from "./activityLog";

const LoginSchema = z.object({
  username: z.string().trim().min(1, "กรอกชื่อผู้ใช้ด้วยครับ"),
  password: z.string().min(1, "กรอกรหัสผ่านด้วยครับ"),
});

export interface LoginState {
  error?: string;
}

export async function login(_state: LoginState, formData: FormData): Promise<LoginState> {
  const validated = LoginSchema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
  });
  if (!validated.success) {
    return { error: validated.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" };
  }
  const { username, password } = validated.data;

  const user = await prisma.user.findUnique({ where: { username } });
  // Same generic error whether the username doesn't exist or the password is
  // wrong — don't help an attacker enumerate valid usernames.
  if (!user || !user.isActive || !(await verifyPassword(password, user.passwordHash))) {
    return { error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" };
  }

  await createSession(user.id, user.role);
  await logActivity({ userId: user.id, username: user.username, action: "LOGIN" });
  redirect("/");
}

export async function logout() {
  // Read who's logging out before the cookie is cleared.
  const session = await getSessionPayload();
  if (session?.userId) {
    const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { username: true } });
    if (user) await logActivity({ userId: session.userId, username: user.username, action: "LOGOUT" });
  }
  await deleteSession();
  redirect("/login");
}
