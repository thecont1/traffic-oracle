# TraffiCOracle

A monorepo for Bangalore (Bengaluru) traffic monitoring, analysis, and visualisation. Built as a Bun workspace with TypeScript, featuring a REST API server, a React dashboard with interactive maps and charts, and a component preview sandbox.

---

## Table of Contents

- [Architecture](#architecture)
- [Monorepo Structure](#monorepo-structure)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Key Packages](#key-packages)
- [Configuration](#configuration)
- [Available Scripts](#available-scripts)
- [Project Conventions](#project-conventions)

---

## Architecture

```
TraffiCOracle/
├── bunfig.toml                  # Bun workspace + supply-chain config
├── lib/                          # Shared libraries
│   ├── db/                       # Database layer (Drizzle ORM + PostgreSQL)
│   ├── api-spec/                 # OpenAPI 3.1 spec → codegen source of truth
│   ├── api-zod/                  # Auto-generated Zod schemas from OpenAPI
│   └── api-client-react/         # Auto-generated React Query hooks
├── artifacts/                    # Deployable applications
│   ├── api-server/               # Express 5 REST API
│   ├── blr-traffic/              # React traffic dashboard (Vite)
│   └── mockup-sandbox/           # Component preview server
├── scripts/                      # Build & CI helpers
├── attached_assets/              # Design/PM reference notes
└── package.json                  # Workspace root
```

Data flow:

1. **CSV data sources** hosted on `thecont1/blr-traffic-monitor` (routes + traffic logs) are fetched client-side by the dashboard.
2. The **API server** (`artifacts/api-server`) provides REST endpoints backed by PostgreSQL via Drizzle ORM, with Zod-based request/response validation.
3. The **React dashboard** (`artifacts/blr-traffic`) consumes traffic CSVs directly, renders an interactive Leaflet map, calendar heatmap, KPI cards, and baseline-vs-recent comparison charts.
4. **Orval** codegens API client hooks + Zod types from the single `lib/api-spec/openapi.yaml` spec — the spec is the contract between frontend and backend.

---

## Monorepo Structure

### `lib/db` — Database Layer
- **ORM**: Drizzle ORM v0.45 (`drizzle-orm/node-postgres`)
- **Driver**: `pg` (PostgreSQL client)
- **Validation**: `drizzle-zod` for insert schemas
- **Migration**: `drizzle-kit push` (dev only)
- **Schema**: `lib/db/src/schema/index.ts` — currently a starter template with commented examples
- **Connection**: Requires `DATABASE_URL` env var

### `lib/api-spec` — API Contract
- **Format**: OpenAPI 3.1 (`openapi.yaml`)
- **Codegen**: Orval v8 generates:
  - React Query hooks → `lib/api-client-react/src/generated/`
  - Zod schemas → `lib/api-zod/src/generated/`
- **Current endpoints**: `GET /healthz` (health check returning `{ status: string }`)
- **Regenerate**: `bun run --filter @workspace/api-spec run codegen`

### `lib/api-zod` — Generated Zod Types
- Re-exports from `./generated/api` (API module) and `./generated/types` (type schemas)
- Used by both the API server and client for runtime validation

### `lib/api-client-react` — Generated React Client
- Re-exports from `./generated/api` (React Query hooks) and `./generated/api.schemas`
- Provides `setBaseUrl()` and `setAuthTokenGetter()` for native/Expo app usage
- Custom fetch wrapper (`custom-fetch.ts`) handles base URL prepending, auth tokens, error parsing, and response type resolution

### `artifacts/api-server` — Express API Server
- **Framework**: Express 5
- **Logging**: Pino with `pino-http` (pretty-printed in dev, JSON in prod)
- **Middleware**: CORS, JSON/URL-encoded body parsing
- **Routing**: `src/routes/` — currently only `/api/healthz`
- **Build**: esbuild → CJS bundle (`dist/index.mjs`)
- **Env**: `PORT` (required), `NODE_ENV`, `LOG_LEVEL`, `DATABASE_URL`

### `artifacts/blr-traffic` — Traffic Dashboard (Main UI)
A React + Vite single-page application for visualising Bangalore traffic data.

**Features:**
- **Interactive Map**: Leaflet/React-Leaflet with 16 hardcoded Bangalore routes rendered as quadratic Bézier curves; click to select, hover for speed tooltips
- **KPI Dashboard**: Speed, median trip duration, p95 (worst-case) duration, trip count — with baseline comparison
- **Napkin Chart**: SVG sparkline comparing baseline vs recent weekly average speeds
- **Calendar Heatmap**: Day-by-day speed colour-coding using p10/p90 percentile spread
- **Time-of-Day Filters**: Weekday morning (8–12), afternoon (12–18), evening (18–22), weekends, or all day
- **Period Filters**: 1 month, 3 months, 6 months, 1 year lookback
- **Baseline Window Slider**: Adjustable date range for baseline comparison
- **3 Themes**: Colour (dark), Gray (light), Pastel (light) — cycled via button, persisted in localStorage
- **Responsive**: Mobile-detecting layout with Radix UI components
- **Toast Notifications**: Custom React toast system

**Data Sources** (fetched as CSV from GitHub):
- Routes: `https://raw.githubusercontent.com/thecont1/blr-traffic-monitor/main/csv-routes.csv`
- Traffic: `https://raw.githubusercontent.com/thecont1/blr-traffic-monitor/main/csv-bangalore_traffic.csv`

**Key files:**
| File | Purpose |
|---|---|
| `src/App.tsx` | Root component with router + providers |
| `src/pages/Dashboard.tsx` | Main dashboard (~1700 lines, all visualisations) |
| `src/components/TrafficMap.tsx` | Leaflet map with Bézier route rendering |
| `src/lib/useTrafficData.ts` | Data fetching, parsing, aggregation hooks |
| `src/lib/routeCoords.ts` | Hardcoded lat/lng pairs for 16 routes |
| `src/lib/theme.ts` | Theme definitions (colour/gray/pastel) |
| `src/lib/ThemeContext.tsx` | Theme provider + localStorage persistence |
| `src/config.json` | App-level config (percentiles, baseline defaults) |

### `artifacts/mockup-sandbox` — Component Preview
A development server that renders individual React components from `src/components/mockups/` for the Replit workspace canvas. Routes to `/preview/<ComponentName>`.

### `scripts` — Build Helpers
- `post-merge.sh`: Runs `bun install --frozen-lockfile` then `bun --filter @workspace/db run push` (schema migrations)
- `src/hello.ts`: Placeholder script

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Runtime** | Bun (Node.js 24-compatible) |
| **Language** | TypeScript 5.9 |
| **Monorepo** | Bun workspaces |
| **Build** | esbuild (API), Vite 7 + SWC (frontend) |
| **API Server** | Express 5, Pino logging |
| **Database** | PostgreSQL + Drizzle ORM v0.45 + drizzle-zod v0.8 |
| **API Spec** | OpenAPI 3.1 → Orval v8 for codegen |
| **Validation** | Zod v3 |
| **Frontend** | React 19, TypeScript, Tailwind CSS 4 + `tw-animate-css` |
| **UI Components** | Radix UI, shadcn/ui patterns (`@/components/ui/*`) |
| **Charts** | Recharts |
| **Maps** | Leaflet 1.9 + React-Leaflet 5 |
| **Routing** | Wouter v3 |
| **State** | TanStack React Query v5, React Context |
| **CSS** | Tailwind CSS 4 with `@theme inline`, custom keyframe animations |

---

## Prerequisites

- **Bun** 1.x (latest stable)
- **PostgreSQL** (for API server)
- **Env vars** (see [Configuration](#configuration))

## Getting Started

```bash
# Install dependencies (uses Bun lockfile)
bun install

# Typecheck all packages
bun run typecheck

# Build all packages
bun run build

# Run API server
bun run --filter @workspace/api-server run dev

# Run traffic dashboard (from a separate terminal)
cd artifacts/blr-traffic
PORT=3000 bun run dev

# Push DB schema (dev only, destructive)
bun --filter @workspace/db run push

# Regenerate API client code from OpenAPI spec
bun run --filter @workspace/api-spec run codegen
```

---

## Configuration

### Bun Workspace Config (`bunfig.toml`)

```toml
# Supply-chain safety: require 1-day minimum publish age for npm packages
install.lockfile = true
install.minimumReleaseAge = "1 day"
install.minimumReleaseAgeExceptions = ["@replit/*", "stripe-replit-sync"]

# Platform restrictions (Replit runs linux-x64 only)
install.platforms = ["linux", "linux-x64"]

# No auto-install of peer dependencies — handled explicitly per package
install.autoInstallPeers = false
```

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes (api-server) | PostgreSQL connection string |
| `PORT` | Yes (api-server, blr-traffic) | Server listen port |
| `NODE_ENV` | No | `production` or `development` (defaults to dev behaviour) |
| `LOG_LEVEL` | No | Pino log level (default: `info`) |
| `BASE_PATH` | Yes (blr-traffic) | Vite base URL path |
| `REPL_ID` | No | Replit environment ID (enables dev-only plugins) |

### `artifacts/blr-traffic/src/config.json`

```json
{
  "worst_case_percentile": 95,
  "verdict_threshold_kmh": 0.5,
  "baseline_default_start": "2025-10-20",
  "baseline_default_end": "2025-12-15"
}
```

| Field | Description |
|---|---|
| `worst_case_percentile` | Percentile used for "bad day" duration (p95 by default) |
| `verdict_threshold_kmh` | Speed difference threshold (km/h) for worsened/improved verdict |
| `baseline_default_start` | Default start date for baseline comparison window |
| `baseline_default_end` | Default end date for baseline comparison window |

---

## Available Scripts

| Command | Description |
|---|---|
| `bun run build` | Typecheck + build all workspace packages |
| `bun run typecheck` | Full TypeScript typecheck across all packages |
| `bun run typecheck:libs` | Typecheck shared libs only (`lib/*`) |
| `bun run --filter @workspace/api-server run dev` | Start API in dev mode (build + start) |
| `bun run --filter @workspace/api-server run start` | Start API from pre-built dist |
| `bun run --filter @workspace/api-server run typecheck` | Typecheck API server |
| `bun run --filter @workspace/blr-traffic dev` | Start dashboard dev server |
| `bun run --filter @workspace/blr-traffic build` | Build dashboard for production |
| `bun run --filter @workspace/db run push` | Push DB schema to PostgreSQL (dev only) |
| `bun run --filter @workspace/db run push-force` | Force-push DB schema (drops existing) |
| `bun run --filter @workspace/api-spec run codegen` | Regenerate client code from OpenAPI spec |
| `bun run --filter @workspace/api-zod run typecheck` | Typecheck Zod types package |

---

## Project Conventions

- **Monorepo packages** use `workspace:*` protocol for inter-package dependencies
- **Bun lockfile**: `bun.lockb` is committed; `package-lock.json`, `pnpm-lock.yaml`, and `yarn.lock` are gitignored
- **Supply-chain safety**: 1-day minimum package publish age enforced via `bunfig.toml` (excluding `@replit/*` and `stripe-replit-sync`)
- **Platform overrides**: Non-linux packages are excluded in `bunfig.toml` platform restrictions
- **No `dist/` in git**: Compiled output is gitignored
- **`.local/` is gitignored**: Local runtime state (Replit skills, secondary skills, workflow logs, scribble DB) excluded from version control
- **`/connect.lock`**, **`/coverage`**, **`/typings`** are all gitignored
- **IDE**: VSCode settings are committed (`.vscode/settings.json`, `tasks.json`, `launch.json`, `extensions.json`); other IDE configs are ignored
- **esbuild overrides**: `@esbuild-kit/esm-loader` is aliased to `tsx` to work around drizzle-kit's internal esbuild dependency; esbuild is pinned to `0.27.3`
- **React**: Pinned to exact `19.1.0` (required by Expo compatibility)
- **CSS**: Uses Tailwind CSS 4 with `@theme inline` for CSS custom properties, `tw-animate-css` for keyframe animations, and `@tailwindcss/typography` plugin