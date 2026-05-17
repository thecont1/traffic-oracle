# Plan: TrafficNOW! Live Polling System

## Goal

Make the TrafficNOW! pane auto-refresh every 10 minutes so it shows near-real-time
speed estimates — turning the dashboard into a genuine planning tool for the public.

## Current architecture

```
GitHub Actions (every 30 min)
  → traffic_snapshot.py (Selenium → Google Maps)
  → appends rows to csv-bangalore_traffic.csv
  → commits to GitHub repo

TraffiCOracle (client-side, zero-backend)
  → fetches full CSV from raw.githubusercontent.com on mount
  → Papa.parse → TrafficRow[] (63k rows, ~2.5 MB uncompressed)
  → computeAllRouteCards() finds most recent row per route = liveSpeed
  → NO polling — manual Refresh button only
```

## Key research findings

- `raw.githubusercontent.com` supports **ETag** headers → conditional fetch works
  (304 Not Modified = zero download when file hasn't changed)
- `cache-control: max-age=300` → GitHub CDN caches for 5 minutes
- File size: **2.66 MB** uncompressed, ~250–300 KB gzipped
- Scraper runs at IST :10 and :40 each hour (every 30 min)
- Routes CSV is static (never changes after initial load)

## Proposed approach

**Conditional polling with ETag tracking** — poll every 10 minutes, but only
re-download the CSV when GitHub indicates it has changed (via 304 vs 200).
When unchanged, the poll is essentially free (just an HTTP HEAD-like round-trip).

### Why not just re-fetch blindly?

| Approach | Download per poll | Effective bandwidth |
|---|---|---|
| Blind re-fetch every 10 min | 2.5 MB × 6/hr = 15 MB/hr | Wasteful |
| Conditional (ETag) | 0 bytes (304) most polls; 2.5 MB when changed | ~2.5 MB/hr max |
| Tail-only (Range request) | ~50 KB | Best, but GitHub doesn't support Range |

Conditional fetch is the sweet spot: zero waste when data hasn't changed,
full freshness when it has.

## Step-by-step plan

### Phase 1: Conditional fetch infrastructure

**1.1 Modify `fetchTrafficData` to return ETag + support conditional requests**

File: `src/lib/useTrafficData.ts`

- Add a module-level `Map<string, string>` to store ETags per URL
- Modify `fetchCsv()` to send `If-None-Match` header when an ETag is cached
- On 304 response: return `null` (no data change)
- On 200 response: store new ETag, return parsed data
- Return type becomes `{ routes, allRows, rowCount, etags, notModified }`

```ts
// Pseudocode for the conditional fetch:
const etagMap = new Map<string, string>();

async function fetchCsv(url: string, signal?: AbortSignal) {
  const prevEtag = etagMap.get(url);
  const headers: Record<string, string> = {
    Accept: "text/plain,*/*",
    ...(prevEtag ? { "If-None-Match": prevEtag } : {}),
  };
  const resp = await fetch(bust(url), { cache: "no-store", signal, headers });
  if (resp.status === 304) return null; // not modified
  const newEtag = resp.headers.get("etag");
  if (newEtag) etagMap.set(url, newEtag);
  const text = await resp.text();
  // ... parse as before
}
```

**1.2 Split initial fetch vs. incremental refresh**

File: `src/lib/useTrafficData.ts`

- `fetchTrafficData()` remains for initial full load (unchanged)
- Add `refreshTrafficData()` — conditional re-fetch of traffic CSV only
  (routes CSV is static, never re-fetch)
- Returns `{ changed: boolean; newRows?: TrafficRow[] }`

### Phase 2: Polling mechanism

**2.1 Add polling interval config**

File: `src/config.json`

```json
{
  "polling": {
    "interval_min": 10,
    "enabled": true
  }
}
```

File: `src/lib/config.ts`

```ts
export interface AppConfig {
  // ... existing fields
  polling: {
    interval_min: number;
    enabled: boolean;
  };
}
```

**2.2 Add `useTrafficPolling` hook**

File: `src/lib/useTrafficData.ts`

New hook that wraps the existing `useTrafficData` and adds polling:

- On mount: initial fetch (existing behavior)
- After initial load: start `setInterval` at `cfg.polling.interval_min`
- Each tick: call `refreshTrafficData()` (conditional fetch)
- If 304: update `lastChecked` timestamp only
- If 200: merge new rows into `allRows`, re-compute cards, update `dataTimestamp`
- On city switch: abort current interval, restart for new city
- On tab hidden (`visibilitychange`): pause polling; resume on visible
- On network offline: skip poll, retry next interval

Expose to consumers:
```ts
{
  // ...existing useTrafficData return values...
  lastChecked: Date;        // when we last polled (not when data changed)
  pollingActive: boolean;   // whether auto-refresh is running
  togglePolling: () => void;// pause/resume
}
```

**2.3 Integrate into DashboardInner**

File: `src/pages/Dashboard.tsx`

- Replace `useTrafficData(citySource)` call with `useTrafficPolling(citySource)`
- Pass `lastChecked` and `togglePolling` to header/pane components

### Phase 3: UI indicators

**3.1 Freshness indicator in TrafficNOW header**

File: `src/components/RouteBrowserPane.tsx`

Add below the "Traffic NOW!" title:

- When `lastChecked` is < 2 min ago: "Live · updated just now"
- When < 10 min ago: "Live · updated X min ago"
- When > 10 min ago: "Updated X min ago" (dimmer, polling may be paused)
- Subtle pulsing dot (green) when live

**3.2 Auto-refresh toggle button**

File: `src/components/RouteBrowserPane.tsx`

Add a small play/pause icon button in the header area (next to info icon):

- Playing state: ▶️ icon, tooltip "Auto-refresh ON (every 10 min)"
- Paused state: ⏸️ icon, tooltip "Auto-refresh OFF — tap to resume"
- Clicking toggles `togglePolling()`
- Style: 44px touch target, same Poppins 600 / 11px pill style

**3.3 Flash/pulse on data update**

File: `src/components/RouteBrowserPane.tsx`

When new data arrives (rows merged), briefly pulse the border or show a
subtle "✓ Updated" toast-like indicator that fades after 3 seconds.

### Phase 4: Edge cases & polish

**4.1 Error resilience**

- If a poll fails (network, GitHub 5xx): silently skip, keep showing last data
- Log to console but never show error UI for background polls
- After 3 consecutive failures: stop polling, show "Polling paused — network issue"
- Next successful poll: resume normal operation

**4.2 Memory management**

- On each successful refresh, trim `allRows` to 90 days (same window used for
  liveSpeed computation)
- This prevents unbounded memory growth from accumulated rows

**4.3 Page Visibility API**

```ts
useEffect(() => {
  const handler = () => {
    if (document.hidden) {
      clearInterval(intervalRef.current);
    } else {
      // Resume polling
      startInterval();
    }
  };
  document.addEventListener("visibilitychange", handler);
  return () => document.removeEventListener("visibilitychange", handler);
}, []);
```

**4.4 Dev mode considerations**

- In dev mode, the Vite proxy is used instead of raw.githubusercontent.com
- ETag may not be available through the proxy → fall back to blind re-fetch
- The `toProxy()` function needs to also be applied in the refresh path

## Files likely to change

| File | Change |
|---|---|
| `src/lib/useTrafficData.ts` | Add conditional fetch, polling hook, ETag tracking |
| `src/lib/config.ts` | Add `PollingConfig` interface |
| `src/config.json` | Add `polling` section |
| `src/pages/Dashboard.tsx` | Switch to `useTrafficPolling`, pass new props |
| `src/components/RouteBrowserPane.tsx` | Freshness indicator, auto-refresh toggle, update flash |

## Tests / validation

| Test | What it verifies |
|---|---|
| `tests/unit/useTrafficData.test.ts` | ETag caching logic, conditional header construction, 304 handling |
| Manual: open dashboard, wait 10 min | Data auto-refreshes, indicator updates |
| Manual: open dev tools Network tab | 304 responses when CSV unchanged; 200 when changed |
| Manual: pause auto-refresh | Polling stops, indicator shows paused state |
| Manual: switch cities | Polling restarts for new city's CSV |
| Manual: close laptop lid / switch tabs | Polling pauses, resumes on wake |
| Manual: disconnect network | Graceful degradation, no error UI |

## Risks, tradeoffs, open questions

### Risks
1. **GitHub rate limiting** — raw.githubusercontent.com has generous limits but
   polling every 10 min = 144 req/day per user. Multiple concurrent users could
   add up. Mitigation: conditional requests (304) are lightweight for GitHub.
2. **Stale ETag cache** — if the ETag map grows across city switches, old entries
   accumulate. Mitigation: clear map on city switch.
3. **Vite proxy doesn't forward ETags** — dev mode may not get 304s. Mitigation:
   fall back to blind re-fetch in dev.

### Tradeoffs
- **Full CSV re-parse on change** vs. incremental: Full re-parse is ~50-100ms
  for 63k rows. Not worth the complexity of incremental parsing for such a
  small cost.
- **Client-side polling vs. webhook/push** — client-side is simpler and stays
  zero-backend. WebSockets or SSE would be overkill for 10-minute intervals.

### Open questions
1. Should the auto-refresh be **on by default** for first-time visitors, or
   require opt-in? (Proposed: ON by default — this is a public planning tool)
2. Should we show **which snapshot time** the live speed is from (e.g.
   "8:40 AM snapshot")? The `liveTimestamp` is already computed.
3. For future cities (Chennai, etc.) — the polling config is per-dashboard,
   not per-city, so it will automatically work when new cities are added.
