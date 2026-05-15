# TraffiCOracle

[![Typecheck](https://github.com/maheshshantaram/TraffiCOracle/actions/workflows/typecheck.yml/badge.svg)](https://github.com/maheshshantaram/TraffiCOracle/actions/workflows/typecheck.yml)

Bangalore traffic data analysis platform — a TypeScript monorepo for collecting, processing, and visualising road traffic patterns in Bengaluru. Built with Bun workspaces, React 19, Drizzle ORM, and Postgres.

---

## Table of Contents

- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Workspace Packages](#workspace-packages)
- [TypeScript Configuration](#typescript-configuration)
- [Key Commands](#key-commands)
- [Development Workflows](#development-workflows)
- [Supply Chain Security](#supply-chain-security)
- [Infrastructure](#infrastructure)
- [Known Issues](#known-issues)
- [Project History](#project-history)

---

## Architecture

TraffiCOracle is a **Bun workspace monorepo** containing 7 packages organized into three layers:

```
TraffiCOracle/
├── lib/                        # Shared libraries
│   ├── db/                     #   Database layer (Drizzle ORM + PostgreSQL)
│   ├── api-zod/                #   Zod validation schemas for API responses
│   ├── api-client-react/       #   React hooks + typed fetch client (Orval-generated)
│   └── api-spec/               #   OpenAPI 3.x spec + Orval codegen config
├── artifacts/                  # Applications & artifacts
│   ├── api-server/             #   Express 5 API server
│   ├── blr-traffic/            #   React/Vite traffic dashboard (main UI)
│   └── mockup-sandbox/         #   UI component sandbox (Replit-skinned)
├── scripts/                    # Build/utility scripts
├── bunfig.toml                 # Bun workspace configuration
├── tsconfig.json               # Root composite TypeScript config
├── tsconfig.base.json          # Shared TypeScript compiler options
└── package.json                # Workspace root
```

**Data flow:**

```
[OpenAPI Spec] ──orval──► [lib/api-spec]
                              │
                              ├──► [lib/api-zod]     (Zod schemas)
                              └──► [lib/api-client-react]  (React Query hooks)
                                        │
[PostgreSQL] ◄─── [lib/db] ◄───────────┘
        │
        ▼
  [artifacts/api-server]  (Express 5 REST API)
        │
        ▼
  [artifacts/blr-traffic]  (React 19 Dashboard)
```

---

## Tech Stack

| Category       | Technology                          | Version       |
|----------------|-------------------------------------|---------------|
| Runtime        | Bun                                 | 1.x           |
| Language       | TypeScript                          | 5.9.0-dev     |
| Node           | Node.js                             | 24            |
| Frontend       | React                               | 19.0.0        |
| Build          | Vite                                | 7.3.x         |
| CSS Framework  | TailwindCSS                         | 4.1.x         |
| UI Components  | Radix UI + shadcn/ui                | latest        |
| Router         | Wouter                             | 3.3.x         |
| State          | TanStack Query                      | 5.90.x        |
| Database       | PostgreSQL 16+                      | —             |
| ORM            | Drizzle ORM                         | 0.45.x        |
| Validation     | Zod                                 | 3.25.x        |
| API Codegen    | Orval                               | —             |
| Maps           | Leaflet + react-leaflet             | latest        |
| Charts         | Victory / Recharts (via napkin)     | —             |
| Testing        | (TBD)                               | —             |
| Package Mgmt   | Bun workspaces                      | —             |
| Linting        | TypeScript strict mode              | —             |

---

## Prerequisites

- **Bun** >= 1.0 (`curl -fsSL https://bun.sh/install | bash`)
- **Node.js** >= 24 (Bun ships its own; used for production deployment)
- **PostgreSQL** >= 16 (for `db` workspace and `api-server`)
- **Git** (for cloning and submodule initialization)

Verify your environment:

```bash
bun --version   # >= 1.x
node --version  # >= v24.0.0
psql --version  # >= 16.0
```

---

## Quick Start

```bash
# 1. Clone the repository
git clone <repo-url> && cd TraffiCOracle

# 2. Install all dependencies (supply-chain safe, 24h lock)
bun install

# 3. Typecheck the entire project
bun run typecheck

# 4. Set up the database
cp .env.example .env          # Edit DATABASE_URL
bun --filter @workspace/db run push   # Dev: push schema to Postgres

# 5. Run the API server
bun --filter @workspace/api-server run dev

# 6. Run the dashboard (separate terminal)
cd artifacts/blr-traffic && bun run dev
```

Open `http://localhost:5173` (Vite dev server) for the dashboard.

---

## Workspace Packages

### `lib/db` — Database Layer

| Field          | Value                          |
|----------------|--------------------------------|
| Package name   | `@workspace/db`                |
| Entry          | `src/index.ts`                 |
| Type           | `emitDeclarationOnly: true`    |
| Dependencies   | `drizzle-orm`, `pg`, `drizzle-zod`, `zod` |
| Dev deps       | `esbuild`, `pino-pretty`       |

Drizzle ORM setup for PostgreSQL. Provides typed database access, schema definition, and migration tooling. The schema is intentionally minimal (stub) — extend it with tables for traffic data, routes, and historical records.

**Key files:**
- `src/index.ts` — Exports `db` (Drizzle instance) and `pool` (Postgres connection pool)
- `src/schema/index.ts` — Table definitions (add your tables here)
- `drizzle.config.ts` — Drizzle CLI config for migrations

**Usage:**

```typescript
import { db, users } from "@workspace/db";

const allUsers = await db.select().from(users);
```

**Run migrations:**

```bash
bun --filter @workspace/db run push      # Dev push (no migrations table)
bun --filter @workspace/db run migrate   # SQL migration generation
```

---

### `lib/api-zod` — Zod Validation Schemas

| Field          | Value                          |
|----------------|--------------------------------|
| Package name   | `@workspace/api-zod`           |
| Entry          | `src/index.ts`                 |
| Type           | `emitDeclarationOnly: true`    |
| Dependencies   | `zod`                          |

Shared Zod schemas used by the API server for request/response validation. Schemas are auto-generated from the OpenAPI spec via Orval and can be extended manually.

---

### `lib/api-client-react` — React API Client

| Field          | Value                          |
|----------------|--------------------------------|
| Package name   | `@workspace/api-client-react`  |
| Entry          | `src/index.ts`                 |
| Type           | `emitDeclarationOnly: true`    |
| Dependencies   | `@tanstack/react-query`, custom fetch |

Auto-generated React Query hooks and typed fetch utilities. The custom fetch layer (`src/custom-fetch.ts`) extends Orval's generated client with interceptors and error handling.

**Generated from:** `lib/api-spec/openapi.yaml` via Orval codegen.

**Regenerate after spec changes:**

```bash
bun --filter @workspace/api-spec run codegen
```

---

### `lib/api-spec` — OpenAPI Specification

| Field          | Value                          |
|----------------|--------------------------------|
| Package name   | `@workspace/api-spec`          |
| Source         | `openapi.yaml`                 |
| Codegen        | Orval (`orval.config.ts`)      |

The single source of truth for API contracts. Edit `openapi.yaml`, then run codegen to propagate types to `api-client-react` and `api-zod`.

```bash
bun --filter @workspace/api-spec run codegen
```

---

### `artifacts/api-server` — Express API Server

| Field          | Value                          |
|----------------|--------------------------------|
| Package name   | `@workspace/api-server`        |
| Entry          | `src/app.ts` (Express app)     |
| Build          | `build.mjs` (esbuild → ESM)    |
| Start          | `node --enable-source-maps ./dist/index.mjs` |
| Dependencies   | `express`, `cors`, `cookie-parser`, `pino`, `drizzle-orm` |

Production-ready Express 5 server with structured logging (Pino), CORS, and JSON parsing. Serves REST endpoints consumed by the Blr-Traffic dashboard.

**Run in dev:**

```bash
bun run dev     # Builds + starts with source maps
```

**Routes:** Defined in `src/routes/` (health, traffic data, etc.)

---

### `artifacts/blr-traffic` — Bangalore Traffic Dashboard

| Field          | Value                          |
|----------------|--------------------------------|
| Package name   | `@workspace/blr-traffic`       |
| Build          | Vite 7 + React 19              |
| Entry          | `index.html` → `src/main.tsx`  |
| CSS            | TailwindCSS 4 + `src/index.css`|
| Data           | CSV from external GitHub repos  |
| Config         | `src/config.json` (build-time)  |
| Dependencies   | `leaflet`, `react-leaflet`, `papaparse`, `react-csv`, `lucide-react`, `framer-motion`, `wouter` |

The main user-facing application. Displays traffic speed/duration data on a Leaflet map with:

- **Traffic Map** — Leaflet-based map with route polylines, color-coded by traffic speed
- **Dashboard** — Configurable baseline windows, verdict thresholds, and percentile analysis
- **Data Calendar** — Collapsible daily speed heatmap
- **Verdict Panel** — Route comparison with good/bad day analysis
- **CSV Export** — Download filtered data via PapaParse + react-csv
- **Share** — URL-encoded state sharing with debounced copy-to-clipboard

**Configuration** (`src/config.json`):

```json
{
  "worst_case_percentile": 95,
  "verdict_threshold_kmh": 0.5,
  "baseline_default_start": "2025-10-20",
  "baseline_default_end": "2025-12-15"
}
```

**Run in dev:**

```bash
cd artifacts/blr-traffic
bun run dev     # Vite dev server on :5173
```

---

### `artifacts/mockup-sandbox` — UI Component Sandbox

| Field          | Value                          |
|----------------|--------------------------------|
| Package name   | `@workspace/mockup-sandbox`    |
| Build          | Vite 7 + React 19              |
| Purpose        | Experimental UI playground      |
| Dependencies   | Replit-themed shadcn/ui components |

A sandboxed environment for developing and testing UI components with a Replit-inspired design system. Includes a preview plugin (`mockupPreviewPlugin.ts`) that generates mockup frames from component screenshots.

> **Note:** This package has known dependency deduplication issues with Vite types (see [Known Issues](#known-issues)). It is excluded from the composite typecheck but can be typechecked independently.

---

### `scripts` — Build & Utility Scripts

| Field          | Value                          |
|----------------|--------------------------------|
| Package name   | `@workspace/scripts`           |
| Entry          | `src/hello.ts`                 |
| Scripts        | `post-merge.sh`                |

Utility scripts for CI/CD and developer workflows.

---

## TypeScript Configuration

### Strategy: Composite Project References

This monorepo uses TypeScript's [project references](https://www.typescriptlang.org/docs/handbook/project-references.html) for fast, incremental builds and strict type checking across packages.

### File Structure

```
tsconfig.json           # Root orchestrator (no source files, only references)
tsconfig.base.json      # Shared compiler options (inherited by all packages)
lib/db/tsconfig.json        # Composite: emits declarations to dist/
lib/api-zod/tsconfig.json   # Composite: emits declarations to dist/
lib/api-client-react/tsconfig.json  # Composite: emits declarations to dist/
artifacts/api-server/tsconfig.json  # Composite: emits declarations to dist/
artifacts/blr-traffic/tsconfig.json # App: noEmit, JSX preserve
artifacts/mockup-sandbox/tsconfig.json  # App: standalone config
scripts/tsconfig.json              # App: noEmit
```

### Base Compiler Options (`tsconfig.base.json`)

```json
{
  "target": "es2022",
  "module": "esnext",
  "moduleResolution": "bundler",
  "lib": ["dom", "es2022"],
  "jsx": "preserve",
  "strict": true,
  "esModuleInterop": true,
  "skipLibCheck": true,
  "isolatedModules": true,
  "allowImportingTsExtensions": true,
  "noFallthroughCasesInSwitch": true,
  "noImplicitOverride": true
}
```

### Path Aliases

All packages use `@/*` mapped to their `src/` directory:

```json
// In each package's tsconfig.json
"paths": {
  "@/*": ["./src/*"]
}
```

Example usage:

```typescript
import Dashboard from "@/pages/Dashboard";
import { db } from "@workspace/db";
```

### Build Order (Dependency Graph)

```
lib/db ──────► lib/api-zod ──► lib/api-client-react
    │                               │
    └─────► artifacts/api-server ◄──┘
                         │
                         ▼
                  artifacts/blr-traffic
```

---

## Key Commands

### Typechecking

```bash
# Full typecheck (composite build + per-package checks)
bun run typecheck

# Composite library build only (fast incremental)
bun run typecheck:libs

# Individual package typecheck
bun --filter @workspace/api-server run typecheck
cd artifacts/blr-traffic && tsc -p tsconfig.json --noEmit
```

### Development

```bash
# Install dependencies (supply-chain safe)
bun install

# Dev server for dashboard
cd artifacts/blr-traffic && bun run dev

# Dev server for API
bun --filter @workspace/api-server run dev

# Database schema push (dev only — no migration files)
bun --filter @workspace/db run push

# Regenerate API client from OpenAPI spec
bun --filter @workspace/api-spec run codegen
```

### Build

```bash
# Full build: typecheck + build all packages
bun run build

# Build API server (esbuild → ESM)
cd artifacts/api-server && bun run build
```

### Database

```bash
# Push schema to Postgres (dev, drops + recreates tables)
bun --filter @workspace/db run push

# Generate SQL migration (production)
bun --filter @workspace/db run migrate

# Generate Drizzle snapshots after schema changes
bun --filter @workspace/db run generate
```

---

## Development Workflows

### Adding a New API Endpoint

1. Update `lib/api-spec/openapi.yaml` with the new endpoint definition
2. Run `bun --filter @workspace/api-spec run codegen` to regenerate types
3. Implement the route handler in `artifacts/api-server/src/routes/`
4. Run `bun run typecheck` to verify everything compiles

### Adding a Database Table

1. Define the table in `lib/db/src/schema/` (follow the Drizzle pattern in the comment block)
2. Export it from `lib/db/src/schema/index.ts`
3. Run `bun --filter @workspace/db run push` to apply locally
4. Generate a migration for production: `bun --filter @workspace/db run migrate`

### Adding a Dashboard Component

1. Create the component in `artifacts/blr-traffic/src/components/`
2. Use `@/*` path aliases for imports
3. Add TailwindCSS classes for styling (no CSS files — all inline via classes)
4. Run `tsc -p tsconfig.json --noEmit` from `artifacts/blr-traffic/` to verify

### Updating Dependencies

```bash
# Add a dependency to a specific workspace
bun add <package> --filter @workspace/blr-traffic

# Add a workspace-internal dependency
bun add @workspace/db --filter @workspace/api-server

# After any dependency change, re-lock and typecheck
bun install
bun run typecheck
```

---

## Supply Chain Security

The project enforces supply-chain integrity via `bunfig.toml`:

```toml
# Minimum package age: 24 hours (86400 seconds)
# Blocks newly-published packages from being installed
install.minimumReleaseAge = 86400

# Lockfile must be present and up to date
install.lockfile = true

# Platform restriction: linux-x64 only (production target)
install.platforms = ["linux", "linux-x64"]

# No automatic peer dependency installation
install.autoInstallPeers = false
```

**Exceptions** (internal/test packages exempted from age check):

```toml
install.minimumReleaseAgeExceptions = ["@replit/*", "stripe-replit-sync"]
```

This means:
- Any dependency published less than 24 hours ago is rejected
- The `bun.lock` file is the source of truth for resolved versions
- Peer dependencies must be explicitly declared
- Only Linux x86_64 packages are installed (faster installs, smaller attack surface)

---

## Infrastructure

### Environment Variables

| Variable              | Required | Description                              |
|-----------------------|----------|------------------------------------------|
| `DATABASE_URL`        | Yes      | PostgreSQL connection string             |
| `PORT`                | Yes      | Port for the dev server                  |
| `BASE_PATH`           | Yes      | Base URL path for the Vite app           |
| `NODE_ENV`            |          | `production` or `development`            |
| `REPL_ID`             | No       | Replit environment ID (for cartographer) |

### Build Pipeline

1. **Typecheck** — `tsc --build` (composite) + per-package `--noEmit`
2. **API Server** — esbuild bundles `src/app.ts` → `dist/index.mjs`
3. **Dashboard** — Vite builds SPA to `dist/` with Tailwind + JSX transform

### Post-Merge Hook (`scripts/post-merge.sh`)

Automatically runs after `git pull` to re-install dependencies and push database schema:

```bash
bun install --frozen-lockfile
bun --filter @workspace/db run push
```

---

## Known Issues

### Mockup-Sandbox: Vite Dependency Dedup

The `mockup-sandbox` package has its own `node_modules/.bun/` directory with a duplicate Vite installation (v7.3.2 vs workspace v7.3.3). This causes TypeScript type errors between the two Vite versions. The package is **excluded from the composite typecheck** and can be typechecked independently.

**Workaround:** Run `bun install` at the root to ensure deduplication, then delete `artifacts/mockup-sandbox/node_modules/` if it persists.

### Blr-Traffic: JSON Import Outside TS Include

The `config.json` file at `artifacts/blr-traffic/config.json` lives outside the `src/` directory. TypeScript's `resolveJsonModule` requires the file to be in the program's `include` path. The `tsconfig.json` for blr-traffic explicitly includes `"config.json"` to resolve this.

### Blr-Traffic: MapIterator Requires `downlevelIteration`

`useTrafficData.ts` iterates over `Map.entries()` which returns `MapIterator`. TypeScript requires `--downlevelIteration` or `target >= "es2015"`. The blr-traffic tsconfig has `target: "es2022"` (inherited) and `downlevelIteration: true` to handle this.

### Papaparse: Default Export

The `@types/papaparse` package doesn't declare a default export compatible with `esModuleInterop`. The import uses `import * as Papa from "papaparse"` instead of `import Papa from "papaparse"`.

### ~~Stale `pnpm-lock.yaml`~~

~~The repository still contains a `pnpm-lock.yaml` file from the pre-migration era. This file is **not used** — `bun.lock` is the sole lockfile. Consider removing `pnpm-lock.yaml` in a cleanup pass.~~

The `pnpm-lock.yaml` file has been removed. `bun.lock` is the sole lockfile in VCS.

---

## Migration Notes (pnpm → Bun)

This project was migrated from pnpm workspaces to Bun workspaces. Key changes:

| Before (pnpm)                        | After (Bun)                            |
|--------------------------------------|----------------------------------------|
| `pnpm-workspace.yaml`                | `workspaces` in `package.json`         |
|| `pnpm-lock.yaml`                     | `bun.lock`                            |
| `catalog:` in package.json           | Direct version ranges                  |
| `.npmrc`                             | `bunfig.toml`                          |
| `pnpm exec --filter`                 | `bun exec --if-present`                |
| Flat `tsconfig.json` with `include`  | Composite `references`-based config    |
| `pnpm install`                       | `bun install` (with `minimumReleaseAge`)|

### Post-Merge Cleanup Checklist

- [x] Remove `pnpm-lock.yaml`
- [x] Remove `.npmrc`
- [x] Remove `pnpm-workspace.yaml`
- [x] Verify `bun install` succeeds with clean `bun.lock`
- [x] Confirm `bun run typecheck` exits 0
- [x] Test `bun run build` for all deployable packages (composite + api-server + blr-traffic + mockup-sandbox)
- [x] Verify `bun.lock` is committed to VCS

---

## Contributing

1. Run `bun install` after pulling changes
2. Run `bun run typecheck` before committing
3. Add new packages to both `workspaces` in `package.json` and `references` in `tsconfig.json`
4. Use `@/*` path aliases (configured per-package)
5. Keep `tsconfig.base.json` in sync across packages

## License

MIT