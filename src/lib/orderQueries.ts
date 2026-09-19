import { OrderStatus, Platform, Prisma } from "@prisma/client";
import { prisma } from "./db";

export interface ListOrdersParams {
  status?: OrderStatus;
  platform?: Platform;
  /** For platforms with multiple stores per seller account (currently TikTok
   * Shop only) — narrows to one specific store. */
  shopId?: string;
  /** Only include orders placed on/after this date. Omit for all time. */
  fromDate?: Date;
  /** Only include orders placed on/before this date (inclusive, e.g. end of day). */
  toDate?: Date;
  page?: number;
  pageSize?: number;
}

/** Every Order scalar EXCEPT `rawPayload`.
 *
 * `rawPayload` is the untouched platform response — it averages ~2.3KB per
 * order and is 12MB of the Order table's 20MB. Prisma has no "all columns
 * except" syntax, so a plain findMany/include drags it across the wire on
 * every single row even though only the product-price page ever reads it
 * (productStats.getProductPriceHistory, which asks for it explicitly). It
 * also carries unmasked buyer details, so keeping it out of list responses
 * is the same direction as the "remove customer data from tracking" work. */
const ORDER_SCALARS_WITHOUT_RAW_PAYLOAD = {
  id: true,
  platform: true,
  platformOrderId: true,
  status: true,
  buyerName: true,
  buyerPhone: true,
  buyerUsername: true,
  buyerRegion: true,
  totalAmount: true,
  currency: true,
  orderDate: true,
  shippingCarrier: true,
  trackingNumber: true,
  shippingStatus: true,
  printedAt: true,
  shopId: true,
  shopName: true,
  isUnpaid: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.OrderSelect;

/** Just the columns an order *table row* renders. The orders page shows 100
 * rows at a time and displays no line items and no problem ticket, so
 * fetching those relations (and rawPayload) was pure waste: measured against
 * the live database, 100 rows took 2448ms with `include: { items, problem }`
 * and 217ms with this select. */
const ORDER_ROW_SELECT = {
  id: true,
  platform: true,
  platformOrderId: true,
  buyerName: true,
  totalAmount: true,
  currency: true,
  trackingNumber: true,
  orderDate: true,
  status: true,
} satisfies Prisma.OrderSelect;

export type OrderRow = Prisma.OrderGetPayload<{ select: typeof ORDER_ROW_SELECT }>;

function buildOrderWhere({ status, platform, shopId, fromDate, toDate }: ListOrdersParams): Prisma.OrderWhereInput {
  const where: Prisma.OrderWhereInput = {};
  if (status) where.status = status;
  if (platform) where.platform = platform;
  if (shopId) where.shopId = shopId;
  if (fromDate || toDate) {
    where.orderDate = {};
    if (fromDate) where.orderDate.gte = fromDate;
    if (toDate) where.orderDate.lte = toDate;
  }
  return where;
}

export interface OrderRowsPage {
  orders: OrderRow[];
  /** Total rows matching the filter across ALL pages — what the pager and
   * the "แสดง X–Y จาก N" caption need. Without it the page used to render a
   * hard cap of 100 rows with no hint that 5,600 more existed. */
  total: number;
  page: number;
  pageSize: number;
}

/** One page of order rows for the orders table — no line items, no problem
 * ticket, no rawPayload. Use this for anything that renders a list; use
 * listOrders() only when the caller genuinely needs the relations. The count
 * runs in parallel with the page fetch, so it costs no extra wall-clock. */
export async function listOrderRows(params: ListOrdersParams): Promise<OrderRowsPage> {
  const { page = 1, pageSize = 20 } = params;
  const where = buildOrderWhere(params);
  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { orderDate: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: ORDER_ROW_SELECT,
    }),
    prisma.order.count({ where }),
  ]);
  return { orders, total, page, pageSize };
}

/** Paginated orders *with* their line items and problem ticket, for callers
 * that actually read them (the JSON API). Still excludes rawPayload — see
 * ORDER_SCALARS_WITHOUT_RAW_PAYLOAD. */
export async function listOrders(params: ListOrdersParams) {
  const { page = 1, pageSize = 20 } = params;
  const where = buildOrderWhere(params);

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { orderDate: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: { ...ORDER_SCALARS_WITHOUT_RAW_PAYLOAD, items: true, problem: true },
    }),
    prisma.order.count({ where }),
  ]);

  return { orders, total, page, pageSize };
}
