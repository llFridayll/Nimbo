import { Platform } from "@prisma/client";
import { PlatformAdapter } from "./types";
import { tiktokAdapter } from "./tiktok";
import { shopeeAdapter } from "./shopee";
import { lazadaAdapter } from "./lazada";

export const adapters: Record<Platform, PlatformAdapter> = {
  [Platform.TIKTOK]: tiktokAdapter,
  [Platform.SHOPEE]: shopeeAdapter,
  [Platform.LAZADA]: lazadaAdapter,
};

export const allAdapters = Object.values(adapters);

export * from "./types";
