import crypto from "crypto";
import { TikTokAuthorization } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSetting, setSetting } from "@/lib/settings";

const API_BASE = process.env.TIKTOK_SHOP_API_BASE ?? "https://open-api.tiktokglobalshop.com";

const OAUTH_STATE_SETTING_KEY = "tiktok_oauth_pending_state";
// The merchant clicking "Authorize" and TikTok redirecting back to
// /api/tiktok/callback should take seconds, not minutes — a generous margin
// in case they're slow to click, without leaving a stale state usable long
// after the real attempt would have finished.
const OAUTH_STATE_MAX_AGE_MS = 10 * 60 * 1000;

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

/** TikTok Shop Partner API request signing: HMAC-SHA256(app_secret, path + sorted(query) + body?) -> hex.
 * Only applies to open-api.tiktokglobalshop.com calls — the OAuth token/refresh
 * endpoints below are plain query-param GETs, not signed. */
export function signPartnerRequest(path: string, params: Record<string, string>, body?: string): string {
  const appSecret = requireEnv("TIKTOK_SHOP_APP_SECRET");
  const sortedKeys = Object.keys(params).sort();
  const paramString = sortedKeys.map((k) => `${k}${params[k]}`).join("");
  const signBase = `${appSecret}${path}${paramString}${body ?? ""}${appSecret}`;
  return crypto.createHmac("sha256", appSecret).update(signBase).digest("hex");
}

export function buildPartnerUrl(path: string, extraParams: Record<string, string> = {}, body?: string): string {
  const appKey = requireEnv("TIKTOK_SHOP_APP_KEY");
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const params: Record<string, string> = { app_key: appKey, timestamp, ...extraParams };
  const sign = signPartnerRequest(path, params, body);
  const query = new URLSearchParams({ ...params, sign });
  return `${API_BASE}${path}?${query.toString()}`;
}

/** Where a merchant is sent to click "Authorize" and connect their shop to this app. */
export function buildAuthorizeUrl(state: string): string {
  const authorizeUrl = requireEnv("TIKTOK_SHOP_AUTHORIZE_URL");
  const serviceId = requireEnv("TIKTOK_SHOP_SERVICE_ID");
  const url = new URL(authorizeUrl);
  url.searchParams.set("service_id", serviceId);
  url.searchParams.set("state", state);
  return url.toString();
}

/** Issues a fresh CSRF state for one in-flight "Authorize" attempt, stashed
 * in AppSetting since this pre-login OAuth flow has no session to carry it
 * in — only one admin is ever expected to be mid-setup at a time, so a
 * single stored value (rather than a per-user store) is enough. */
export async function issueOAuthState(): Promise<string> {
  const state = crypto.randomBytes(16).toString("hex");
  await setSetting(OAUTH_STATE_SETTING_KEY, JSON.stringify({ state, createdAt: new Date().toISOString() }));
  return state;
}

/** One-time check for the /api/tiktok/callback redirect: clears the pending
 * state regardless of outcome (so a replayed/stale callback URL can never
 * succeed twice even if the comparison below has a bug), and returns true
 * only if `candidate` matches the state issued for a still-fresh
 * in-flight attempt — the actual CSRF protection on this OAuth flow. */
export async function consumeOAuthState(candidate: string | null): Promise<boolean> {
  const raw = await getSetting(OAUTH_STATE_SETTING_KEY);
  await setSetting(OAUTH_STATE_SETTING_KEY, "");
  if (!candidate || !raw) return false;
  try {
    const pending = JSON.parse(raw) as { state: string; createdAt: string };
    const isFresh = Date.now() - new Date(pending.createdAt).getTime() < OAUTH_STATE_MAX_AGE_MS;
    return isFresh && pending.state === candidate;
  } catch {
    return false;
  }
}

interface TokenResponse {
  code: number;
  message: string;
  data?: {
    access_token: string;
    access_token_expire_in: number;
    refresh_token: string;
    refresh_token_expire_in: number;
    seller_name?: string;
  };
}

/** Exchanges the `code` TikTok appended to our redirect_uri for a real access/refresh token pair. */
export async function exchangeCodeForToken(code: string) {
  const url = new URL(requireEnv("TIKTOK_SHOP_TOKEN_URL"));
  url.searchParams.set("app_key", requireEnv("TIKTOK_SHOP_APP_KEY"));
  url.searchParams.set("app_secret", requireEnv("TIKTOK_SHOP_APP_SECRET"));
  url.searchParams.set("auth_code", code);
  url.searchParams.set("grant_type", "authorized_code");

  const res = await fetch(url.toString());
  const json = (await res.json()) as TokenResponse;
  if (!res.ok || !json.data) {
    throw new Error(`TikTok token exchange failed: ${json.message ?? res.statusText}`);
  }
  return json.data;
}

async function refreshToken(refreshTokenValue: string) {
  const url = new URL(requireEnv("TIKTOK_SHOP_REFRESH_URL"));
  url.searchParams.set("app_key", requireEnv("TIKTOK_SHOP_APP_KEY"));
  url.searchParams.set("app_secret", requireEnv("TIKTOK_SHOP_APP_SECRET"));
  url.searchParams.set("refresh_token", refreshTokenValue);
  url.searchParams.set("grant_type", "refresh_token");

  const res = await fetch(url.toString());
  const json = (await res.json()) as TokenResponse;
  if (!res.ok || !json.data) {
    throw new Error(`TikTok token refresh failed: ${json.message ?? res.statusText}`);
  }
  return json.data;
}

interface AuthorizedShop {
  id: string;
  cipher: string;
  name?: string;
  region?: string;
}

/** After getting an access token, TikTok requires a separate call to find out
 * which shop(s) it was actually granted for — the token alone doesn't say. */
async function fetchAuthorizedShops(accessToken: string): Promise<AuthorizedShop[]> {
  const path = "/authorization/202309/shops";
  const url = buildPartnerUrl(path);
  const res = await fetch(url, { headers: { "x-tts-access-token": accessToken } });
  if (!res.ok) throw new Error(`Failed to list authorized TikTok shops: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { data?: { shops?: { id: string; cipher: string; name?: string; region?: string }[] } };
  return (json.data?.shops ?? []).map((s) => ({ id: s.id, cipher: s.cipher, name: s.name, region: s.region }));
}

/** Full callback handler logic: trade the auth code for tokens, discover which
 * shop(s) it covers, and persist everything so the adapter can use it later. */
export async function completeAuthorization(code: string) {
  const tokenData = await exchangeCodeForToken(code);

  const authorization = await prisma.tikTokAuthorization.create({
    data: {
      accessToken: tokenData.access_token,
      accessTokenExpireAt: new Date(tokenData.access_token_expire_in * 1000),
      refreshToken: tokenData.refresh_token,
      refreshTokenExpireAt: new Date(tokenData.refresh_token_expire_in * 1000),
      sellerName: tokenData.seller_name,
    },
  });

  const shops = await fetchAuthorizedShops(tokenData.access_token);
  for (const shop of shops) {
    await prisma.tikTokShop.upsert({
      where: { shopId: shop.id },
      create: {
        shopId: shop.id,
        shopCipher: shop.cipher,
        shopName: shop.name,
        region: shop.region,
        authorizationId: authorization.id,
      },
      update: {
        shopCipher: shop.cipher,
        shopName: shop.name,
        region: shop.region,
        authorizationId: authorization.id,
      },
    });
  }

  return { authorization, shops };
}

const REFRESH_MARGIN_MS = 10 * 60 * 1000; // refresh 10 min before expiry

/** Refreshes one TikTokAuthorization row if it's close to expiring and
 * persists the new tokens. Returns the (possibly unchanged) row. */
async function refreshIfNeeded(authorization: TikTokAuthorization): Promise<TikTokAuthorization> {
  if (authorization.accessTokenExpireAt.getTime() - Date.now() >= REFRESH_MARGIN_MS) return authorization;

  const refreshed = await refreshToken(authorization.refreshToken);
  return prisma.tikTokAuthorization.update({
    where: { id: authorization.id },
    data: {
      accessToken: refreshed.access_token,
      accessTokenExpireAt: new Date(refreshed.access_token_expire_in * 1000),
      refreshToken: refreshed.refresh_token,
      refreshTokenExpireAt: new Date(refreshed.refresh_token_expire_in * 1000),
    },
  });
}

export interface TikTokShopCredentials {
  accessToken: string;
  shopCipher: string;
  shopId: string;
  shopName: string | null;
}

/** Ready-to-use credentials for every connected TikTok Shop store — a seller
 * can run more than one shop under the same account, and each needs its own
 * shop_cipher on every Partner API call. Refreshes each shop's access token
 * first if it's close to expiring (shops sharing one OAuth grant only get
 * refreshed once). Returns an empty array if nothing has been authorized. */
export async function getAllTikTokShopCredentials(): Promise<TikTokShopCredentials[]> {
  const shops = await prisma.tikTokShop.findMany({ include: { authorization: true } });
  const refreshedById = new Map<string, TikTokAuthorization>();

  const credentials: TikTokShopCredentials[] = [];
  for (const shop of shops) {
    let authorization = refreshedById.get(shop.authorizationId) ?? shop.authorization;
    authorization = await refreshIfNeeded(authorization);
    refreshedById.set(shop.authorizationId, authorization);
    credentials.push({
      accessToken: authorization.accessToken,
      shopCipher: shop.shopCipher,
      shopId: shop.shopId,
      shopName: shop.shopName,
    });
  }
  return credentials;
}

/** Same idea as getAllTikTokShopCredentials but for one specific shop — used
 * where an order already tells us which shop it came from (e.g. printing its
 * shipping label). Returns null if that shop isn't connected. */
export async function getTikTokCredentialsForShop(shopId: string): Promise<TikTokShopCredentials | null> {
  const shop = await prisma.tikTokShop.findUnique({ where: { shopId }, include: { authorization: true } });
  if (!shop) return null;

  const authorization = await refreshIfNeeded(shop.authorization);
  return { accessToken: authorization.accessToken, shopCipher: shop.shopCipher, shopId: shop.shopId, shopName: shop.shopName };
}

/** Convenience for call sites that only ever dealt with one shop — the first
 * connected shop's credentials, or null if none are connected yet. */
export async function getValidTikTokCredentials(): Promise<TikTokShopCredentials | null> {
  const [first] = await getAllTikTokShopCredentials();
  return first ?? null;
}
