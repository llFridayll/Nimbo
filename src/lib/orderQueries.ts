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

export async function listOrders({
  status,
  platform,
  shopId,
  fromDate,
  toDate,
  page = 1,
  pageSize = 20,
}: ListOrdersParams) {
  const where: Prisma.OrderWhereInput = {};
  if (status) where.status = status;
  if (platform) where.platform = platform;
  if (shopId) where.shopId = shopId;
  if (fromDate || toDate) {
    where.orderDate = {};
    if (fromDate) where.orderDate.gte = fromDate;
    if (toDate) where.orderDate.lte = toDate;
  }

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { orderDate: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { items: true, problem: true },
    }),
    prisma.order.count({ where }),
  ]);

  return { orders, total, page, pageSize };
}
