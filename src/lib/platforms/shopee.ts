import { Platform } from "@prisma/client";
import { PlatformAdapter, NormalizedOrder } from "./types";

/**
 * Shopee Open Platform adapter.
 *
 * TODO(integration): no Partner ID / App Key-Secret configured yet. Once
 * issued, set SHOPEE_PARTNER_ID / SHOPEE_PARTNER_KEY / SHOPEE_SHOP_ID /
 * SHOPEE_ACCESS_TOKEN in .env and replace the calls below with real
 * requests to https://partner.shopeemobile.com/api/v2/order/get_order_list
 * (HMAC-SHA256 signed, see Shopee Open Platform docs). Keep the return shape
 * identical to NormalizedOrder so nothing downstream changes.
 */
export const shopeeAdapter: PlatformAdapter = {
  platform: Platform.SHOPEE,

  isConfigured() {
    return Boolean(
      process.env.SHOPEE_PARTNER_ID &&
        process.env.SHOPEE_PARTNER_KEY &&
        process.env.SHOPEE_SHOP_ID &&
        process.env.SHOPEE_ACCESS_TOKEN
    );
  },

  async fetchRecentOrders(): Promise<NormalizedOrder[]> {
    if (this.isConfigured()) {
      // TODO(integration): call Shopee's order/get_order_list + order/get_order_detail
      throw new Error("Shopee credentials detected but real adapter not implemented yet.");
    }
    // Not connected — no orders, rather than manufacturing sample data.
    return [];
  },

  async fetchOrderById(): Promise<NormalizedOrder | null> {
    return null;
  },

  normalizeWebhookPayload(): NormalizedOrder | null {
    // TODO(integration): map Shopee's push/order_status_push payload here.
    return null;
  },
};
