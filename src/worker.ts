/**
 * Cloudflare Worker — proxies CSV data requests to GitHub raw files,
 * stripping all upstream cache headers and replacing them with
 * Cache-Control: no-store so Cloudflare's edge never caches the response.
 *
 * Route: /api/traffic-csv/<filename>  →  raw.githubusercontent.com/…/<filename>
 *
 * This mirrors the Vite dev-server proxy in vite.config.ts so behaviour is
 * identical between localhost and production.
 */

const GITHUB_RAW_BASE =
  "https://raw.githubusercontent.com/thecont1/blr-traffic-monitor/main";

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  "Pragma":        "no-cache",
  "Expires":       "0",
};

interface Env {}
interface CFContext { waitUntil(p: Promise<unknown>): void; passThroughOnException(): void; }

export default {
  async fetch(request: Request, _env: Env, _ctx: CFContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/traffic-csv/")) {
      // Strip the proxy prefix to get the bare filename (e.g. csv-bangalore_traffic.csv)
      const filename = url.pathname.replace(/^\/api\/traffic-csv\//, "");
      if (!filename) {
        return new Response("Not Found", { status: 404 });
      }

      // Forward to GitHub, ignoring any query params (they're only for cache-busting)
      const upstreamUrl = `${GITHUB_RAW_BASE}/${filename}`;

      const upstream = await fetch(upstreamUrl, {
        // Tell Cloudflare's own fetch not to use its cache for this subrequest
        cf: { cacheEverything: false, cacheTtl: 0 },
        headers: { "User-Agent": "TraffiCOracle/1.0" },
      } as RequestInit & { cf?: { cacheEverything: boolean; cacheTtl: number } });

      if (!upstream.ok) {
        return new Response(`Upstream error: HTTP ${upstream.status}`, {
          status: upstream.status,
        });
      }

      // Rebuild the response, replacing every cache-related header
      const newHeaders = new Headers(upstream.headers);
      for (const [k, v] of Object.entries(NO_CACHE_HEADERS)) {
        newHeaders.set(k, v);
      }
      // Allow the browser to read the response (CORS for same-origin Workers is implicit,
      // but set it explicitly for safety)
      newHeaders.set("Access-Control-Allow-Origin", "*");

      return new Response(upstream.body, {
        status:  upstream.status,
        headers: newHeaders,
      });
    }

    // All other requests: fall through to the static SPA assets
    return fetch(request);
  },
};
