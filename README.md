# TraffiCOracle

<p align="center">
  <img src="public/trafficoracle-light.png" alt="TraffiCOracle" height="64">
</p>

**TraffiCOracle** is a zero-backend web platform that visualises road traffic data for **Bengaluru (Bangalore)** — built with React, Vite, and Bun. There is no server to configure, no database to provision, and no API keys to manage.

> **Zero-backend architecture:** The entire data pipeline runs client-side. PapaParse downloads and parses CSV files from a public GitHub repository updated every 30 minutes. All computation — filtering, aggregation, baseline comparison, chart rendering — happens in React. Your data never touches a server unless you choose to send it somewhere.

---

## Table of Contents

- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Dashboard Layout](#dashboard-layout)
- [TrafficNOW! — Live Pane](#trafficnow---live-pane)
- [Project Structure](#project-structure)
- [Config-Driven Architecture](#config-driven-architecture)
- [Data Pipeline](#data-pipeline)
- [Background Polling](#background-polling)
- [Key Features](#key-features)
- [Testing](#testing)
- [Build & Deployment](#build--deployment)
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

### Run

```bash
# Clone and install
git clone <repo-url> && cd TraffiCOracle
bun install

# Start the dashboard
bun run dev
```

Open **http://localhost:5173** — no database, no API server, no `.env` file needed. The dashboard fetches live data from GitHub automatically.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    React (Vite + Bun)                         │
│                                                              │
│  ┌─────────────────────┐  ┌──────────────────────┐          │
│  │   Question Pane      │  │  TrafficNOW! Pane    │          │
│  │   (scrolls)          │  │  (frozen, internal   │          │
│  │                      │  │   scroll only)        │          │
│  │  ┌────────────────┐  │  │                      │          │
│  │  │  Trend Charts   │  │  │  Live speed dots     │          │
│  │  │  KPI Cards      │  │  │  Status labels       │          │
│  │  │  Calendar Heat  │  │  │  Confidence bars     │          │
│  │  │  Baseline Slider│  │  │  Route cards         │          │
│  │  └───────┬────────┘  │  │  (hover/select)      │          │
│  │          │            │  └──────────┬───────────┘          │
│  └──────────┼────────────┘             │                      │
│             └──────────┬───────────────┘                      │
│                        ▼                                      │
│           useTrafficData.ts (core data layer)                  │
│           ┌──────────────────────────────────────┐            │
│           │ Initial fetch: full CSV download       │            │
│           │ Polling: ETag conditional requests     │            │
│           │ PapaParse → TrafficRow[]               │            │
│           │ Validation (speed/duration filters)    │            │
│           │ Aggregation (weekly, daily, stats)     │            │
│           └──────────────────────────────────────┘            │
│                        │                                      │
│                        ▼                                      │
│           fetch() → GitHub raw CSV URLs                       │
│           (cache-busted on initial load)                      │
│           (ETag conditional on polls)                         │
└──────────────────────────────────────────────────────────────┘
```

**Key design decisions:**

- **No server required** — the dashboard works entirely client-side by fetching CSV files from a public GitHub repository.
- **CSV over API** — avoids backend complexity; GitHub serves as the data source and CDN.
- **Client-side aggregation** — all statistics (mean, median, p95, weekly averages) are computed in the browser.
- **Two-pane layout** — Question pane (scrolls with footer) and TrafficNOW! pane (frozen height, independent scroll).
- **Strict validation** — rows with duration > 300 min, speed > 150 km/h, or invalid dates are silently dropped.

---

## Dashboard Layout

The dashboard uses a **two-pane layout** with fully independent scrolling:

### Left Pane — Question & Analysis
- **Interactive question** with tappable pills for route, time-of-day, period, and mode
- **Baseline comparison slider** with striped/solid track
- **Verdict card** with emoji, chart, and statistical summary
- **KPI cards** — Avg Speed, Median Trip, Bad Day Trip, Readings
- **Speed Over Time** chart with baseline/recent bands
- **Trip Duration Over Time** chart with p95 overlay
- **Calendar heatmap** — GitHub-style daily speed visualization
- **Footer** — thin data source attribution strip

### Right Pane — TrafficNOW!
- Frozen height (fills viewport), independent scroll
- Rounded border with theme-aware colors (WCAG-compliant contrast)
- **Pulsing green dot** + "Live · updated X min ago" freshness indicator
- Route cards with hover/select states
- Speed markers with confidence bars (p05–p95)
- 5-state status labels: unusually fast, faster, typical, slower, unusually slow
- Speed values shown on hover (centered under dot, clipped at card edges)

---

## TrafficNOW! — Live Pane

### Auto-Refresh Polling

The TrafficNOW! pane auto-refreshes every 10 minutes using **ETag conditional requests**:

1. First fetch downloads the full CSV and stores the ETag
2. Subsequent polls send `If-None-Match: <etag>` to GitHub
3. **304 Not Modified** = zero download (file unchanged)
4. **200 OK** = parse new rows, merge into existing data, update UI

Polling pauses when the browser tab is hidden (Page Visibility API) and resumes on focus. Background poll errors are silently swallowed — the last known data stays on screen.

**Configuration** in `src/config.json`:
```json
"route_pane": {
  "polling_interval_min": 10
}
```

### Status Labels

| Speed Range | Label | Color (Colour) | Color (Gray) |
|-------------|-------|----------------|--------------|
| ≥ p95 | unusually fast | `#34D399` | `#2D8A4E` |
| p85–p95 | faster than typical | `#34D399` | `#2D8A4E` |
| p15–p85 | typical | `#60A5FA` | `#555555` |
| p05–p15 | slower than typical | `#F87171` | `#C0392B` |
| < p05 | unusually slow | `#F87171` | `#C0392B` |

All status colors pass WCAG AA (≥3:1 contrast) against their respective backgrounds.

---

## Project Structure

```
TraffiCOracle/
├── src/
│   ├── App.tsx                    # Root component + router + providers
│   ├── main.tsx                   # Entry point — renders <App />
│   ├── config.json                # City, percentile, baseline, polling, zoom
│   ├── pages/
│   │   └── Dashboard.tsx          # Main dashboard (two-pane layout)
│   ├── components/
│   │   ├── TrafficMap.tsx         # Leaflet map with Bézier route arcs
│   │   └── RouteBrowserPane.tsx   # TrafficNOW! pane with live indicators
│   ├── lib/
│   │   ├── useTrafficData.ts      # Core: fetch, parse, aggregate, poll
│   │   ├── config.ts              # AppConfig type definition
│   │   ├── theme.ts               # Three themes: colour, gray, pastel
│   │   └── ThemeContext.tsx        # ThemeProvider with URL/localStorage
│   └── index.css                  # Tailwind + animations + utilities
├── public/
│   ├── trafficoracle-light.png    # Logo (dark themes)
│   └── trafficoracle-dark.png     # Logo (light themes)
├── tests/
│   └── unit/
│       └── useTrafficData.test.ts # 72 tests across 4 phases
├── vite.config.ts
├── tsconfig.json
├── package.json
├── bun.lock
├── bunfig.toml
└── README.md
```

---

## Config-Driven Architecture

All defaults live in `src/config.json` — no hardcoded values in components:

```json
{
  "cities": [
    {
      "name": "Bangalore",
      "ready": true,
      "data_source": {
        "routes_csv": "https://raw.githubusercontent.com/thecont1/blr-traffic-monitor/main/csv-routes.csv",
        "traffic_csv": "https://raw.githubusercontent.com/thecont1/blr-traffic-monitor/main/csv-bangalore_traffic.csv"
      }
    }
  ],
  "percentile": {
    "worst_case": 97.5,
    "verdict_threshold_kmh": 0.99
  },
  "defaults": {
    "baseline_start": "2026-01-05",
    "baseline_end": "2026-03-04",
    "question_mode": "improved",
    "route": "Hosur Road",
    "time_of_day": "weekday_morning",
    "period": "3m"
  },
  "route_pane": {
    "open": true,
    "min_width": 200,
    "width": 400,
    "max_width": 600,
    "polling_interval_min": 10
  },
  "zoom": {
    "default": 0.92,
    "steps": [0.80, 0.92, 1.00, 1.15]
  }
}
```

**URL parameters override config defaults.** The Share button encodes all state into the URL:

| Param | Description | Example |
|-------|-------------|---------|
| `city` | City name | `Bangalore` |
| `route` | Route name | `Hosur Road` |
| `tod` | Time-of-day | `weekday_morning` |
| `period` | Time period | `3m` |
| `mode` | Question mode | `improved` |
| `theme` | Colour scheme | `colour` / `gray` / `pastel` |
| `bl` | Baseline start index | `15` |
| `br` | Baseline end index | `23` |
| `zoom` | UI scale factor | `0.92` |

---

## Data Pipeline

### Step 1: Fetch

`fetchTrafficData()` in `useTrafficData.ts` makes two HTTP requests:
- `csv-routes.csv` — route metadata (code, full name, short name)
- `csv-bangalore_traffic.csv` — timestamped speed/duration readings

Both URLs are fetched with `cache: 'no-store'` and cache-busting (`?t=<timestamp>`) on initial load.

**Data source:** [`thecont1/blr-traffic-monitor`](https://github.com/thecont1/blr-traffic-monitor) — updated every 30 minutes via GitHub Actions.

### Step 2: Parse

CSV text is parsed client-side using [PapaParse](https://www.papaparse.com/) with header mode and empty line skipping. Windows line endings (`\r\n`) are normalized to `\n` before parsing.

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
- **TrafficNOW! Stats** (`computeTODStats`): Percentile-based statistics (p05, p10, p15, p50, p85, p90, p95) from 90-day window ±90 min around current time
- **Overall** (`computeStats`): Mean, median, p95, avg speed, count for any row set

---

## Background Polling

After the initial full fetch, the dashboard polls for updates every 10 minutes:

```
Initial load:  Full CSV download (63k+ rows, ~2.5 MB)
               ↓
Poll cycle:    Send If-None-Match header
               ↓
         ┌─────┴─────┐
         │  304       │  200
         │  No change │  New data
         │  Skip      │  Parse + merge
         └─────┬─────┘
               ↓
         Update UI if changed
```

- **ETag tracking** — module-level `etagStore` maps URLs to their last-seen ETag
- **Merge logic** — new rows are deduped by `timestamp:route_code` key, then sorted
- **Memory management** — rows older than 90 days are trimmed on each refresh
- **Tab visibility** — polling pauses when the tab is hidden, resumes with an immediate check on focus
- **Error resilience** — background poll failures are silently swallowed; manual Refresh remains available

---

## Key Features

### Themes

Three built-in themes, cycled via the header pill:

| Theme | Background | Style |
|-------|-----------|-------|
| **Colour me surprised!** | Deep navy-charcoal | Vibrant cyan/pink accents |
| **Scale me gray!** | Clean white | Professional grayscale |
| **Clear as day!** | Warm cream | Soft, sunny palette |

Theme persists in localStorage and can be overridden via URL param `?theme=gray`.

### Zoom Control

Header `[-] 92% [+]` pill scales the entire UI. Four steps: 80%, 92%, 100%, 115%. The zoom compensates for CSS `zoom` scaling so the viewport fills perfectly at any level. Default and steps are configurable in `config.json`.

### Time-of-Day Filtering

`matchesToD(hour, dayOfWeek, tod)` supports five modes:

| Mode | Hours | Days |
|------|-------|------|
| `weekday_morning` | 08:00–11:59 | Mon–Fri |
| `weekday_afternoon` | 12:00–17:59 | Mon–Fri |
| `weekday_evening` | 18:00–21:59 | Mon–Fri |
| `weekends` | All day | Sat–Sun |
| `all` | All day | All days |

### Percentile-Based Statistics (Traffic NOW!)

Traffic data is **right-skewed** — congestion creates a long tail of slow speeds while fast speeds have an upper bound. Standard deviation assumes normal distribution, which is statistically invalid for traffic.

**Industry standard: Percentiles** (used by INRIX, TomTom, Google Maps):

| Statistic | Meaning | Usage |
|-----------|---------|-------|
| **p05** | Extreme fast end | Confidence bar left edge |
| **p15** | Lower typical bound | "slower" threshold |
| **p50** | Median — typical center | Visual marker |
| **p85** | Upper typical bound | "faster" threshold |
| **p95** | Extreme slow end | Confidence bar right edge |

`percentile(sorted, p)` uses linear interpolation for non-integer indices.

---

## Testing

### Running Tests

```bash
bun test
```

### Test Architecture

The project uses **Bun's native test runner** (`bun:test`).

**Test file:** `tests/unit/useTrafficData.test.ts` — 72 tests organized into 4 phases:

| Phase | Focus | Tests |
|-------|-------|-------|
| Phase 1 | Data integrity | CSV parsing, date handling, speed/duration validation, `getCol` column matching, full fetch pipeline with mocked `fetch` |
| Phase 2 | Aggregation | `toWeekKey`, `percentile`, `matchesToD`, `aggregateRows`, `computeStats`, `bust` (cache-busting), `useFilteredData` period cutoff, `useDailyStatsAllDay` |
| Phase 3 | Integration | Complete fetch-parsing pipeline with mocked HTTP responses, error handling |
| Phase 4 | Regression | Empty CSV handling, malformed row skipping, week key uniqueness over time |

### Key Testing Decisions

- **Bun native runner** over Vitest — Vitest 2.x has ESM interop issues with Bun 1.x where local `.ts` module exports resolve to empty objects.
- **No DOM in tests** — replicate pure logic instead of using `renderHook` or `@testing-library/react`.
- **No `beforeEach`/`afterEach`** — each test is self-contained; fetch mocks are set per-test.
- **Source code is the spec** — test behavior mirrors source logic exactly so failures point at bugs, not test drift.

---

## Build & Deployment

### Development

```bash
bun run dev
```

### Production

```bash
bun run build
```

### Typechecking

```bash
bun run typecheck
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `bun: command not found` | Install Bun: `curl -fsSL https://bun.sh/install \| bash` |
| Typecheck fails after pulling changes | Run `bun install` then `bun run typecheck` |
| Dashboard shows no data | Check internet connection — data is fetched from GitHub |
| TrafficNOW! shows stale data | Click Refresh; auto-poll runs every 10 min |
| Theme not applied from shared URL | Ensure `theme=colour` or `theme=gray` or `theme=pastel` in URL |
| Zoom creates blank space at bottom | This is a browser zoom artifact; use the +/- control instead |

---

## Contributing

1. Run `bun install` after pulling changes
2. Run `bun run typecheck` before committing
3. Use `@/*` path aliases for imports within the project
4. New features should include unit tests in `tests/unit/`
5. Theme colors must pass WCAG AA (≥3:1 contrast) — verify with computed ratios

---

## License

MIT
