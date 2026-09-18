import { Platform } from "@prisma/client";

// The full set of sales channels this seller runs, keyed by which platforms
// each one sells on. River Floor is Shopee-only — no Lazada storefront.
const SHOPEE_SHOPS = ["Kgarden", "รั้วตราไก่", "Thai Euro Fence", "Thai Euro Kool", "River Floor"];
const LAZADA_SHOPS = ["Kgarden", "รั้วตราไก่", "Thai Euro Fence", "Thai Euro Kool"];

export interface DetectedImportTarget {
  platform: Platform;
  /** Canonical spelling from the lists above, regardless of the casing
   * actually used in the filename. */
  shopName: string;
}

/** Reads which platform and shop a manually-uploaded order-export file is
 * for, straight from its filename — "SP-{shop}..." for Shopee,
 * "LZD-{shop}..." for Lazada, whatever follows the shop name (a date range,
 * "Order.all...", anything) is ignored. Matching is case-insensitive.
 * Used by both the web upload form and the LINE file-import flow so a
 * shop/platform never has to be typed in by hand. */
export function detectImportFileTarget(fileName: string): DetectedImportTarget | null {
  const lower = fileName.trim().toLowerCase();

  if (lower.startsWith("sp-")) {
    const rest = lower.slice(3);
    const shopName = SHOPEE_SHOPS.find((s) => rest.startsWith(s.toLowerCase()));
    return shopName ? { platform: Platform.SHOPEE, shopName } : null;
  }

  if (lower.startsWith("lzd-")) {
    const rest = lower.slice(4);
    const shopName = LAZADA_SHOPS.find((s) => rest.startsWith(s.toLowerCase()));
    return shopName ? { platform: Platform.LAZADA, shopName } : null;
  }

  return null;
}

/** Human-readable list of recognized shop names, for error messages. */
export function knownShopNamesLabel(): string {
  return SHOPEE_SHOPS.join(", ");
}
