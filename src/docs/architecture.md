# traffiCOracle Architecture

## Overview

traffiCOracle is a zero-backend, config-driven traffic analytics dashboard. It fetches CSV data from GitHub, parses it client-side, and presents traffic trends with interactive charts, route comparisons, and verdict generation.

The app has **two UI shells** powered by **one shared analytics core**:

```
┌──────────────────────────────────────────────────┐
│                   App.tsx                        │
│         (viewport-based shell selection)          │
├────────────────────┬─────────────────────────────┤
│   Desktop Shell    │       Mobile Shell          │
│  Dashboard.tsx     │      MobileApp.tsx          │
│  (full dashboard)  │  (route-led companion)      │
├────────────────────┴─────────────────────────────┤
│              Shared UI Components                │
│  LocationDropdown · Chip · NapkinChart           │
│  ChartTooltipFactory · UncertaintyBandChart      │
├──────────────────────────────────────────────────┤
│                Core Modules                      │
│  format · constants · trafficNow · urlState      │
│  periodLogic · chartHelpers                      │
├──────────────────────────────────────────────────┤
│              Data Layer                          │
│  useTrafficData · useWeatherData · config        │
│  Papa.parse · fetch (CSV from GitHub)            │
└──────────────────────────────────────────────────┘
```

## Directory Structure

```
src/
├── core/                        # Pure computation (no React)
│   ├── format.ts                # Date/duration/week formatters
│   ├── constants.ts             # PERIOD_LIST, TOD_LIST, VERDICT, deriveVerdict()
│   ├── trafficNow.ts            # TrafficNOW! card computation
│   ├── urlState.ts              # URL param parsing, share URL builder
│   ├── periodLogic.ts           # Cutoff dates, baseline/recent slicing
│   └── index.ts                 # Barrel export
│
├── components/
│   ├── shared/                  # Shared UI components (desktop + mobile)
│   │   ├── LocationDropdown.tsx # City picker dropdown
│   │   ├── Chip.tsx             # Interactive question chip
│   │   ├── NapkinChart.tsx      # Baseline/recent SVG trend line
│   │   └── ChartTooltipFactory.tsx  # Recharts tooltip renderer
│   ├── RouteBrowserPane.tsx     # Desktop route sidebar
│   ├── UncertaintyBandChart.tsx # Speed forecast band chart
│   ├── BaselineReferenceLines.tsx
│   └── ui/                      # shadcn/ui primitives
│
├── lib/                         # Data + state layer
│   ├── useTrafficData.ts        # CSV fetch, parse, aggregate, hooks
│   ├── config.ts                # AppConfig/CityConfig types
│   ├── theme.ts                 # 3 themes (colour, gray, pastel)
│   ├── ThemeContext.tsx          # ThemeProvider
│   ├── TimeTravelContext.tsx     # Time Travel state
│   ├── ttStateHelpers.ts        # TT save/restore pure functions
│   ├── chartHelpers.ts          # Baseline stats, chart domain
│   ├── tooltipContent.ts        # Tooltip text registry
│   └── utils.ts                 # cn() helper
│
├── pages/
│   ├── Dashboard.tsx            # Desktop shell (~2600 lines)
│   └── not-found.tsx            # 404 page
│
├── mobile/                      # Mobile shell
│   ├── MobileApp.tsx            # Mobile layout + analytics
│   ├── components/
│   │   └── SwipeableRouteCards.tsx  # Swipeable route card carousel
│   └── hooks/
│       └── useMobileShare.ts    # Web Share API with fallback
│
├── App.tsx                      # Shell selection (viewport-based)
├── main.tsx                     # React root mount
└── worker.ts                    # Cloudflare Worker: CSV proxy
```

## Data Flow

1. App loads → shell selected by viewport (≤768px = mobile, >768px = desktop)
2. Both shells call `useTrafficData()` → fetches routes + traffic CSVs
3. CSVs parsed with Papa.parse → `Route[]` + `TrafficRow[]`
4. Core modules compute derived view models:
   - `computeCutoffDate()` → period window
   - `computeBaselineAndRecent()` → baseline/recent week slices
   - `deriveVerdict()` → verdict key + message
   - `computeAllRouteCards()` → TrafficNOW! card data
   - `aggregateRows()` → weekly aggregates
5. Shells render from view models, not raw rows

## Shell Differences

### Desktop (Dashboard.tsx)
- Full analytical density: Time Travel, baseline slider, chart toggles
- Route browser sidebar with live status cards
- Calendar widget, TrafficNOW! uncertainty bands
- Zoom controls, theme cycling, auto-refresh polling
- URL state persistence (deep linking)

### Mobile (MobileApp.tsx)
- Route-led companion experience
- Swipeable route cards (main control)
- Simplified verdict + speed/duration charts
- No Time Travel, no baseline selector, no auto-refresh
- Predetermined period (config defaults) and time-of-day
- Web Share API integration
- Branded car loading animation

## Key Design Decisions

- **No backend**: All computation is client-side in the browser
- **Pure functions in core/**: No React dependency, fully testable
- **Derived view models**: Components consume computed data, not raw rows
- **Config-driven**: `config.json` controls cities, percentiles, defaults
- **CSV line endings**: Always normalize `\r\n → \n` before Papa.parse
- **Cache-busting**: Use `bust()` for all CSV fetches (ETag unreliable on CDN)
- **Data freshness**: `dataTimestamp` (latest row timestamp), not fetch time

## Commands

```bash
bun install          # Install dependencies
bun run dev          # Dev server (port 5173)
bun run typecheck    # TypeScript check
bun test             # Run all tests
bun run build        # Production build
bun run deploy       # Deploy to Cloudflare Workers
```
