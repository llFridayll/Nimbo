/** One storefront, and every spelling of its name seen in the data.
 *
 * The same shop is named differently on each platform — TikTok carries the
 * full storefront name the seller typed there, while Shopee/Lazada names come
 * from the import filename convention in platforms/importFileNaming.ts. Left
 * alone, "รั้วตาข่าย ตราไก่" and "รั้วตราไก่" group as two separate shops on
 * every report, which is the one thing a per-shop breakdown must not do.
 *
 * Verified against the 13 platform×shop combinations actually present in the
 * database (Sept 2026). A shop added later that isn't listed here still shows
 * up — it just appears under its raw name until someone adds it. */
export interface ShopBrand {
  key: string;
  label: string;
  /** Exact Order.shopName values that belong to this shop. */
  names: string[];
}

export const SHOP_BRANDS: ShopBrand[] = [
  { key: "tra-kai", label: "ตราไก่", names: ["รั้วตาข่าย ตราไก่", "รั้วตราไก่"] },
  { key: "kgarden", label: "Kgarden", names: ["Kgardenfence", "Kgarden"] },
  { key: "thai-euro-kool", label: "Thai Euro Kool", names: ["พัดลมอุตสาหกรรมไทยยูโรคูล", "Thai Euro Kool"] },
  { key: "thai-euro-fence", label: "Thai Euro Fence", names: ["รั้วเหล็กสำเร็จรูปไทยยูโรเฟนซ์", "Thai Euro Fence"] },
  { key: "river-floor", label: "River Floor", names: ["Thairiverfloor", "River Floor"] },
];

const BY_NAME = new Map<string, ShopBrand>(
  SHOP_BRANDS.flatMap((brand) => brand.names.map((n) => [n.trim().toLowerCase(), brand] as const)),
);

/** The shop a raw Order.shopName belongs to. An unknown name becomes a shop
 * of its own keyed by that name, so a newly connected store is visible on the
 * reports immediately rather than silently vanishing into "ไม่ระบุ". */
export function brandForShopName(shopName: string | null | undefined): { key: string; label: string } {
  if (!shopName) return { key: "__none__", label: "ไม่ระบุร้าน" };
  const known = BY_NAME.get(shopName.trim().toLowerCase());
  return known ? { key: known.key, label: known.label } : { key: shopName, label: shopName };
}

/** Every Order.shopName that counts as this shop — for turning a ?shop=<key>
 * filter into a database condition. Returns null for an unknown key so the
 * caller can fall back to matching the raw name. */
export function shopNamesForKey(key: string): string[] | null {
  const brand = SHOP_BRANDS.find((b) => b.key === key);
  return brand ? brand.names : null;
}
