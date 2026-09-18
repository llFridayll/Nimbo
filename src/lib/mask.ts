/** Masks a buyer name for the dashboard's at-a-glance recent-orders table
 * (e.g. "สมชาย ใจดี" -> "ส*****ี") — presentational only, `/orders` keeps
 * showing full names since that's a deliberate lookup/search context. */
export function maskBuyerName(name: string | null): string {
  if (!name || name.trim().length === 0) return "-";
  const trimmed = name.trim();
  if (trimmed.length <= 2) return `${trimmed.charAt(0)}*`;
  return `${trimmed.charAt(0)}${"*".repeat(trimmed.length - 2)}${trimmed.charAt(trimmed.length - 1)}`;
}
