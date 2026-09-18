import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Without this, Turbopack walks up from this directory looking for a
  // workspace root and finds a package-lock.json under $HOME, which it
  // correctly refuses to treat as root (see the warning this used to print)
  // but then keeps walking further up toward the filesystem root "/" —
  // which on this machine hangs the dev server at startup entirely instead
  // of just printing the warning. Pinning the root here stops the walk.
  turbopack: {
    root: path.resolve(__dirname),
  },
  // Server Actions default to a 1MB request body cap — too small for
  // Shopee/Lazada order-export files (a few MB isn't unusual once a shop has
  // a lot of orders in the date range), so the manual-import upload form
  // (src/lib/shopeeImportActions.ts) needs this raised.
  experimental: {
    serverActions: {
      bodySizeLimit: "20mb",
    },
  },
  // Lets the dev server accept cross-origin requests (RSC/HMR fetches
  // included) when the app is opened through the ngrok tunnel used to test
  // the TikTok Shop OAuth callback — without this, client-side navigations
  // (e.g. picking a filter dropdown) silently fail when accessed via that
  // host, even though direct/localhost access works fine.
  allowedDevOrigins: ["scope-track-mobile.ngrok-free.dev"],
  async headers() {
    if (process.env.NODE_ENV === "production") return [];
    // Turbopack's dev-mode static chunks (/_next/static/chunks/...) keep the
    // same filename across rebuilds and dev-server restarts instead of a
    // content hash, but still ship with a cacheable Cache-Control header.
    // Safari in particular then keeps serving an old cached CSS/JS chunk
    // after a code change or server restart even on a hard refresh — so in
    // dev, force these to always be refetched.
    return [
      {
        source: "/_next/static/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },
};

export default nextConfig;
