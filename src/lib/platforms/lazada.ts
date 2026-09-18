import { Platform } from "@prisma/client";
import { PlatformAdapter, NormalizedOrder } from "./types";

/**
 * Lazada Open Platform adapter.
 *
 * TODO(integration): no App Key/Secret configured yet. Once issued, set
 * LAZADA_APP_KEY / LAZADA_APP_SECRET / LAZADA_ACCESS_TOKEN in .env and
 * replace the calls below with real requests to
 * https://api.lazada.co.th/rest/order/get (HMAC-SHA256 signed, see Lazada
 * Open Platform docs). Keep the return shape identical to NormalizedOrder
 * so nothing downstream changes.
 */
export const lazadaAdapter: PlatformAdapter = {
  platform: Platform.LAZADA,

  isConfigured() {
    return Boolean(
      process.env.LAZADA_APP_KEY && process.env.LAZADA_APP_SECRET && process.env.LAZADA_ACCESS_TOKEN
    );
  },

  async fetchRecentOrders(): Promise<NormalizedOrder[]> {
    if (this.isConfigured()) {
      // TODO(integration): call Lazada's /order/get + /order/items/get
      throw new Error("Lazada credentials detected but real adapter not implemented yet.");
    }
    // Not connected — no orders, rather than manufacturing sample data.
    return [];
  },

  async fetchOrderById(): Promise<NormalizedOrder | null> {
    return null;
  },

  normalizeWebhookPayload(): NormalizedOrder | null {
    // TODO(integration): map Lazada's order status webhook payload here.
    return null;
  },
};
