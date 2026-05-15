# TraffiCOracle

[![Typecheck](https://github.com/maheshshantaram/TraffiCOracle/actions/workflows/typecheck.yml/badge.svg)](https://github.com/maheshshantaram/TraffiCOracle/actions/workflows/typecheck.yml)

**TraffiCOracle** is a web platform that collects, processes, and visualises road traffic data for **Bengaluru (Bangalore)**. It helps you understand how traffic moves across the city — which routes are fast, which are slow, and how conditions change over time.

The system consists of three parts working together:

| Part | What it does |
|------|-------------|
| **Data Collector** | Downloads and processes traffic speed/duration data from public CSV sources |
| **API Server** | Stores data in a PostgreSQL database and serves it through a REST API |
| **Dashboard** | An interactive web map that shows traffic patterns, route comparisons, and daily trends |

---

## What You'll See

### Traffic Map
A Leaflet-based map of Bengaluru with route polylines color-coded by traffic speed:
- 🟢 **Green** = fast traffic
- 🟡 **Yellow** = moderate traffic
- 🔴 **Red** = slow/heavy traffic

### Dashboard Panels
- **Baseline Window** — Pick a date range to establish "normal" traffic conditions
- **Verdict Panel** — Compare routes side-by-side; see which days were good or bad
- **Data Calendar** — A collapsible heatmap showing daily speed patterns
- **CSV Export** — Download filtered data for your own analysis
- **Share** — Copy a URL that encodes your current view and filters

### Configuration
The dashboard reads settings from `artifacts/blr-traffic/src/config.json`:

```json
{
  "worst_case_percentile": 95,
  "verdict_threshold_kmh": 0.5,
  "baseline_default_start": "2025-10-20",
  "baseline_default_end": "2025-12-15"
}
```

- **worst_case_percentile**: Which percentile of slow speeds to highlight (default: 95th)
- **verdict_threshold_kmh**: Speed difference threshold for "good" vs "bad" verdicts (default: 0.5 km/h)
- **baseline_default_start / end**: Default date range for the baseline window

---

## Quick Start

These steps get you a working local setup in about 5 minutes.

### 1. Install Prerequisites

You need three things installed on your machine:

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

### 2. Clone and Install

```bash
git clone <repo-url> && cd TraffiCOracle
bun install
```

This installs all dependencies with supply-chain protection (packages must be at least 24 hours old).

### 3. Typecheck (optional but recommended)

```bash
bun run typecheck
```

This verifies the entire project compiles correctly. Should exit with `0` (success).

### 4. Set Up the Database

Create a `.env` file from the example:

```bash
cp .env.example .env
# Edit .env — set DATABASE_URL to your PostgreSQL connection string
# Example: DATABASE_URL="postgresql://user:password@localhost:5432/traffic"
```

Push the schema to your database:

```bash
cd lib/db && bun run push
```

> **Note:** This drops and recreates tables. For production, use migrations instead:
> `cd lib/db && bun run migrate`

### 5. Start the API Server

```bash
cd artifacts/api-server && bun run dev
```

This builds and starts the Express API server with source maps. Default port: `9000`.

### 6. Start the Dashboard

In a **separate terminal**:

```bash
cd artifacts/blr-traffic
PORT=5173 BASE_PATH=/ bun run dev
```

Open **http://localhost:5173** in your browser.

---

## Using the Dashboard

### Navigation

The dashboard is a single-page application with these main areas:

1. **Map View** — Central interactive map showing traffic routes
2. **Sidebar** — Filters, date pickers, and configuration panels
3. **Verdict Panel** — Route comparison cards showing good/bad days
4. **Data Calendar** — Heatmap of daily traffic speeds (click to drill down)

### Typical Workflow

1. **Select a route** on the map or from the dropdown
2. **Set your baseline window** — the date range you consider "normal"
3. **Adjust the verdict threshold** — how sensitive the good/bad classification is
4. **Explore the calendar** — click any day to see its speed profile
5. **Compare routes** — use the verdict panel to see which routes perform better
6. **Export data** — click CSV export to download filtered results
7. **Share your view** — copy the URL from the address bar; it encodes all your filters

### Data Sources

Traffic data comes from external CSV files hosted on GitHub. The system downloads, parses (using PapaParse), and processes this data client-side in the dashboard.

---

## Running the System

### All-in-One (Development)

```bash
# Terminal 1: Start the API server
cd artifacts/api-server && bun run dev

# Terminal 2: Start the dashboard
cd artifacts/blr-traffic && PORT=5173 BASE_PATH=/ bun run dev
```

### Production Build

```bash
# Build all packages
bun run build

# Or build individually:
cd artifacts/api-server && bun run build   # → dist/index.mjs
cd artifacts/blr-traffic && PORT=5173 BASE_PATH=/ bun run build  # → dist/public/
cd artifacts/mockup-sandbox && PORT=5174 BASE_PATH=/ bun run build  # → dist/
```

### Start the Built API Server

```bash
cd artifacts/api-server
node --enable-source-maps ./dist/index.mjs
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
│   ├── blr-traffic/            # Traffic dashboard (React + Vite)
│   └── mockup-sandbox/         # UI component playground
├── scripts/                    # Utility scripts (post-merge automation)
├── bunfig.toml                 # Bun workspace & security configuration
├── package.json                # Workspace root definition
├── tsconfig.json               # TypeScript project references
├── tsconfig.base.json          # Shared TypeScript settings
├── bun.lock                    # Dependency lockfile (committed to VCS)
└── README.md                   # You are here
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string (e.g., `postgresql://user:pass@localhost:5432/dbname`) |
| `PORT` | Yes (dev) | Port for the dev server (dashboard uses `5173`, API uses `9000`) |
| `BASE_PATH` | Yes (dev) | URL path prefix (use `/` for local development) |
| `NODE_ENV` | No | `production` or `development` |
| `REPL_ID` | No | Replit environment ID (only needed on Replit) |

Create a `.env` file in the repository root with your values.

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
cd lib/db && bun run push # Push database schema
cd artifacts/api-server && bun run dev  # Start API
cd artifacts/blr-traffic && bun run dev      # Start dashboard
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