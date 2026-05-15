# TraffiCOracle

[![Typecheck](https://github.com/maheshshantaram/TraffiCOracle/actions/workflows/typecheck.yml/badge.svg)](https://github.com/maheshshantaram/TraffiCOracle/actions/workflows/typecheck.yml)

<p align="center">
  <img src="artifacts/blr-traffic/public/trafficoracle-dark.png" alt="TraffiCOracle" height="64">
</p>

**TraffiCOracle** is a web platform that visualises road traffic data for **Bengaluru (Bangalore)** — with **no backend required**.

## No Backend. No Database. Just Open It and Go.

This is what makes TraffiCOracle different. The dashboard fetches live traffic data directly from a public GitHub repository that is updated every hour. There is no server to configure, no database to provision, no API keys to manage. You clone the repo, run one command, and start exploring traffic patterns in your browser.

The PostgreSQL database and Express API server are **optional infrastructure** — ready for when you want to store historical data locally, run custom queries, or build additional services. But they are not required to use the dashboard.

> **Zero-backend architecture:** The entire data pipeline runs client-side. PapaParse downloads and parses CSV files from GitHub in the browser. All computation — filtering, aggregation, verdict logic, chart rendering — happens in React. Your data never touches a server unless you choose to send it somewhere.

---

## Three Ways to Explore Traffic

The dashboard presents Bengaluru's traffic data through three complementary viewing modes, each answering a different question:

### 1. Map View — _Where is traffic moving?_

An interactive Leaflet map of Bengaluru with route polylines color-coded by traffic speed:

- 🟢 **Green** = fast traffic
- 🟡 **Yellow** = moderate traffic
- 🔴 **Red** = slow/heavy traffic

Click any route to select it and drill into detailed analysis. The Airport Expressway is always highlighted with a dashed green line as the speed benchmark.

### 2. Route Cards — _Which routes are getting better or worse?_

A side-by-side comparison of all monitored routes, each showing:

- A **sparkline** of weekly average speeds over the last 6 months
- A **delta indicator** (▲/▼) comparing recent performance against your chosen baseline window
- Visual flags for the **top 3 routes that worsened the most**

Tap any card to jump to that route on the map. This is the fastest way to scan the entire network.

### 3. Trend Analysis — _How does traffic change over time?_

Two chart panels plus a calendar heatmap:

- **Speed Over Time** — Area chart showing weekly average speed with baseline and recent bands
- **Trip Duration Over Time** — Line chart comparing average trip duration vs. bad-day (95th percentile) duration
- **Data Calendar** — A GitHub-style heatmap of daily traffic speeds. Click any day to see the full speed breakdown. Scroll through months to spot seasonal patterns

---

## Quick Start

Get a working local setup in about 2 minutes.

### 1. Install Prerequisites

| Tool | Minimum Version | Install |
|------|----------------|---------|
| **Bun** (JavaScript runtime) | 1.0+ | `curl -fsSL https://bun.sh/install \| bash` |
| **Node.js** | 24+ | Comes with Bun, or install from [nodejs.org](https://nodejs.org) |
| **PostgreSQL** | 16+ | `brew install postgresql` (macOS) or use your package manager |

Verify everything is installed:

```bash
bun --version    # Should show 1.x
node --version   # Should show v24+
psql --version   # Should show 16+
```

### 2. Clone and Run

```bash
git clone <repo-url> && cd TraffiCOracle
bun install
```

This installs all dependencies with supply-chain protection (packages must be at least 24 hours old).

### 3. Start the Dashboard

```bash
cd artifacts/blr-traffic
PORT=5173 BASE_PATH=/ bun run dev
```

Open **http://localhost:5173** in your browser. That's it — no database, no API server, no `.env` file needed. The dashboard will fetch live data from GitHub automatically.

---

## Using the Dashboard

### Navigation

The dashboard is a single-page application with these main areas:

1. **Header** — TraffiCOracle branding, theme toggle (Colour / Gray / Pastel), and Share button
2. **Hero Question Bar** — Clickable chips for question mode (worsened/improved), route, time of day, and period
3. **Map View** — Central interactive map showing traffic routes
4. **Baseline Slider** — Pick a date range to establish "normal" traffic conditions
5. **Verdict Panel** — Is traffic better or worse? Compare baseline vs. recent at a glance
6. **KPI Cards** — Avg speed, median trip, bad-day trip, and total readings
7. **Trend Charts** — Speed and duration over time with Recharts
8. **Data Calendar** — Heatmap of daily traffic speeds (click to drill down)
9. **Route Cards** — All-route overview with sparklines and delta indicators

### Typical Workflow

1. **Select a route** on the map or from the route cards
2. **Set your baseline window** — the date range you consider "normal"
3. **Adjust time of day and period** to focus on relevant traffic conditions
4. **Toggle question mode** — "worsened" or "improved" — to flip the analysis lens
5. **Explore the calendar** — click any day to see its speed profile
6. **Share your view** — copy the URL; it encodes all your filters

### Data Sources

The dashboard fetches live data directly from the **[blr-traffic-monitor](https://github.com/thecont1/blr-traffic-monitor)** repository on GitHub, which is updated every hour:

| File | Purpose |
|------|---------|
| `csv-bangalore_traffic.csv` | Speed/duration readings per route and timestamp |
| `csv-routes.csv` | Route metadata (names, codes, coordinates) |

These files are downloaded and parsed client-side using PapaParse — no local database is required.

---

## Running the System

### Just the Dashboard (No Backend)

```bash
cd artifacts/blr-traffic && PORT=5173 BASE_PATH=/ bun run dev
```

This is all you need for the primary use case. The dashboard fetches live data from GitHub.

### Full Stack (Dashboard + API + Database)

```bash
# Terminal 1: Set up database (one time)
cp .env.example .env
# Edit .env with your PostgreSQL connection string
cd lib/db && bun run push

# Terminal 2: Start the API server
cd artifacts/api-server && bun run dev

# Terminal 3: Start the dashboard
cd artifacts/blr-traffic && PORT=5173 BASE_PATH=/ bun run dev
```

### Production Build

```bash
# Build everything
bun run build

# Or build individually:
cd artifacts/api-server && bun run build   # → dist/index.mjs
cd artifacts/blr-traffic && bun run build  # → dist/public/
cd artifacts/mockup-sandbox && bun run build  # → dist/
```

---

## Project Structure

```
TraffiCOracle/
├── lib/                        # Shared libraries (used by everything)
│   ├── db/                     # Database layer — Drizzle ORM + PostgreSQL
│   ├── api-zod/                # Zod validation schemas for API data
│   ├── api-client-react/       # React hooks for API calls (TanStack Query)
│   └── api-spec/               # OpenAPI spec + code generation config
├── artifacts/                  # Applications you can run
│   ├── api-server/             # Express 5 REST API (Node.js)
│   ├── blr-traffic/            # Traffic dashboard (React + Vite) ← the star
│   │   ├── public/
│   │   │   ├── favicon.svg
│   │   │   ├── trafficoracle-dark.png   # Logo for light themes
│   │   │   └── trafficoracle-light.png  # Logo for dark themes
│   │   └── src/
│   │       ├── pages/Dashboard.tsx      # Main dashboard with all 3 views
│   │       ├── components/TrafficMap.tsx # Map View (Leaflet)
│   │       ├── lib/useTrafficData.ts    # Data fetching & processing
│   │       └── lib/config.ts            # AppConfig type
│   └── mockup-sandbox/         # UI component playground
├── scripts/                    # Utility scripts (post-merge automation)
├── bunfig.toml                 # Bun workspace & security configuration
├── package.json                # Workspace root definition
├── tsconfig.json               # TypeScript project references
├── tsconfig.base.json          # Shared TypeScript settings
├── bun.lock                    # Dependency lockfile (committed to VCS)
├── .env.example                # Database connection template
└── README.md                   # You are here
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Only if using DB/API | PostgreSQL connection string (e.g., `postgresql://user:***@localhost:5432/dbname`) |
| `PORT` | Yes (dev) | Port for the dev server (dashboard uses `5173`, API uses `9000`) |
| `BASE_PATH` | Yes (dev) | URL path prefix (use `/` for local development) |
| `NODE_ENV` | No | `production` or `development` |
| `REPL_ID` | No | Replit environment ID (only needed on Replit) |

Create a `.env` file in the repository root with your values. The dashboard does **not** need a `.env` file — it reads all settings from `config.json` and fetches data from GitHub.

---

## Key Commands Reference

### Typechecking

```bash
bun run typecheck              # Check entire project
bun run typecheck:libs         # Check shared libraries only
```

### Development

```bash
bun install                         # Install dependencies
cd lib/db && bun run push           # Push database schema (optional)
cd artifacts/api-server && bun run dev  # Start API (optional)
cd artifacts/blr-traffic && bun run dev  # Start dashboard ← this is all you need
```

### Building

```bash
bun run build                  # Build everything
cd artifacts/api-server && bun run build    # Build API server
cd artifacts/blr-traffic && bun run build   # Build dashboard
```

### Database

```bash
cd lib/db && bun run push      # Dev push (drops + recreates tables)
cd lib/db && bun run migrate   # Generate SQL migration files
cd lib/db && bun run generate  # Generate Drizzle snapshots
```

### Regenerating API Client

```bash
cd lib/api-spec && bun run codegen
```

---

## Supply Chain Security

The project uses `bunfig.toml` to protect against supply-chain attacks:

- **Minimum package age**: 24 hours — blocks packages published less than a day ago
- **Lockfile enforcement**: `bun.lock` must be present and up to date
- **Platform restriction**: Only Linux x86_64 packages are installed
- **No auto-peer deps**: Peer dependencies must be explicitly declared

---

## Known Issues

### Mockup-Sandbox Build
The `mockup-sandbox` package has a known Vite dependency deduplication issue. If you encounter type errors, run:
```bash
bun install  # Re-install at root to deduplicate
rm -rf artifacts/mockup-sandbox/node_modules/.bun  # Remove duplicate if it persists
```

### Config JSON Import
The dashboard's `config.json` lives outside the `src/` directory. This is intentional and handled by the TypeScript configuration — no action needed unless you move the file.

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

---

## Contributing

1. Run `bun install` after pulling changes
2. Run `bun run typecheck` before committing
3. Add new packages to both `workspaces` in `package.json` and `references` in `tsconfig.json`
4. Use `@/*` path aliases for imports within a package
5. Keep `tsconfig.base.json` in sync across packages

---

## License

MIT