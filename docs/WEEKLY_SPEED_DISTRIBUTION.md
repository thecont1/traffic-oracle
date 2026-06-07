# Weekly Speed Distribution — Feature Notes

> Last updated: 2026-06-07  
> Covers: architecture, design decisions, known limitations, test strategy, and future work.

---

## 1. What the feature shows

The **Weekly Speed Distribution** card (previously called "Speed Forecast Bands") renders
an uncertainty-band chart — one band per week — summarising how trip speeds were distributed
across the selected time bracket for a given route.

Each week produces five values:

| Band value | Percentile | Meaning |
|---|---|---|
| `p05` | 5th | Lower edge of outer band — unusually fast trips |
| `p15` | 15th | Lower edge of inner band — comfortably quick trips |
| `p50` | 50th | Centre line — typical trip speed that week |
| `p85` | 85th | Upper edge of inner band — noticeably slow trips |
| `p95` | 95th | Upper edge of outer band — worst-case slow trips |

**Why this ordering looks inverted:** In road-speed data, a *higher* speed is *better*
(less congestion). p05 is therefore the "fast tail" and p95 the "slow tail" — the
opposite of what you'd expect from a latency chart.

---

## 2. What it is NOT

The feature was originally named "Speed Forecast Bands" with tooltip copy that said
*"expected range of traffic speeds … based on historical patterns"*. That framing was
misleading on two counts:

1. **It is descriptive, not predictive.** The chart shows what speeds *were* in past
   weeks. It makes no statistical projection about future weeks.
2. **"Bands" implied a confidence interval around a forecast.** The bands are simply
   empirical percentile envelopes of historical observations.

The rename and tooltip rewrite (2026-06-07) corrected both issues. If a genuine
forward-looking forecast is ever needed, it must be built separately — see §7.

---

## 3. Architecture

### 3.1 Module: `src/lib/forecastBands.ts`

```
buildBands(
  weeks        : WeeklyAggregate[],   // pre-computed weekly aggregates from useFilteredData
  allRouteRows : TrafficRow[],         // raw rows already filtered by label_short
  tod          : TimeOfDay = "all",    // time-of-day bracket (default: include all)
) → IntervalDatum[]
```

The function is **pure** — no React, no side-effects. It was extracted from an inline
closure inside `Dashboard.tsx`'s `useMemo` precisely to make it independently testable.

**Data flow per week:**

```
allRouteRows
  → filter: timestamp ∈ [wStart, wEnd)         // 7-day ISO-Monday window
  → filter: matchesToD(hour, dayOfWeek, tod)    // respect the active time bracket
  → map: r.speed_kmh
  → sort ascending
  → if length ≥ 3: real percentile calculation (interpolated)
  → if length < 3: synthetic flat band (see §3.2)
  → round each value to 1 decimal place
```

`percentile` and `matchesToD` are both imported from `@/lib/useTrafficData` so there is
no duplication of that logic.

### 3.2 Sparse-week fallback

When fewer than 3 trips match the active week + tod filter, computing meaningful percentiles
is impossible (you cannot interpolate a five-point distribution from one or two values).
The fallback emits a synthetic flat band centred on a representative speed `s`:

| Trips matching | Fallback `s` value |
|---|---|
| 1 or 2 | Mean of the matching trip speeds |
| 0 | `w.avgSpeed` — the pre-aggregated all-hours weekly average from the CSV |

The band envelope is then `s × {0.90, 0.95, 1.00, 1.05, 1.10}`, giving ±5 % inner
and ±10 % outer bands. All five values are rounded to 1 decimal.

**Known limitation of the 0-trip fallback:** When the tod filter excludes all rows for
a week, the fallback centre `w.avgSpeed` is derived from all-hours data regardless of
the active tod. This will produce a band that does not match the tod context. The card
remains visible (showing these synthetic bands) rather than hiding, which may slightly
mislead the user about data quality for that specific week. A future improvement could
flag such weeks visually (e.g. a dashed band or a tooltip note "estimated from weekly
average").

### 3.3 Caller: `Dashboard.tsx`

```tsx
const { trafficNowData, trafficNowCompare } = useMemo(() => {
  const routeRows    = ttAllRows.filter(r => r.label_short === selectedRoute);
  const recentData   = buildBands(recentWeeks.length > 0 ? recentWeeks : allRouteWeeks.slice(-12), routeRows, tod);
  const baselineData = buildBands(baselineWeeks.length > 0 ? baselineWeeks : [], routeRows, tod);
  return { trafficNowData: recentData, trafficNowCompare: baselineData };
}, [ttAllRows, selectedRoute, recentWeeks, baselineWeeks, allRouteWeeks, tod]);
```

Key points:

- `recentWeeks` is populated by the period/slider logic (`computeBaselineAndRecent` in
  `src/core/periodLogic.ts`). When it is empty (e.g. slider covers the whole range),
  the function falls back to `allRouteWeeks.slice(-12)` so the card never goes blank
  due to slider position alone.
- `baselineData` is non-empty only when the user has set a comparison window via the
  slider. When non-empty, the `UncertaintyBandChart` switches to compare mode and renders
  a second overlaid band series.
- `tod` is now in the dependency array, so the bands re-compute whenever the user
  changes the time-of-day selector.

### 3.4 Rendering: `UncertaintyBandChart`

The chart is a Recharts-based `ComposedChart` with stacked `Area` layers that produce the
nested band appearance. The outer div carries `data-testid="forecast-bands-card"` for
stable E2E selection. Card visibility is gated on `trafficNowData.length > 0`; expand/
collapse is controlled by the local `tnOpen` boolean state (default `false` — collapsed).

---

## 4. Time-of-day alignment

**Before 2026-06-07:** `buildBands` ignored the `tod` parameter entirely. Every band was
computed from all 168 hours of the week, making the distribution much wider and often
unrepresentative of the user's actual commute window.

**After 2026-06-07:** `matchesToD(r.hour, r.dayOfWeek, tod)` is applied inside
`buildBands`, consistent with every other chart on the dashboard. The bands now narrow
when a specific time bracket is selected (e.g. `weekday_morning`) and include only trips
within that window.

**Implication for sparse weeks:** Narrow tod filters (e.g. `late_hours`) on a route with
few observations per week will trigger the fallback path more frequently. This is correct
behaviour — there genuinely are fewer late-night trips, so empirical percentiles would be
meaningless.

---

## 5. Compare mode

When the user drags the baseline slider to isolate a reference window, `baselineData` is
non-empty and the chart enters compare mode:

- Recent series rendered in the route's primary colour.
- Baseline series rendered in a muted teal (`--tn-series`, `#0f766e`).
- A small "Compare mode" badge appears in the card header (only while expanded).

Compare mode is the most genuinely diagnostic part of the feature: a leftward shift in
the baseline band (slower speeds) confirms the trend direction signalled by the Verdict
card, with distributional detail that the Verdict's single-number summary cannot provide.

---

## 6. Tests

### 6.1 Unit tests — `tests/unit/buildBands.test.ts`

13 tests across two `describe` blocks (190 total in the suite):

**`buildBands` (9 tests)**
| Test | What it verifies |
|---|---|
| Empty weeks | Returns `[]` immediately |
| x matches weekKey | Band datum is keyed to the correct ISO week string |
| Exact percentile values | Hand-calculated p05/p15/p50/p85/p95 for `[10,20,30,40,50,60,70]` |
| Monotonicity | p05 ≤ p15 ≤ p50 ≤ p85 ≤ p95 for any valid input |
| Fallback < 3 trips | Correct ±5%/±10% envelope around `w.avgSpeed` |
| Fallback 0 trips | All band values are 0 when avgSpeed is 0 |
| Multi-week ordering | Two weeks produce two datums in the correct order |
| 7-day window | Row 8 days after week start is excluded |
| Precision | All values are exactly 1 decimal place |

**`buildBands with tod filter` (4 tests)**
| Test | What it verifies |
|---|---|
| `tod="all"` identity | Calling with explicit "all" equals calling with default |
| Morning exclusion | `weekday_morning` excludes evening rows, raising the median |
| 2-trip mean fallback | Fallback uses mean of 2 matched trips, not `w.avgSpeed` |
| Zero-match last-resort | When no trips match `late_hours`, falls back to `w.avgSpeed` |

### 6.2 E2E tests — `tests/e2e/forecast-bands.spec.ts`

Fixture: `tests/fixtures/e2e-forecast-bands.csv` — 17 rows, 4 weeks, all on "Hosur Road" at 08:30 Mon–Fri. Weeks 1–3 have 5 trips each (real bands); week 4 has 2 trips (fallback).

| Test | What it covers |
|---|---|
| Card present when data exists | `data-testid="forecast-bands-card"` visible |
| Card absent when CSV empty | `allRouteWeeks=[]` → `trafficNowData.length===0` → card not in DOM |
| Content hidden by default | Subtitle paragraph `·` not visible (`tnOpen=false` initial state) |
| Toggle reveals content | Subtitle visible after clicking the toggle button |
| Toggle collapses again | Subtitle hidden after second click |
| No JS errors with sparse week | page errors array empty after expanding sparse-week fixture |
| Card visible on `weekday_morning` ToD | Fixture rows at 08:30 legitimately match the filter |

**Selector note:** The subtitle paragraph is identified by `/Weekly speed distribution ·/`
(regex including the middle-dot separator) rather than a plain text string. This avoids
a strict-mode violation that would otherwise arise because the card title "Weekly Speed
Distribution" and the SVG `<title>` element both contain the same phrase without the dot.

---

## 7. Future work

### 7.1 Forward-looking slot profile (high value, moderate effort)

The most useful thing this card could do is answer: *"Given that today is Tuesday and I
travel at 08:30, what speed range should I expect?"*

Implementation sketch:
1. Group `allRouteRows` by `(dayOfWeek, Math.floor(hour))` buckets.
2. For each non-empty bucket, compute `p15 / p50 / p85`.
3. Render as a compact bar chart or heatmap grid (7 days × N hour slots).
4. Highlight the current day/hour bucket.

This would require no changes to the existing `buildBands` path — it would be a new
component alongside the current chart, or a toggle between "history" and "profile" views.

### 7.2 Sparse-week visual indicator (low effort)

Mark weeks where the fallback path was used (< 3 trips) with a dashed band or a small
annotation so users understand those weeks have less statistical confidence. The
`IntervalDatum` type could gain an optional `isFallback: boolean` field; `UncertaintyBandChart`
could render dashed strokes for those data points.

### 7.3 Summary sentence above the chart (low effort, high user value)

A single pre-computed sentence above the chart would do more for forewarning than the
full chart for casual users. Example:

> "Speeds in the last 4 weeks (28–36 km/h typical) are **12 % slower** than your
> baseline (32–42 km/h). Your commute is taking roughly 4 minutes longer per trip."

This is already computable from `trafficNowData` and `trafficNowCompare` median values
and the baseline KPI stats — no new data needed.

### 7.4 Card open by default

`tnOpen` defaults to `false` (collapsed). Consider defaulting to `true` once the card
title and content are trustworthy enough to deserve prime attention. Currently the Verdict
card carries more weight; the distribution chart is supplementary.

---

## 8. Naming and copy reference

| Location | Old text | New text |
|---|---|---|
| `Dashboard.tsx` card title | Speed Forecast Bands | Weekly Speed Distribution |
| `Dashboard.tsx` SVG `<title>` | TrafficNOW! forecast bands for {route} | Weekly speed distribution for {route} |
| `tooltipContent.ts` title | Speed forecast bands | Weekly speed distribution |
| `tooltipContent.ts` body | "…expected range of traffic speeds…" | "…how speeds were distributed…filtered to your selected time bracket…" |
| `forecastBands.ts` JSDoc | (no mention of tod) | Documents tod filter and fallback tiers |
