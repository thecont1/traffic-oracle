# TDD Investigation Plan: Calendar Shows May 11, Trend Charts Show May 4

## Problem Statement

The "Daily Speeds by Month" calendar widget displays traffic data through **May 11**, while the trend charts (speed/duration over time, baseline vs recent) only show data through **May 4**. Both widgets consume the same `allRows` from `useTrafficData()`. The data source is `csv-bangalore_traffic.csv` from `thecont1/blr-traffic-monitor`.

## Hypothesis Tree

```
H1: allRows is loaded with data only through May 4
    └─ Evidence: If true, calendar couldn't show May 11
    └─ Test: Dump allRows timestamps after fetch

H2: Calendar widget uses a different data path that bypasses period filter
    └─ Evidence: useDailyStatsAllDay has NO period cutoff; useFilteredData DOES
    └─ Test: Compare date ranges of both hooks' outputs

H3: Rows for May 5-11 are being dropped during parsing in fetchTrafficData()
    └─ Evidence: getCol() failures or speed_kmh/duration_min filters
    └─ Test: Parse raw CSV and count rows per date

H4: toWeekKey() assigns May 5-11 dates to a week that already exists
    └─ Evidence: Week key collision between old and new data
    └─ Test: Compute toWeekKey for each date and check for collisions

H5: useFilteredData period cutoff is too aggressive
    └─ Evidence: lastDataMs is correct but cutoff excludes recent rows
    └─ Test: Verify cutoff date computation for each period

H6: Stale browser cache served May 4 data on initial load
    └─ Evidence: Refresh button loads newer data
    └─ Test: Compare data before and after manual refresh
```

## Test Suite Plan

### Phase 1: Data Integrity Tests (fetchTrafficData)

**Test 1.1 — CSV parsing preserves all rows**
```
Given: Raw CSV text with known row count
When:  Parsed via Papa.parse with header:true, skipEmptyLines:true
Then:  Output row count matches expected count
```

**Test 1.2 — Date parsing handles all formats in the CSV**
```
Given: Date strings like "2026-05-15", "2026-05-01"
When:  Parsed via new Date(tsString)
Then:  No NaN timestamps, dates round-trip correctly
```

**Test 1.3 — Speed/duration filters don't drop valid rows**
```
Given: Rows with speed_kmh in [1, 150] and duration_min in [1, 300]
When:  Filtered by fetchTrafficData validation
Then:  All rows pass; zero false positives
```

**Test 1.4 — getCol handles column name mismatches**
```
Given: CSV with inconsistent column casing/spelling
When:  getCol() searches with fallback fuzzy match
Then:  Correct values returned for date, time, route_code, duration, distance
```

### Phase 2: Aggregation Tests (useDailyStatsAllDay vs useFilteredData)

**Test 2.1 — useDailyStatsAllDay includes all dates**
```
Given: allRows with dates from 2026-04-01 to 2026-05-11
When:  useDailyStatsAllDay("SomeRoute", "all")
Then:  Map contains entries for every date in range
```

**Test 2.2 — useFilteredData respects period cutoff**
```
Given: allRows with dates from 2026-04-01 to 2026-05-11, period="1m"
When:  useFilteredData(allRows, route, "1m", "all")
Then:  Filtered rows start from ~2026-04-11, end at 2026-05-11
```

**Test 2.3 — lastDataMs computes correct max date**
```
Given: allRows with max timestamp = 2026-05-11T18:00:00
When:  lastDataMs = Math.max(...allRows.map(r => r.timestamp.getTime()))
Then:  lastDataMs corresponds to 2026-05-11T18:00:00
```

**Test 2.4 — periodCutoffDate computation**
```
Given: lastDataMs = May 11, period = "1m"
When:  cutoff = new Date(lastDataMs); cutoff.setMonth(cutoff.getMonth() - 1)
Then:  cutoff = April 11
```

### Phase 3: Integration Tests (full pipeline)

**Test 3.1 — Freshness: fetch returns latest data**
```
Given: CSV on GitHub updated within the last hour
When:  fetchTrafficData() with cache:'no-store' + bust()
Then:  Data includes rows dated today
```

**Test 3.2 — Consistency: calendar and charts see same date range**
```
Given: Single fetch of allRows
When:  Both useDailyStatsAllDay and useFilteredData are called
Then:  Max date in both outputs is identical
```

**Test 3.3 — Cache bypass verification**
```
Given: Two consecutive fetches within 1 second
When:  bust() appends different timestamps
Then:  Both requests go to network (not from cache)
```

### Phase 4: Regression Tests

**Test 4.1 — Empty CSV handling**
```
Given: Empty CSV (header only)
When:  Parsed
Then:  Returns empty arrays, no crash
```

**Test 4.2 — Malformed rows are skipped gracefully**
```
Given: CSV with some rows missing date/time columns
When:  Parsed
Then:  Valid rows processed, invalid rows skipped, error not thrown
```

**Test 4.3 — Week key uniqueness**
```
Given: Consecutive weeks of data
When:  toWeekKey() applied to each Monday
Then:  All week keys are unique and sequential
```

## Implementation Order

1. **Write tests first** (Phase 1) in `tests/unit/useTrafficData.test.ts`
2. **Run tests** — they should fail (red)
3. **Fix parsing/filtering bugs** in `useTrafficData.ts` until tests pass (green)
4. **Add Phase 2 tests** for aggregation hooks
5. **Add Phase 3 integration tests** using mocked fetch responses
6. **Add Phase 4 regression tests** as guardrails
7. **Run full typecheck + test suite** — all green

## Tools & Setup

- Test runner: Vitest (already in mockup-sandbox) or Jest
- Mock fetch: `globalThis.fetch` override
- CSV fixtures: Store sample CSVs in `tests/fixtures/`
- Run: `bun run test` (add script to root package.json)

## Expected Root Cause (Most Likely)

The calendar widget (`useDailyStatsAllDay`) has **no period filter** — it processes ALL rows. The trend charts (`useFilteredData`) apply a **period cutoff** based on `lastDataMs`. If `allRows` is stale (loaded before the cache-busting fix), `lastDataMs` reflects May 4, and the charts correctly filter to that range. The calendar, processing unfiltered data, would also show May 4 — **unless** the page was reloaded after the fix deployed, in which case the calendar picks up fresh data through May 11 while the chart's `periodCutoffDate` still references the old `lastDataMs`.

**The real fix is ensuring `allRows` always contains the freshest data on every page load** — which is what the cache-busting + proxy changes accomplish. The TDD suite confirms this.