# WARP.md — TraffiCOracle AI Onboarding Guide

## Architecture Overview

TraffiCOracle is a **zero-backend, config-driven traffic analytics dashboard** for Indian cities. It fetches live traffic CSV data from GitHub raw files, parses it client-side, and presents weekly/daily speed and duration trends with interactive charts, route comparisons, and a Time Travel simulation feature.

### Tech Stack

| Layer | Technology |
|-------|-----------|
| **Runtime** | Bun (package manager, test runner, build toolchain) |
| **Bundler** | Vite 7 + `@cloudflare/vite-plugin` |
| **Framework** | React 19 + TypeScript (strict null checks, no emit) |
| **Styling** | Tailwind CSS v4 (`@tailwindcss/vite`) |
| **UI Primitives** | Radix UI + shadcn/ui component system (`components/ui/`) |
| **Routing** | Wouter (lightweight, 2 routes: `/` and 404) |
| **Data Fetching** | Tanstack React Query + native `fetch` with `cache: 'no-store'` |
| **CSV Parsing** | Papa.parse (always normalise `\r\n → \n` before parsing) |
| **Charts** | Recharts |
| **Maps** | Leaflet + react-leaflet |
| **Animation** | Framer Motion, FLIP animations in route cards |
| **Deployment** | Cloudflare Workers (SPA + proxy worker) via Wrangler |
| **Tests** | Bun native test runner (`bun:test`), jsdom for component tests |

### Data Flow

1. App loads → `fetchTrafficData()` fetches routes CSV + traffic CSV via proxy
2. Proxy: `/api/traffic-csv/<file>` → GitHub raw (dev: Vite proxy, prod: Cloudflare Worker)
3. CSVs parsed with Papa.parse into `Route[]` + `TrafficRow[]`
4. Rows filtered by route, time-of-day, period → `aggregateRows()` produces `WeeklyAggregate[]`
5. Charts, KPI cards, and route cards render from aggregates
6. Background polling every 3 min (pauses when Time Travel is active or tab is hidden)

---

## Project Structure

```
TraffiCOracle/
├── config.json              # City data sources, percentile settings, UI defaults
├── index.html               # SPA entry point
├── package.json             # Scripts, dependencies
├── tsconfig.json            # Strict TS config (path alias: @/ → src/)
├── vite.config.ts           # Vite + Tailwind + Cloudflare plugins, dev proxy
├── wrangler.jsonc           # Cloudflare Worker config
├── bunfig.toml              # Bun configuration
│
├── src/
│   ├── main.tsx             # React root mount
│   ├── App.tsx              # QueryClient + Wouter Router + ThemeProvider
│   ├── index.css            # Global styles + Tailwind directives
│   ├── worker.ts            # Cloudflare Worker: CSV proxy (strips cache headers)
│   ├── config.json          # City config (imported by lib/config.ts)
│   │
│   ├── pages/
│   │   ├── Dashboard.tsx    # Main dashboard (~1500 lines, the core component)
│   │   └── not-found.tsx    # 404 page
│   │
│   ├── components/
│   │   ├── RouteBrowserPane.tsx       # Route list sidebar with bullet charts
│   │   ├── UncertaintyBandChart.tsx   # Speed/duration chart with confidence bands
│   │   ├── BaselineReferenceLines.tsx # Baseline comparison overlay
│   │   └── ui/               # ~50 shadcn/ui primitives (button, card, slider, etc.)
│   │       ├── InfoTip.tsx   # Custom tooltip wrapper
│   │       └── ...           # Standard Radix-based UI components
│   │
│   ├── hooks/
│   │   ├── use-mobile.tsx    # Mobile viewport detection
│   │   └── use-toast.ts      # Toast notification hook
│   │
│   └── lib/
│       ├── useTrafficData.ts # Core data: fetch, parse, aggregate, poll, hook
│       ├── config.ts         # AppConfig / CityConfig type definitions
│       ├── theme.ts          # 3 themes: colour (dark), gray, pastel
│       ├── ThemeContext.tsx   # ThemeProvider + useTheme hook
│       ├── TimeTravelContext.tsx  # Time Travel state + playback
│       ├── ttStateHelpers.ts # TT save/restore pure functions (testable)
│       ├── chartHelpers.ts   # Baseline stats, chart domain computation
│       ├── tooltipContent.ts # Tooltip text content registry
│       └── utils.ts          # cn() helper (clsx + tailwind-merge)
│
├── tests/
│   ├── setup.ts              # bun:test globals shim (Vite SSR compat)
│   ├── unit/
│   │   ├── useTrafficData.test.ts      # 112+ tests: CSV parsing, aggregation, CRLF, hooks
│   │   ├── tt-state-preservation.test.ts # TT save/restore correctness
│   │   └── chartHelpers.test.ts        # Chart domain computation
│   └── fixtures/
│       ├── routes-sample.csv           # Test route data
│       └── traffic-sample.csv          # Test traffic data
│
└── public/
    ├── trafficoracle-light.png  # Logo (white bg, used everywhere)
    ├── trafficoracle-dark.png   # Favicon
    ├── trafficoracle-social.png # Social sharing image
    ├── favicon.svg              # SVG favicon
    └── robots.txt
```

---

## Common Commands

```bash
# Install dependencies
bun install

# Development server (port 5173, proxies CSV to GitHub)
bun run dev

# Type-check (no emit)
bun run typecheck

# Run all tests
bun test

# Run tests in watch mode
bun run test:watch

# Build for production
bun run build

# Preview production build locally
bun run serve

# Deploy to Cloudflare Workers
bun run deploy

# Deploy via Wrangler dev (build + wrangler dev)
bun run preview
```

---

## Agent Rules

### Code Style & Language
- **Always use TypeScript.** No `.js` files. All components are `.tsx`, utilities are `.ts`.
- **Strict null checks are ON.** Handle `null`/`undefined` explicitly — the compiler will catch `strictNullChecks` violations.
- **Path alias:** `@/` maps to `src/`. Always use `import X from "@/lib/utils"` not relative paths.
- **Imports:** Use `import type` for type-only imports (e.g., `import type { AppConfig } from "@/lib/config"`).
- **No unused locals** is OFF (`noUnusedLocals: false`), but keep code clean.

### Component Patterns
- **Theme-aware:** Every component receives or calls `useTheme()`. Never hardcode colours — use `thm.cardBg`, `thm.textPrimary`, etc.
- **UI primitives live in `src/components/ui/`.** Reuse them. Do not create new Radix wrappers — use existing shadcn/ui components.
- **Inline styles for theme-dependent rendering.** Dashboard.tsx and RouteBrowserPane.tsx use inline `style={}` for dynamic theme values. Tailwind is used for static layout only.

### Data & State
- **`config.json` is the source of truth** for city data sources, percentile settings, and UI defaults. Types are in `src/lib/config.ts`.
- **`TrafficRow`** has optional weather fields (`temp_c`, `realfeel_c`, `humidity_pct`, `aqi`, `rsi_flag`) parsed from the traffic CSV. A separate `WeatherRow` interface (richer: `aqi_category`, `condition`, `temp_flag`, `realfeel_word`, `wind_gust_kmh`, `uv_index`) comes from `useWeatherData()` via a snapshot CSV. Both are used by the Dashboard.
- **CSV line endings:** Always normalise `\r\n → \n` before Papa.parse. Windows line endings corrupt the last ~1400 rows.
- **Cache-busting:** Use `bust()` from `useTrafficData.ts` for all CSV fetches. ETag/304 is unreliable due to CDN edge caching.
- **`dataTimestamp`** (the latest timestamp in the data) is the source of data freshness — NOT `new Date()` or fetch time.

### Testing
- **Tests use `bun:test`** (not Vitest). Import from `"bun:test"`, not `"vitest"`.
- **Test location:** `tests/unit/*.test.ts` and `tests/unit/*.test.tsx`.
- **TDD for pipeline fixes:** Write a failing reproduction test in `tests/unit/` before modifying data logic.
- **Mock `fetch` at the `globalThis` level** — see `useTrafficData.test.ts` for patterns.
- **Run `bun test` before committing.** All tests must pass.

### Time Travel (TT) Feature
- TT pauses live polling when active (`pausedRef.current`).
- **Save uses LIVE state** (not TT-filtered data). The snapshot captures the user's real route, period, and ToD selections.
- **Restore resolves against saved route/tod**, not current TT route/tod. See `ttStateHelpers.ts` for pure functions.
- Test helpers: `resolveSliderFromWeekKeys()`, `resolveRouteIndex()`, `validateSnapshot()`.

### Git & Deployment
- **Do not commit until told to.** Mahesh reviews all changes before commit.
- **Working tree must be clean** before switching branches.
- Branches: `main` (production), `design-changes` (UI work).
- Deployment is Cloudflare Workers: `bun run deploy` builds + pushes to `wrangler deploy`.
- The Worker (`src/worker.ts`) proxies `/api/traffic-csv/` to GitHub raw with `Cache-Control: no-store`.

### Things to Never Do
- Do NOT use `read_file` → `write_file` pipeline (corrupts line-numbered output).
- Do NOT hardcode colours outside theme definitions in `src/lib/theme.ts`.
- Do NOT add "coming soon" placeholders.
- Do NOT change zero-pixel-height hover patterns (fixed height + opacity toggle only).
- Do NOT mix `bust()` with `If-None-Match` headers.
- Do NOT assume `dataTimestamp` equals fetch time — it's derived from the actual data rows.
