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
  "https://raw.githubusercontent.com/thecont1/traffic-monitor-lizard/main";

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  "Pragma":        "no-cache",
  "Expires":       "0",
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

interface Env {
  FP_EVENTS: KVNamespace;
  FP_API_KEY: string;
}
interface CFContext { waitUntil(p: Promise<unknown>): void; passThroughOnException(): void; }

export default {
  async fetch(request: Request, env: Env, _ctx: CFContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/fp-ingest") {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
      }
      if (request.method === "POST") {
        try {
          const body = await request.json() as {
            visitor_id: string; confidence: number; kind: string;
            request_id: string; page: string; ts: string;
          };

          if (!body.visitor_id || typeof body.confidence !== "number") {
            return new Response(JSON.stringify({ error: "invalid" }), {
              status: 400, headers: { "Content-Type": "application/json", ...CORS_HEADERS },
            });
          }

          // Store in KV with TTL of 90 days (7776000 seconds)
          const key = `${body.ts}::${body.visitor_id}`;
          await env.FP_EVENTS.put(key, JSON.stringify(body), {
            expirationTtl: 7_776_000,
          });

          return new Response(JSON.stringify({ ok: true }), {
            status: 200, headers: { "Content-Type": "application/json", ...CORS_HEADERS },
          });
        } catch {
          return new Response(JSON.stringify({ error: "bad request" }), {
            status: 400, headers: { "Content-Type": "application/json", ...CORS_HEADERS },
          });
        }
      }
      return new Response(JSON.stringify({ error: "method not allowed" }), {
        status: 405, headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }

    if (url.pathname.startsWith("/api/traffic-csv/")) {
      // Strip the proxy prefix to get the bare filename (e.g. csv-bangalore_traffic.csv)
      const filename = url.pathname.replace(/^\/api\/traffic-csv\//, "");
      if (!filename) {
        return new Response("Not Found", { status: 404 });
      }

      // Forward to GitHub, prepending data/ directory
      const upstreamUrl = `${GITHUB_RAW_BASE}/data/${filename}`;

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
