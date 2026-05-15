# TraffiCOracle

[![Typecheck](https://github.com/maheshshantaram/TraffiCOracle/actions/workflows/typecheck.yml/badge.svg)](https://github.com/maheshshantaram/TraffiCOracle/actions/workflows/typecheck.yml)

<p align="center">
  <img src="artifacts/blr-traffic/public/trafficoracle-dark.png" alt="TraffiCOracle" height="64">
</p>

**TraffiCOracle** is a zero-backend web platform that visualises road traffic data for **Bengaluru (Bangalore)** — built with React, Vite, and Bun. There is no server to configure, no database to provision, and no API keys to manage.

> **Zero-backend architecture:** The entire data pipeline runs client-side. PapaParse downloads and parses CSV files from a public GitHub repository updated every hour. All computation — filtering, aggregation, baseline comparison, chart rendering — happens in React. Your data never touches a server unless you choose to send it somewhere.

---

## Table of Contents

- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Three Ways to Explore Traffic](#three-ways-to-explore-traffic)
- [Project Structure](#project-structure)
- [Data Pipeline](#data-pipeline)
- [Key Features](#key-features)
- [Running the System](#running-the-system)
- [Testing](#testing)
- [Environment Variables](#environment-variables)
- [Build & Deployment](#build--deployment)
- [Supply Chain Security](#supply-chain-security)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

---

## Quick Start

Get a working local setup in under 2 minutes.

### Prerequisites

| Tool | Minimum Version | Install |
|------|----------------|---------|
| **Bun** (JavaScript runtime) | 1.0+ | `curl -fsSL https://bun.sh/install \| bash` |
| **Node.js** | 24+ | Comes with Bun, or install from [nodejs.org](https://nodejs.org) |
| **PostgreSQL** | 16+ | `brew install postgresql` (macOS) or use your package manager |

### Run

```bash
# Clone and install
git clone <repo-url> && cd TraffiCOracle
bun install

# Start the dashboard
cd artifacts/blr-traffic
PORT=5173 BASE_PATH=/ bun run dev
```

Open **http://localhost:5173** — no database, no API server, no `.env` file needed. The dashboard fetches live data from GitHub automatically.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    React (Vite)                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │  Map     │  │ Route    │  │ Trend    │              │
│  │  View    │  │ Cards    │  │ Analysis │              │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘              │
│       │              │              │                    │
│       └──────────────┼──────────────┘                    │
│                      ▼                                   │
│         useTrafficData.ts (core data layer)              │
│         ┌────────────────────────────────────┐           │
│         │ PapaParse (CSV → JSON)              │           │
│         │ Validation (speed/duration filters) │           │
│         │ Aggregation (weekly, daily, stats)  │           │
│         │ Baseline comparison logic           │           │
│         └────────────────────────────────────┘           │
│                      │                                   │
│                      ▼                                   │
│         fetch() → GitHub raw CSV URLs                    │
│         (cache-busted with ?t=<timestamp>)               │
│                                                          │
└─────────────────────────────────────────────────────────┘
         │
         ▼ (optional)
┌─────────────────────────────────────────────────────────┐
│              Full Stack Mode                              │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │ Express  │──│ Drizzle ORM  │──│  PostgreSQL       │   │
│  │ API      │  │ (lib/db)     │  │  (lib/api-server) │   │
│  └──────────┘  └──────────────┘  └──────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

**Key design decisions:**

- **No server required** — the dashboard works entirely client-side by fetching CSV files from a public GitHub repository.
- **CSV over API** — avoids backend complexity; GitHub serves as the data source and CDN.
- **Client-side aggregation** — all statistics (mean, median, p95, weekly averages) are computed in the browser.
- **Cache busting** — every fetch appends `?t=<timestamp>` to prevent stale CDN responses.
- **Strict validation** — rows with duration > 300 min, speed > 150 km/h, or invalid dates are silently dropped.

---

## Three Ways to Explore Traffic

### 1. Map View — _Where is traffic moving?_

An interactive Leaflet map of Bengaluru with route polylines color-coded by traffic speed:

- 🟢 **Green** = fast traffic
- 🟡 **Yellow** = moderate traffic
- 🔴 **Red** = slow/heavy traffic

Click any route to select it and drill into detailed analysis. The Airport Expressway is always highlighted with a dashed green line as the speed benchmark.

Routes are rendered as quadratic Bézier arcs with curve direction determined by a hash of the route name, preventing overlap on parallel corridors.

### 2. Route Cards — _Which routes are getting better or worse?_

A side-by-side comparison of all monitored routes, each showing:

- A **sparkline** of weekly average speeds over the last 6 months
- A **delta indicator** (▲/▼) comparing recent performance against your chosen baseline window
- Visual flags for the **top 3 routes that worsened the most**

Tap any card to jump to that route on the map.

### 3. Trend Analysis — _How does traffic change over time?_

Two chart panels plus a calendar heatmap:

- **Speed Over Time** — Area chart showing weekly average speed with baseline and recent bands
- **Trip Duration Over Time** — Line chart comparing average trip duration vs. bad-day (95th percentile) duration
- **Data Calendar** — A GitHub-style heatmap of daily traffic speeds. Click any day to see the full speed breakdown. Scroll through months to spot seasonal patterns.

---

## Project Structure

```
TraffiCOracle/
├── lib/                        # Shared workspace packages
│   ├── api-client-react/       # React hooks (TanStack Query)
│   ├── api-zod/                # Zod validation schemas
│   ├── api-spec/               # OpenAPI spec + codegen config
│   └── db/                     # Drizzle ORM + PostgreSQL migrations
├── artifacts/                  # runnable applications
│   ├── api-server/             # Express 5 REST API (Node.js)
│   ├── blr-traffic/            # Traffic dashboard (React + Vite) ← main app
│   │   ├── public/
│   │   │   ├── favicon.svg
│   │   │   ├── trafficoracle-dark.png   # Logo (light themes)
│   │   │   └── trafficoracle-light.png  # Logo (dark themes)
│   │   └── src/
│   │       ├── App.tsx                    # Root component + router + providers
│   │       ├── main.tsx                   # Entry point — renders <App />
│   │       ├── pages/
│   │       │   ├── Dashboard.tsx          # Main dashboard (map, charts, calendar)
│   │       │   └── not-found.tsx          # 404 fallback
│   │       ├── components/
│   │       │   ├── TrafficMap.tsx         # Leaflet map with Bézier route arcs
│   │       │   ├── ui/                    # shadcn/ui primitives
│   │       │   └── ...
│   │       ├── lib/
│   │       │   ├── useTrafficData.ts     # Core: fetch, parse, aggregate
│   │       │   ├── config.ts             # AppConfig type definition
│   │       │   ├── theme.tsx             # Theme context & definitions
│   │       │   └── ...
│   │       └── index.css
│   │       ├── vite.config.ts            # Vite + plugins config
│   │       ├── vitest.config.ts          # Unit test config
│   │       └── package.json
│   └── mockup-sandbox/          # UI component playground
├── scripts/                     # Utility scripts
├── bunfig.toml                  # Bun workspaces & security config
├── package.json                 # Workspace root (pnpm/yarn-style monorepo)
├── tsconfig.json                # TypeScript project references
├── tsconfig.base.json           # Shared tsconfig settings
├── bun.lock                     # Dependency lockfile (committed)
├── .env.example                 # Database connection template
└── README.md                    # This file
```

---

## Data Pipeline

### Step 1: Fetch

`fetchTrafficData()` in `useTrafficData.ts` makes two HTTP requests:
- `csv-routes.csv` — route metadata (code, full name, short name)
- `csv-bangalore_traffic.csv` — timestamped speed/duration readings

Both URLs are fetched with `cache: 'no-store'` and cache-busting (`?t=<timestamp>`).

**Data source:** [`thecont1/blr-traffic-monitor`](https://github.com/thecont1/blr-traffic-monitor) — updated hourly.

### Step 2: Parse

CSV text is parsed client-side using [PapaParse](https://www.papaparse.com/) with header mode and empty line skipping.

### Step 3: Validate & Transform

Each raw traffic row passes through strict validation:

| Field | Rule | Rationale |
|-------|------|-----------|
| `duration_min` | `0 < duration ≤ 300` | Dropping outliers (stuck sensors, GPS drift) |
| `speed_kmh` | `0 < speed ≤ 150` | Impossible speed indicates bad data |
| `timestamp` | Valid date parse | Missing/invalid dates → skip |
| `distance_km` | Default 10 if missing | Prevents division-by-zero in speed calc |

Speed is recomputed: `(distance_km / (duration_min / 60))`, rounded to 1 decimal.

### Step 4: Aggregate

Data is aggregated at multiple granularities:

- **Weekly** (`aggregateRows`): Groups by Monday-based week key, computes avg speed, avg/median/p95 duration
- **Daily** (`useDailyStats`): Groups by date string, filtered by route + time-of-day
- **Overall** (`computeStats`): Mean, median, p95, avg speed, count for any row set

### Step 5: Compare (Baseline)

`useFilteredData` splits data into two windows:
- **Selected route** — filtered by time-of-day and period (1m/3m/6m/1y)
- **Baseline route** (default: Airport Expressway) — same period, different route

Weekly aggregates are merged side-by-side for chart rendering.

---

## Key Features

### Time-of-Day Filtering

`matchesToD(hour, dayOfWeek, tod)` supports five modes:

| Mode | Hours | Days |
|------|-------|------|
| `weekday_morning` | 08:00–11:59 | Mon–Fri |
| `weekday_afternoon` | 12:00–17:59 | Mon–Fri |
| `weekday_evening` | 18:00–21:59 | Mon–Fri |
| `weekends` | All day | Sat–Sun |
| `all` | All day | All days |

### Week Key System

`toWeekKey(date)` generates a Monday-based ISO week identifier (`YYYY-MM-DD`). All days in the same week resolve to the same key, enabling correct weekly grouping across month/year boundaries.

### Percentile Calculation

`percentile(sorted, p)` uses linear interpolation for non-integer indices, matching standard statistical conventions. Handles edge cases: empty arrays → 0, p=0 → min, p=100 → max.

### URL Parameters

The dashboard state is encoded in URL query parameters for sharing:

| Param | Type | Description |
|-------|------|-------------|
| `route` | string | Selected route name |
| `tod` | string | Time-of-day filter |
| `period` | string | Time period (1m/3m/6m/1y) |
| `mode` | string | Question mode |
| `bl` | number | Baseline window start (timestamp) |
| `br` | number | Baseline window end (timestamp) |

---

## Testing

### Running Tests

```bash
# From the blr-traffic directory
cd artifacts/blr-traffic
bun test

# Or run a specific test file
bun test tests/unit/useTrafficData.test.ts
```

### Test Architecture

The project uses **Bun's native test runner** (`bun:test`).

**Test file:** `tests/unit/useTrafficData.test.ts` — 40+ tests organized into 4 phases:

| Phase | Focus | Tests |
|-------|-------|-------|
| Phase 1 | Data integrity | CSV parsing, date handling, speed/duration validation, `getCol` column matching, full fetch pipeline with mocked `fetch` |
| Phase 2 | Aggregation | `toWeekKey`, `percentile`, `matchesToD`, `aggregateRows`, `computeStats`, `bust` (cache-busting), `useFilteredData` period cutoff, `useDailyStatsAllDay` |
| Phase 3 | Integration | Complete fetch-parsing pipeline with mocked HTTP responses, error handling |
| Phase 4 | Regression | Empty CSV handling, malformed row skipping, week key uniqueness over time |

### Key Testing Decisions

- **Bun native runner** over Vitest — Vitest 2.x has ESM interop issues with Bun 1.x where local `.ts` module exports resolve to empty objects.
- **No `beforeEach`/`afterEach`** — each test is self-contained; fetch mocks are set per-test.
- **Source code is the spec** — test behavior mirrors source logic exactly so failures point at bugs, not test drift.

### Test Helpers

```typescript
// Create a valid TrafficRow for testing
function makeRow(overrides?: Partial<TrafficRow>): TrafficRow

// Replicate date-key logic used by daily-stats maps
function dateKey(d: Date): string  // → "2026-04-08"
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | Yes (dev) | Port for the dev server (dashboard uses `5173`, API uses `9000`) |
| `BASE_PATH` | Yes (dev) | URL path prefix (use `/` for local development) |
| `DATABASE_URL` | Only with DB | PostgreSQL connection string |
| `NODE_ENV` | No | `production` or `development` |
| `REPL_ID` | No | Replit environment ID (only needed on Replit) |

Create a `.env` file in the repository root. **The dashboard does not need a `.env` file** — it reads all settings from `config.json` and fetches data from GitHub.

---

## Build & Deployment

### Development

```bash
# Dashboard only (zero-backend)
cd artifacts/blr-traffic && PORT=5173 BASE_PATH=/ bun run dev

# Full stack (dashboard + API + database)
# Terminal 1: Database
cp .env.example .env  # Edit with your PostgreSQL connection string
cd lib/db && bun run push

# Terminal 2: API server
cd artifacts/api-server && bun run dev

# Terminal 3: Dashboard
cd artifacts/blr-traffic && PORT=5173 BASE_PATH=/ bun run dev
```

### Production

```bash
# Build everything
bun run build

# Or individually:
cd artifacts/api-server && bun run build    # → dist/index.mjs
cd artifacts/blr-traffic && bun run build   # → dist/public/
cd artifacts/mockup-sandbox && bun run build # → dist/
```

### Typechecking

```bash
bun run typecheck              # Entire project
bun run typecheck:libs         # Shared libraries only
```

---

## Supply Chain Security

Configured via `bunfig.toml`:

- **Minimum package age**: 24 hours — blocks packages published less than a day ago
- **Lockfile enforcement**: `bun.lock` must be present and up to date
- **Platform restriction**: Only Linux x86_64 packages are installed
- **No auto-peer deps**: Peer dependencies must be explicitly declared

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `bun: command not found` | Install Bun: `curl -fsSL https://bun.sh/install \| bash` |
| `PORT environment variable is required` | Set `PORT=5173` before running the dashboard |
| `BASE_PATH environment variable is required` | Set `BASE_PATH=/` before running |
| `Cannot find module '@workspace/...'` | Run `bun install` at the repository root |
| Typecheck fails after pulling changes | Run `bun install` then `bun run typecheck` |
| Database connection refused | Ensure PostgreSQL is running and `DATABASE_URL` is correct |
| Stale build artifacts | Delete `dist/` directories and run `bun run build` again |
| Dashboard shows no data | Check internet connection — data is fetched from GitHub |
| Vitest tests hang or show empty exports | Use `bun test` instead — see [Testing](#testing) |

---

## Contributing

1. Run `bun install` after pulling changes
2. Run `bun run typecheck` before committing
3. Add new packages to both `workspaces` in `package.json` and `references` in `tsconfig.json`
4. Use `@/*` path aliases for imports within a package
5. Keep `tsconfig.base.json` in sync across packages
6. New features should include unit tests in `tests/unit/`

---

## License

MIT