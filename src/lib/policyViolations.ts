"use server";

import { revalidatePath } from "next/cache";
import { Platform, ProblemPriority, ViolationSource } from "@prisma/client";
import { prisma } from "@/lib/db";

export async function createPolicyViolation(formData: FormData) {
  const platform = formData.get("platform") as Platform;
  const source = formData.get("source") as ViolationSource;
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const priority = formData.get("priority") as ProblemPriority;
  const occurredAtRaw = String(formData.get("occurredAt") ?? "");
  const evidenceUrl = String(formData.get("evidenceUrl") ?? "").trim();

  if (!title || !description) return;

  await prisma.policyViolation.create({
    data: {
      platform,
      source,
      title,
      description,
      priority: priority || ProblemPriority.MEDIUM,
      occurredAt: occurredAtRaw ? new Date(occurredAtRaw) : new Date(),
      evidenceUrl: evidenceUrl || null,
    },
  });

  revalidatePath("/problems");
}

export async function setViolationResolved(id: string, isResolved: boolean) {
  await prisma.policyViolation.update({
    where: { id },
    data: { isResolved, resolvedAt: isResolved ? new Date() : null },
  });
  revalidatePath("/problems");
}
