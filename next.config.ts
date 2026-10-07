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
  // Hosts the dev server will accept requests from. Next blocks cross-origin
  // requests to dev-only assets and endpoints by default and only trusts
  // `localhost`, so any OTHER host serving the same dev server gets a bare
  // 403 "Unauthorized" on /_next/* — the page still renders, but HMR and the
  // client-side fetches behind every button die silently, which looks exactly
  // like "the button does nothing".
  //
  // - the ngrok tunnel: used to test the TikTok Shop OAuth callback.
  // - the LAN address: staff open this from other machines/phones on the
  //   office network (e.g. http://192.168.1.120:3000). The wildcard covers
  //   the whole 192.168.1.x subnet so a DHCP lease change doesn't silently
  //   break every button again; it is matched segment-by-segment, so
  //   "192.168.1.*" matches 192.168.1.120 but nothing outside that subnet.
  // - "*.local": the Bonjour/mDNS name this Mac already advertises
  //   (MacBook-Pro-khxng-Thanawut.local). The IP above is a DHCP lease and
  //   really does move — it went from .172 to .95 inside one day — which
  //   breaks every bookmark staff have. The .local name follows the machine
  //   instead of the lease, so it is the address worth handing out.
  //
  // Dev-only — `next start` does not apply this blocking.
  allowedDevOrigins: ["scope-track-mobile.ngrok-free.dev", "192.168.1.*", "*.local"],
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
