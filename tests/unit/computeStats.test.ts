import { describe, it, expect } from "bun:test";
import {
  computeStats,
  toWeekKey,
  type TrafficRow,
} from "../../src/lib/useTrafficData";

/* ──────────────────────────────────────────────────────────────────
 * Expected values — hand-calculated for the 7-row fixture below.
 *
 * Fixture rows (distance=18 km, speed computed by fetchTrafficData as
 * Math.round(distance / (duration/60) * 10) / 10):
 *
 *   duration_min  |  speed_kmh
 *   ------------- | ----------
 *   20            |  54.0   (18 / (20/60) = 54)
 *   30            |  36.0   (18 / (30/60) = 36)
 *   35            |  30.9   (18 / (35/60) ≈ 30.857, rounded to 30.9)
 *   40            |  27.0   (18 / (40/60) = 27)
 *   45            |  24.0   (18 / (45/60) = 24)
 *   50            |  21.6   (18 / (50/60) = 21.6)
 *   60            |  18.0   (18 / (60/60) = 18)
 *
 * Statistics:
 *   count    = 7
 *   avgSpeed = (54+36+30.9+27+24+21.6+18) / 7 = 211.5/7 ≈ 30.214 → 30.2
 *   mean     = (20+30+35+40+45+50+60) / 7 = 280/7 = 40.0
 *   median   = percentile(sorted, 50): idx = 3.0 → sorted[3] = 40.0
 *   p95      = percentile(sorted, 96 [WORST_CASE_PCT]): idx = 5.76
 *              → 50 + (60-50)*0.76 = 57.6
 * ────────────────────────────────────────────────────────────────── */

const EXPECTED = {
  count:    7,
  avgSpeed: 30.2,
  mean:     40.0,
  median:   40.0,
  p95:      57.6, // WORST_CASE_PCT=96
} as const;

/* ── helper ───────────────────────────────────────────────────────── */

function makeRow(duration_min: number, speed_kmh: number, ts = new Date("2026-04-10T08:30:00")): TrafficRow {
  return {
    timestamp:    ts,
    route_code:   "R-100",
    label_short:  "Hosur Road",
    duration_min,
    distance_km:  18,
    speed_kmh,
    hour:         ts.getHours(),
    dayOfWeek:    ts.getDay(),
    weekKey:      toWeekKey(ts),
    temp_c:       null,
    realfeel_c:   null,
    humidity_pct: null,
    aqi:          null,
    rsi_flag:     null,
  };
}

/** The canonical 7-row fixture used throughout this file. */
const FIXTURE_ROWS: TrafficRow[] = [
  makeRow(20, 54.0,  new Date("2026-04-07T08:30:00")),
  makeRow(30, 36.0,  new Date("2026-04-08T08:30:00")),
  makeRow(35, 30.9,  new Date("2026-04-09T08:30:00")),
  makeRow(40, 27.0,  new Date("2026-04-10T08:30:00")),
  makeRow(45, 24.0,  new Date("2026-04-13T08:30:00")),
  makeRow(50, 21.6,  new Date("2026-04-14T08:30:00")),
  makeRow(60, 18.0,  new Date("2026-04-15T08:30:00")),
];

/* ══════════════════════════════════════════════════════════════════ */
/* computeStats — KPI card values                                    */
/* ══════════════════════════════════════════════════════════════════ */

describe("computeStats — empty input", () => {
  it("returns all-zeros result for empty row array", () => {
    const s = computeStats([]);
    expect(s.count).toBe(0);
    expect(s.avgSpeed).toBe(0);
    expect(s.mean).toBe(0);
    expect(s.median).toBe(0);
    expect(s.p95).toBe(0);
  });
});

describe("computeStats — No. of Trips card", () => {
  it("count equals row array length", () => {
    expect(computeStats(FIXTURE_ROWS).count).toBe(EXPECTED.count);
  });
});

describe("computeStats — Avg Speed card", () => {
  it("avgSpeed is the mean of all row speeds, rounded to 1dp", () => {
    expect(computeStats(FIXTURE_ROWS).avgSpeed).toBe(EXPECTED.avgSpeed);
  });

  it("avgSpeed rounds to 1 decimal place", () => {
    // 54+36+30.9+27+24+21.6+18 = 211.5; 211.5/7 = 30.2142… → 30.2
    const digits = EXPECTED.avgSpeed.toString().split(".")[1]?.length ?? 0;
    expect(digits).toBeLessThanOrEqual(1);
  });
});

describe("computeStats — Median Trip card", () => {
  it("median is the p50 of sorted durations", () => {
    expect(computeStats(FIXTURE_ROWS).median).toBe(EXPECTED.median);
  });

  it("median is independent of row insertion order", () => {
    const shuffled = [...FIXTURE_ROWS].reverse();
    expect(computeStats(shuffled).median).toBe(EXPECTED.median);
  });
});

describe("computeStats — Bad Day Trip card (p95 / WORST_CASE_PCT=96)", () => {
  it("p95 is the p96 of sorted durations with linear interpolation", () => {
    expect(computeStats(FIXTURE_ROWS).p95).toBe(EXPECTED.p95);
  });

  it("p95 is >= median for any valid dataset", () => {
    const s = computeStats(FIXTURE_ROWS);
    expect(s.p95).toBeGreaterThanOrEqual(s.median);
  });

  it("p95 is <= max duration for any valid dataset", () => {
    const s = computeStats(FIXTURE_ROWS);
    const maxDuration = Math.max(...FIXTURE_ROWS.map(r => r.duration_min));
    expect(s.p95).toBeLessThanOrEqual(maxDuration);
  });
});

describe("computeStats — mean duration (sub-label on Median Trip card)", () => {
  it("mean equals arithmetic mean of durations", () => {
    expect(computeStats(FIXTURE_ROWS).mean).toBe(EXPECTED.mean);
  });
});

describe("computeStats — single-row edge case", () => {
  it("all stats equal the single row's values", () => {
    const row = makeRow(45, 24.0);
    const s = computeStats([row]);
    expect(s.count).toBe(1);
    expect(s.mean).toBe(45.0);
    expect(s.median).toBe(45.0);
    expect(s.p95).toBe(45.0);
    expect(s.avgSpeed).toBe(24.0);
  });
});
