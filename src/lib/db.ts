import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

// Cached in production too, not only to survive dev hot reloads: next build
// splits the server into several bundles (pages, route handlers,
// instrumentation's scheduler), each with its own copy of this module. Without
// the global each made its own client and its own pool — measured 2026-10-12,
// the live server held 9 connections of the Supabase pooler's 15 instead of 3.
globalForPrisma.prisma = prisma;
