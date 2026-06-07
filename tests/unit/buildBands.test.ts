import { describe, test, expect } from "bun:test";
import { buildBands } from "@/lib/forecastBands";
import type { WeeklyAggregate, TrafficRow } from "@/lib/useTrafficData";

/* ── helpers ────────────────────────────────────────────────────── */

const WEEK = "2026-04-07";   // Monday
const WEEK_MS = new Date(WEEK).getTime();

/** Build a minimal WeeklyAggregate for the given weekKey */
function makeWeek(weekKey: string, avgSpeed = 30): WeeklyAggregate {
  return {
    weekKey,
    weekStart: new Date(weekKey),
    lastDate: new Date(weekKey),
    avgSpeed,
    p05Speed: 0,
    p95Speed: 0,
    avgDuration: 0,
    p05Duration: 0,
    medianDuration: 0,
    p95Duration: 0,
    count: 0,
  };
}

/** Build a TrafficRow with the given speed, placed inside WEEK */
function makeRow(speed_kmh: number, offsetMs = 0): TrafficRow {
  return {
    timestamp: new Date(WEEK_MS + offsetMs),
    route_code: "R-001",
    label_short: "Hosur Road",
    duration_min: 30,
    distance_km: 18,
    speed_kmh,
    hour: 8,
    dayOfWeek: 1,
    weekKey: WEEK,
    temp_c: null,
    realfeel_c: null,
    humidity_pct: null,
    aqi: null,
    rsi_flag: null,
  };
}

const rows7 = [10, 20, 30, 40, 50, 60, 70].map((s, i) => makeRow(s, i * 3_600_000));

/* ── Tests ──────────────────────────────────────────────────────── */

describe("buildBands", () => {
  test("returns empty array when weeks is empty", () => {
    expect(buildBands([], rows7)).toEqual([]);
  });

  test("real bands (≥ 3 trips): x matches weekKey", () => {
    const [datum] = buildBands([makeWeek(WEEK)], rows7);
    expect(datum.x).toBe(WEEK);
  });

  test("real bands (≥ 3 trips): exact percentile values for [10,20,30,40,50,60,70]", () => {
    // sorted = [10,20,30,40,50,60,70], n=7
    // percentile(p) = p/100 * 6 → index
    // p05 → idx=0.3 → 10+(20-10)*0.3 = 13.0
    // p15 → idx=0.9 → 10+(20-10)*0.9 = 19.0
    // p50 → idx=3.0 → 40.0
    // p85 → idx=5.1 → 60+(70-60)*0.1 = 61.0
    // p95 → idx=5.7 → 60+(70-60)*0.7 = 67.0
    const [datum] = buildBands([makeWeek(WEEK)], rows7);
    expect(datum.p05).toBe(13.0);
    expect(datum.p15).toBe(19.0);
    expect(datum.p50).toBe(40.0);
    expect(datum.p85).toBe(61.0);
    expect(datum.p95).toBe(67.0);
  });

  test("monotonicity: p05 ≤ p15 ≤ p50 ≤ p85 ≤ p95 for any valid input", () => {
    const [datum] = buildBands([makeWeek(WEEK)], rows7);
    expect(datum.p05).toBeLessThanOrEqual(datum.p15);
    expect(datum.p15).toBeLessThanOrEqual(datum.p50);
    expect(datum.p50).toBeLessThanOrEqual(datum.p85);
    expect(datum.p85).toBeLessThanOrEqual(datum.p95);
  });

  test("fallback (< 3 trips): flat ±5%/±10% bands around avgSpeed", () => {
    // 2 rows → falls back to week.avgSpeed=30
    const twoRows = [makeRow(25), makeRow(35)];
    const [datum] = buildBands([makeWeek(WEEK, 30)], twoRows);
    expect(datum.p05).toBe(27.0);  // 30 * 0.90
    expect(datum.p15).toBe(28.5);  // 30 * 0.95
    expect(datum.p50).toBe(30.0);
    expect(datum.p85).toBe(31.5);  // 30 * 1.05
    expect(datum.p95).toBe(33.0);  // 30 * 1.10
  });

  test("fallback (0 trips): all band values are 0 when avgSpeed is 0", () => {
    const [datum] = buildBands([makeWeek(WEEK, 0)], []);
    expect(datum.p05).toBe(0);
    expect(datum.p15).toBe(0);
    expect(datum.p50).toBe(0);
    expect(datum.p85).toBe(0);
    expect(datum.p95).toBe(0);
  });

  test("multi-week: produces one datum per week in the correct order", () => {
    const WEEK2 = "2026-04-14";
    const WEEK2_MS = new Date(WEEK2).getTime();
    const rows2 = [10, 20, 30, 40, 50].map((s, i) =>
      ({ ...makeRow(s, 0), timestamp: new Date(WEEK2_MS + i * 3_600_000), weekKey: WEEK2 }),
    );
    const result = buildBands([makeWeek(WEEK), makeWeek(WEEK2)], [...rows7, ...rows2]);
    expect(result).toHaveLength(2);
    expect(result[0].x).toBe(WEEK);
    expect(result[1].x).toBe(WEEK2);
  });

  test("only uses rows within the 7-day window: excludes rows outside the week", () => {
    // row 8 days after WEEK_START falls outside the window → treated as 0 trips → fallback
    const lateRow = makeRow(40, 8 * 86400_000);
    const [datum] = buildBands([makeWeek(WEEK, 25)], [lateRow]);
    // < 3 trips in window → fallback around avgSpeed=25
    expect(datum.p50).toBe(25.0);
  });

  test("precision: all values rounded to 1 decimal place", () => {
    // speeds [11,22,33,44,55,66,77] produce non-integer percentiles
    const precRows = [11, 22, 33, 44, 55, 66, 77].map((s, i) => makeRow(s, i * 1000));
    const [datum] = buildBands([makeWeek(WEEK)], precRows);
    const check = (v: number) => expect(+v.toFixed(1)).toBe(v);
    check(datum.p05); check(datum.p15); check(datum.p50); check(datum.p85); check(datum.p95);
  });
});
