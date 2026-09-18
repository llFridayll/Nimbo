import "server-only";
import { prisma } from "@/lib/db";

export async function getSkuAliasMap(): Promise<Map<string, string>> {
  const rows = await prisma.skuAlias.findMany();
  return new Map(rows.map((r) => [r.rawSku, r.displaySku]));
}

export function resolveDisplaySku(aliases: Map<string, string>, rawSku: string): string {
  return aliases.get(rawSku) ?? rawSku;
}
