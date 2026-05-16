/* ── Phase 1: Data Integrity ─────────────────────────────────────────── */
/* ── Phase 2: Aggregation ───────────────────────────────────────────── */
/* ── Phase 4: Regression ───────────────────────────────────────────── */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import {
  getCol,
  parseNum,
  toWeekKey,
  percentile,
  matchesToD,
  bust,
  aggregateRows,
  computeStats,
  fetchTrafficData,
  type TrafficRow,
  type TimeOfDay,
  type TimePeriod,
} from "../../src/lib/useTrafficData";
import * as Papa from "papaparse";

/* ── helpers ─────────────────────────────────────────────────────────── */

function makeRow(overrides: Partial<TrafficRow>): TrafficRow {
  const ts = overrides.timestamp ?? new Date("2026-04-08T12:00:00");
  return {
    timestamp: ts,
    route_code: "R-100",
    label_short: "Hosur Road",
    duration_min: 35,
    distance_km: 18,
    speed_kmh: 30.9,
    hour: ts.getHours(),
    dayOfWeek: ts.getDay(),
    weekKey: toWeekKey(ts),
    ...overrides,
  };
}

/** Replicate the date-key logic used by the daily-stats maps */
function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* ══════════════════════════════════════════════════════════════════════ */
/* Phase 1 — Data Integrity                                             */
/* ══════════════════════════════════════════════════════════════════════ */

describe("Phase 1 — Data Integrity", () => {
  /* ── 1.1 CSV parsing preserves all rows ────────────────────────────── */
  describe("1.1 — CSV parsing preserves all rows", () => {
    it("parses a well-formed CSV with correct row count", () => {
      const csv = [
        "date,time,route_code,label_full,label_short,duration,distance",
        "2026-04-01,08:30,R-100,Hosur Road,Hosur Road,35,18",
        "2026-04-01,09:00,R-100,Hosur Road,Hosur Road,42,18",
        "2026-04-01,17:30,R-101,Outer Ring Rd,Outer Ring Rd,55,22",
      ].join("\n");

      const result = Papa.parse(csv, { header: true, skipEmptyLines: true });
      expect(result.data.length).toBe(3);
    });

    it("handles quoted fields with commas", () => {
      const csv = [
        'route_code,label_full,label_short',
        'R-100,"Hosur Road, Extended","Hosur Road"',
      ].join("\n");

      const result = Papa.parse(csv, { header: true, skipEmptyLines: true });
      expect(result.data[0]["label_full"]).toBe("Hosur Road, Extended");
    });

    it("skips truly empty lines", () => {
      const csv = [
        "date,time,route_code",
        "2026-04-01,08:30,R-100",
        "",
        "2026-04-01,09:00,R-100",
        "",
      ].join("\n");

      // Papa.parse with skipEmptyLines:true skips "" but not whitespace-only lines.
      // Use skipEmptyLines:"greedy" to skip whitespace-only lines too.
      const result = Papa.parse(csv, { header: true, skipEmptyLines: "greedy" });
      expect(result.data.length).toBe(2);
    });
  });

  /* ── 1.2 Date parsing handles all formats ──────────────────────────── */
  describe("1.2 — Date parsing produces valid timestamps", () => {
    it("parses date+time into a valid Date", () => {
      const csv = [
        "date,time,route_code,label_full,label_short,duration,distance",
        "2026-04-08,08:30,R-100,Hosur Road,Hosur Road,35,18",
        "2026-05-15,18:45,R-101,Outer Ring Rd,Outer Ring Rd,40,20",
      ].join("\n");

      const rows = Papa.parse(csv, { header: true, skipEmptyLines: true })
        .data as Record<string, string>[];

      for (const r of rows) {
        const dateRaw = (r.date ?? "").trim();
        const timeRaw = (r.time ?? "").trim();
        const tsString = timeRaw
          ? `${dateRaw}T${timeRaw}:00`
          : `${dateRaw}T12:00:00`;
        const ts = new Date(tsString);
        expect(isNaN(ts.getTime())).toBe(false);
      }
    });

    it("defaults to 12:00:00 when time is empty", () => {
      const dateRaw = "2026-04-08";
      const tsString = `${dateRaw}T12:00:00`;
      const ts = new Date(tsString);
      expect(ts.getHours()).toBe(12);
      expect(ts.getMinutes()).toBe(0);
    });

    it("handles dates at month boundaries", () => {
      // April has 30 days
      const ts = new Date("2026-04-30T18:00:00");
      expect(ts.getDate()).toBe(30);
      expect(ts.getMonth()).toBe(3); // April = month 3 (0-indexed)

      // Rolling into next month
      const ts2 = new Date("2026-01-31T12:00:00");
      expect(ts2.getDate()).toBe(31);
    });
  });

  /* ── 1.3 Speed/duration filters don't drop valid rows ──────────────── */
  describe("1.3 — Speed/duration filters accept valid ranges", () => {
    it("accepts duration_min in range [1, 300]", () => {
      const validDurations = [1, 5, 30, 60, 120, 299, 300];
      for (const d of validDurations) {
        const row = makeRow({ duration_min: d });
        // In fetchTrafficData, rows with duration_min <= 0 || > 300 are skipped
        const isValid = row.duration_min > 0 && row.duration_min <= 300;
        expect(isValid).toBe(true);
      }
    });

    it("rejects duration_min outside range", () => {
      const invalidDurations = [0, -1, 301, 1000];
      for (const d of invalidDurations) {
        const row = makeRow({ duration_min: d });
        const isValid = row.duration_min > 0 && row.duration_min <= 300;
        expect(isValid).toBe(false);
      }
    });

    it("accepts speed_kmh in range [1, 150]", () => {
      const validSpeeds = [1, 15, 45, 80, 120, 149, 150];
      for (const s of validSpeeds) {
        const row = makeRow({ speed_kmh: s });
        const isValid = row.speed_kmh > 0 && row.speed_kmh <= 150;
        expect(isValid).toBe(true);
      }
    });

    it("rejects speed_kmh outside range", () => {
      const invalidSpeeds = [0, -5, 151, 300];
      for (const s of invalidSpeeds) {
        const row = makeRow({ speed_kmh: s });
        const isValid = row.speed_kmh > 0 && row.speed_kmh <= 150;
        expect(isValid).toBe(false);
      }
    });

    it("computes speed correctly from distance and duration", () => {
      // 18 km / (35 min / 60) = 30.857... ≈ 30.9
      const row = makeRow({ distance_km: 18, duration_min: 35 });
      const speed = Math.round((row.distance_km / (row.duration_min / 60)) * 10) / 10;
      expect(speed).toBeCloseTo(30.9, 1);
    });
  });

  /* ── 1.4 getCol handles column name mismatches ─────────────────────── */
  describe("1.4 — getCol column matching", () => {
    it("returns value for exact key match", () => {
      const row = { date: "2026-05-01", time: "08:30", duration: "35" };
      expect(getCol(row, "date")).toBe("2026-05-01");
      expect(getCol(row, "time")).toBe("08:30");
      expect(getCol(row, "duration")).toBe("35");
    });

    it("falls back to case-insensitive match", () => {
      const row = { Date: "2026-05-01", TIME: "08:30", Duration: "35" };
      expect(getCol(row, "date")).toBe("2026-05-01");
      expect(getCol(row, "time")).toBe("08:30");
      expect(getCol(row, "duration")).toBe("35");
    });

    it("tries keys in order and returns the first match", () => {
      const row = { route_code: "R-100", routeCode: "R-100-alt" };
      expect(getCol(row, "route_code", "routeCode")).toBe("R-100");
    });

    it("falls through to second key when first is missing", () => {
      const row = { routeCode: "R-100" };
      expect(getCol(row, "route_code", "routeCode")).toBe("R-100");
    });

    it("returns empty string when no key matches", () => {
      const row = { other_field: "value" };
      expect(getCol(row, "date", "time")).toBe("");
    });

    it("handles empty and null values by skipping them", () => {
      const row = { date: "", time: "08:30", duration: "30" };
      expect(getCol(row, "date", "time")).toBe("08:30");
      expect(getCol(row, "duration")).toBe("30");
    });

    it("handles trimmed whitespace in key matching", () => {
      const row = { " date ": "2026-05-01" };
      expect(getCol(row, "date")).toBe("2026-05-01");
    });
  });

  /* ── 1.5 Full fetch pipeline with mocked fetch ─────────────────────── */
  describe("1.5 — fetchTrafficData pipeline", () => {
    const routesCsv = [
      "route_code,label_full,label_short",
      "R-100,Hosur Road,Hosur Road",
      "R-101,Outer Ring Road,Outer Ring Rd",
    ].join("\n");

    const trafficCsv = [
      "date,time,route_code,label_full,label_short,duration,distance",
      "2026-05-10,08:30,R-100,Hosur Road,Hosur Road,35,18",
      "2026-05-10,09:15,R-100,Hosur Road,Hosur Road,42,18",
      "2026-05-10,17:30,R-101,Outer Ring Road,Outer Ring Rd,55,22",
    ].join("\n");

    let originalFetch: typeof globalThis.fetch;

    beforeAll(() => {
      originalFetch = globalThis.fetch;
      globalThis.fetch = ((url: string) => {
        if (url.includes("csv-routes.csv")) {
          return Promise.resolve({
            ok: true,
            text: () => Promise.resolve(routesCsv),
          } as Response);
        }
        if (url.includes("csv-bangalore_traffic.csv")) {
          return Promise.resolve({
            ok: true,
            text: () => Promise.resolve(trafficCsv),
          } as Response);
        }
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      }) as typeof globalThis.fetch;
    });

    afterAll(() => {
      globalThis.fetch = originalFetch;
    });

    it("with mocked fetch, returns parsed routes and rows", async () => {
      const { routes, allRows, rowCount } = await fetchTrafficData(undefined);

      expect(routes).toHaveLength(2);
      expect(routes[0].route_code).toBe("R-100");
      expect(routes[0].label_full).toBe("Hosur Road");
      expect(routes[1].route_code).toBe("R-101");

      expect(rowCount).toBe(3);
      expect(allRows[0].label_short).toBe("Hosur Road");
      expect(allRows[0].speed_kmh).toBeCloseTo(30.9, 1);
    });

    it("filters rows that fail speed/duration validation", async () => {
      // The test CSV has valid rows; add an invalid one via separate mock
      const badCsv = [
        "date,time,route_code,label_full,label_short,duration,distance",
        "2026-05-10,08:30,R-100,Hosur Road,Hosur Road,0,18",     // duration 0 → skipped
        "2026-05-10,09:15,R-100,Hosur Road,Hosur Road,35,18",    // valid
        "2026-05-10,10:00,R-100,Hosur Road,Hosur Road,35,5000",  // speed > 150 → skipped
      ].join("\n");

      globalThis.fetch = ((url: string) => {
        if (url.includes("csv-routes.csv")) {
          return Promise.resolve({
            ok: true,
            text: () => Promise.resolve(routesCsv),
          } as Response);
        }
        if (url.includes("csv-bangalore_traffic.csv")) {
          return Promise.resolve({
            ok: true,
            text: () => Promise.resolve(badCsv),
          } as Response);
        }
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      }) as typeof globalThis.fetch;

      const { allRows } = await fetchTrafficData(undefined);
      // Only 1 of 3 rows should pass validation
      expect(allRows).toHaveLength(1);
      expect(allRows[0].duration_min).toBe(35);
    });

    it("fails gracefully on HTTP error", async () => {
      globalThis.fetch = (() =>
        Promise.resolve({
          ok: false,
          status: 500,
          text: () => Promise.resolve("Internal Server Error"),
        } as Response)) as typeof globalThis.fetch;

      await expect(
        fetchTrafficData(undefined),
      ).rejects.toThrow("HTTP 500");
    });

    it("includes cache-busting query param in fetch URL", async () => {
      const urlsSeen: string[] = [];
      globalThis.fetch = ((url: string) => {
        urlsSeen.push(url);
        if (url.includes("csv-routes.csv")) {
          return Promise.resolve({
            ok: true,
            text: () => Promise.resolve(routesCsv),
          } as Response);
        }
        if (url.includes("csv-bangalore_traffic.csv")) {
          return Promise.resolve({
            ok: true,
            text: () => Promise.resolve(trafficCsv),
          } as Response);
        }
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      }) as typeof globalThis.fetch;

      await fetchTrafficData(undefined);

      for (const url of urlsSeen) {
        expect(url).toMatch(/\?t=\d+$/);
      }
    });
  });
});

/* ══════════════════════════════════════════════════════════════════════ */
/* Phase 2 — Aggregation & Hook Logic                                   */
/* ══════════════════════════════════════════════════════════════════════ */

describe("Phase 2 — Aggregation", () => {
  /* ── 2.1 toWeekKey ─────────────────────────────────────────────────── */
  describe("2.1 — toWeekKey", () => {
    it("returns Monday-based week key for a Wednesday", () => {
      // April 8, 2026 is a Wednesday; week starts Monday April 6
      expect(toWeekKey(new Date("2026-04-08T12:00:00"))).toBe("2026-04-06");
    });

    it("returns the Monday date for a Monday", () => {
      expect(toWeekKey(new Date("2026-04-06T12:00:00"))).toBe("2026-04-06");
    });

    it("returns previous Monday for a Sunday", () => {
      expect(toWeekKey(new Date("2026-04-12T12:00:00"))).toBe("2026-04-06");
    });

    it("handles month boundary: April 30 → week of April 27", () => {
      // April 30, 2026 is Thursday; week starts April 27
      expect(toWeekKey(new Date("2026-04-30T12:00:00"))).toBe("2026-04-27");
    });

    it("handles year boundary: Jan 1 2026 → week of Dec 29 2025", () => {
      // Jan 1, 2026 is Thursday; week starts Dec 29, 2025
      expect(toWeekKey(new Date("2026-01-01T12:00:00"))).toBe("2025-12-29");
    });
  });

  /* ── 2.2 percentile ───────────────────────────────────────────────── */
  describe("2.2 — percentile", () => {
    it("computes median (p50) for odd count", () => {
      expect(percentile([10, 20, 30, 40, 50], 50)).toBe(30);
    });

    it("computes median (p50) for even count", () => {
      expect(percentile([10, 20, 30, 40], 50)).toBe(25);
    });

    it("returns 0 for empty array", () => {
      expect(percentile([], 50)).toBe(0);
    });

    it("computes p95 correctly", () => {
      // Linear interpolation: idx = 0.95 * 4 = 3.8
      // result = 40 + (100 - 40) * 0.8 = 88
      expect(percentile([10, 20, 30, 40, 100], 95)).toBeCloseTo(88, 10);
    });

    it("returns min for p0 and max for p100", () => {
      expect(percentile([10, 20, 30], 0)).toBe(10);
      expect(percentile([10, 20, 30], 100)).toBe(30);
    });
  });

  /* ── 2.3 matchesToD ───────────────────────────────────────────────── */
  describe("2.3 — matchesToD", () => {
    it("returns true for 'all' time of day", () => {
      expect(matchesToD(8, 1, "all")).toBe(true);
      expect(matchesToD(15, 3, "all")).toBe(true);
      expect(matchesToD(20, 6, "all")).toBe(true);
    });

    it("matches weekday mornings (8-12) on weekdays only", () => {
      expect(matchesToD(8, 1, "weekday_morning")).toBe(true);  // Mon 8am
      expect(matchesToD(11, 3, "weekday_morning")).toBe(true);  // Thu 11am
      expect(matchesToD(12, 2, "weekday_morning")).toBe(false); // 12pm boundary
      expect(matchesToD(8, 0, "weekday_morning")).toBe(false);  // Sunday
    });

    it("matches weekday afternoons (12-18)", () => {
      expect(matchesToD(12, 1, "weekday_afternoon")).toBe(true);
      expect(matchesToD(17, 3, "weekday_afternoon")).toBe(true);
      expect(matchesToD(18, 2, "weekday_afternoon")).toBe(false);
      expect(matchesToD(12, 6, "weekday_afternoon")).toBe(false); // weekend
    });

    it("matches weekday evenings (18-22)", () => {
      expect(matchesToD(18, 1, "weekday_evening")).toBe(true);
      expect(matchesToD(21, 4, "weekday_evening")).toBe(true);
      expect(matchesToD(22, 2, "weekday_evening")).toBe(false);
      expect(matchesToD(19, 0, "weekday_evening")).toBe(false); // weekend
    });

    it("matches weekends on Saturday and Sunday", () => {
      expect(matchesToD(10, 0, "weekends")).toBe(true);  // Sunday
      expect(matchesToD(14, 6, "weekends")).toBe(true);  // Saturday
      expect(matchesToD(10, 1, "weekends")).toBe(false); // Monday
    });
  });

  /* ── 2.4 aggregateRows ────────────────────────────────────────────── */
  describe("2.4 — aggregateRows", () => {
    it("groups rows by week key and computes averages", () => {
      const rows: TrafficRow[] = [
        makeRow({ timestamp: new Date("2026-04-08T08:00"), speed_kmh: 30, duration_min: 35, distance_km: 18 }),
        makeRow({ timestamp: new Date("2026-04-10T09:00"), speed_kmh: 40, duration_min: 45, distance_km: 20 }),
      ];

      const result = aggregateRows(rows);
      expect(result).toHaveLength(1);
      expect(result[0].weekKey).toBe("2026-04-06");
      expect(result[0].count).toBe(2);
      expect(result[0].avgSpeed).toBe(35);
      expect(result[0].avgDuration).toBe(40);
      expect(result[0].medianDuration).toBe(40);
    });

    it("sorts result by week key ascending", () => {
      const rows: TrafficRow[] = [
        makeRow({ timestamp: new Date("2026-04-20T08:00"), speed_kmh: 30, duration_min: 35, distance_km: 18 }),
        makeRow({ timestamp: new Date("2026-04-08T08:00"), speed_kmh: 40, duration_min: 45, distance_km: 20 }),
        makeRow({ timestamp: new Date("2026-04-13T08:00"), speed_kmh: 35, duration_min: 40, distance_km: 19 }),
      ];

      const result = aggregateRows(rows);
      expect(result).toHaveLength(3);
      expect(result.map(r => r.weekKey)).toEqual(["2026-04-06", "2026-04-13", "2026-04-20"]);
    });

    it("computes median and p95 durations correctly", () => {
      // 5 rows in the SAME week (April 8-12, 2026 → all in week 2026-04-06)
      // aggregateRows groups by week key, so this produces 1 weekly aggregate
      const rows: TrafficRow[] = [10, 20, 30, 40, 50].map((d, i) =>
        makeRow({ timestamp: new Date(`2026-04-${String(8 + i).padStart(2, "0")}T08:00`), duration_min: d, speed_kmh: 30, distance_km: 18 })
      );

      const result = aggregateRows(rows);
      expect(result).toHaveLength(1);
      expect(result[0].weekKey).toBe("2026-04-06");
      expect(result[0].count).toBe(5);
      // durations sorted: [10, 20, 30, 40, 50]
      expect(result[0].medianDuration).toBe(30); // middle value
      expect(result[0].p95Duration).toBeCloseTo(48, 10); // p95 via interpolation
    });

    it("returns empty array for empty input", () => {
      expect(aggregateRows([])).toEqual([]);
    });
  });

  /* ── 2.5 computeStats ─────────────────────────────────────────────── */
  describe("2.5 — computeStats", () => {
    it("computes mean, median, p95, avgSpeed, and count", () => {
      const rows: TrafficRow[] = [
        makeRow({ duration_min: 20, speed_kmh: 30 }),
        makeRow({ duration_min: 40, speed_kmh: 40 }),
        makeRow({ duration_min: 30, speed_kmh: 35 }),
      ];

      const result = computeStats(rows);
      expect(result.count).toBe(3);
      expect(result.mean).toBe(30); // (20+40+30)/3 = 30
      expect(result.median).toBe(30);
      expect(result.avgSpeed).toBe(35); // (30+40+35)/3 = 35
    });

    it("returns zeros for empty input", () => {
      expect(computeStats([])).toEqual({ mean: 0, median: 0, p95: 0, avgSpeed: 0, count: 0 });
    });

    it("handles single row correctly", () => {
      const rows: TrafficRow[] = [makeRow({ duration_min: 35, speed_kmh: 30.9 })];
      const result = computeStats(rows);
      expect(result.count).toBe(1);
      expect(result.mean).toBe(35);
      expect(result.median).toBe(35);
      expect(result.avgSpeed).toBe(30.9);
    });
  });

  /* ── 2.6 bust ─────────────────────────────────────────────────────── */
  describe("2.6 — bust (cache bypass)", () => {
    it("appends ?t=<timestamp> to the URL", () => {
      const before = Date.now();
      const result = bust("https://example.com/data.csv");
      const after = Date.now();

      expect(result).toMatch(/^https:\/\/example\.com\/data\.csv\?t=\d+$/);

      const ts = parseInt(result.split("?t=")[1], 10);
      expect(ts).toBeGreaterThanOrEqual(before);
      expect(ts).toBeLessThanOrEqual(after);
    });

    it("generates different timestamps on consecutive calls", () => {
      const ts1 = parseInt(bust("https://x.com/c.csv").split("?t=")[1], 10);
      const ts2 = parseInt(bust("https://x.com/c.csv").split("?t=")[1], 10);
      expect(ts2).toBeGreaterThanOrEqual(ts1);
    });

    it("preserves the base path of the URL", () => {
      const base = "https://raw.githubusercontent.com/thecont1/blr-traffic-monitor/main/csv-bangalore_traffic.csv";
      const busted = bust(base);
      expect(busted.startsWith(base)).toBe(true);
      expect(busted).toMatch(/\?t=\d+$/);
    });
  });

  /* ── 2.7 useFilteredData period cutoff ─────────────────────────────── */
  describe("2.7 — useFilteredData period cutoff (integration)", () => {
    /**
     * Replicate the cutoff logic from useFilteredData to verify behavior.
     * This mirrors the source code exactly so test failures point at logic bugs.
     */
    function computeCutoff(period: TimePeriod, now: Date): Date {
      const cutoff = new Date(now);
      if (period === "1m") cutoff.setMonth(cutoff.getMonth() - 1);
      else if (period === "3m") cutoff.setMonth(cutoff.getMonth() - 3);
      else if (period === "6m") cutoff.setMonth(cutoff.getMonth() - 6);
      else cutoff.setFullYear(cutoff.getFullYear() - 1);
      return cutoff;
    }

    it("1m period: cutoff is exactly 1 month before now", () => {
      const now = new Date("2026-05-15T18:00:00");
      const cutoff = computeCutoff("1m", now);
      expect(cutoff.getTime()).toBe(new Date("2026-04-15T18:00:00").getTime());
    });

    it("3m period: cutoff is exactly 3 months before now", () => {
      const now = new Date("2026-05-15T18:00:00");
      const cutoff = computeCutoff("3m", now);
      expect(cutoff.getTime()).toBe(new Date("2026-02-15T18:00:00").getTime());
    });

    it("6m period: cutoff is exactly 6 months before now", () => {
      const now = new Date("2026-05-15T18:00:00");
      const cutoff = computeCutoff("6m", now);
      expect(cutoff.getTime()).toBe(new Date("2025-11-15T18:00:00").getTime());
    });

    it("1y period: cutoff is exactly 1 year before now", () => {
      const now = new Date("2026-05-15T18:00:00");
      const cutoff = computeCutoff("1y", now);
      expect(cutoff.getTime()).toBe(new Date("2025-05-15T18:00:00").getTime());
    });

    it("filters rows on or after cutoff and keeps earlier ones out", () => {
      const now = new Date("2026-05-15T18:00:00");
      const cutoff = computeCutoff("1m", now); // April 15, 18:00

      const rows: TrafficRow[] = [
        makeRow({ timestamp: new Date("2026-04-10T12:00"), label_short: "Hosur Road" }),  // before cutoff
        makeRow({ timestamp: new Date("2026-04-15T18:00"), label_short: "Hosur Road" }),  // exactly at cutoff
        makeRow({ timestamp: new Date("2026-04-20T12:00"), label_short: "Hosur Road" }),  // after cutoff
        makeRow({ timestamp: new Date("2026-05-10T12:00"), label_short: "Hosur Road" }),  // after cutoff
      ];

      const filtered = rows.filter(r => r.timestamp >= cutoff && r.label_short === "Hosur Road");
      expect(filtered).toHaveLength(3);
      expect(filtered[0].timestamp.getTime()).toBe(new Date("2026-04-15T18:00").getTime());
    });

    it("3m period includes data going back 3 months", () => {
      const now = new Date("2026-05-15T18:00:00");
      const cutoff = computeCutoff("3m", now); // Feb 15

      const rows: TrafficRow[] = [
        makeRow({ timestamp: new Date("2026-02-10T12:00"), label_short: "Hosur Road" }),  // before cutoff
        makeRow({ timestamp: new Date("2026-02-15T18:00"), label_short: "Hosur Road" }),  // at cutoff
        makeRow({ timestamp: new Date("2026-04-01T12:00"), label_short: "Hosur Road" }),  // after cutoff
      ];

      const filtered = rows.filter(r => r.timestamp >= cutoff && r.label_short === "Hosur Road");
      expect(filtered).toHaveLength(2);
    });

    it("1y period includes data going back 1 year", () => {
      const now = new Date("2026-05-15T18:00:00");
      const cutoff = computeCutoff("1y", now); // May 15, 2025

      const rows: TrafficRow[] = [
        makeRow({ timestamp: new Date("2025-05-14T12:00"), label_short: "Hosur Road" }),  // before cutoff
        makeRow({ timestamp: new Date("2025-05-15T18:00"), label_short: "Hosur Road" }),  // at cutoff
        makeRow({ timestamp: new Date("2026-01-01T12:00"), label_short: "Hosur Road" }),  // after cutoff
      ];

      const filtered = rows.filter(r => r.timestamp >= cutoff && r.label_short === "Hosur Road");
      expect(filtered).toHaveLength(2);
    });

    /**
     * Calendar-vs-chart consistency: both should report the same max date.
     *
     * useDailyStatsAllDay filters by route only (no period cutoff).
     * useFilteredData filters by route + period cutoff from `new Date()`.
     *
     * Both should agree on the maximum date present in allRows.
     */
    it("calendar and charts agree on max date when data is fresh", () => {
      const allRows: TrafficRow[] = [];
      // Generate data from April 1 to May 11, 2026
      for (let day = 1; day <= 11; day++) {
        allRows.push(makeRow({
          timestamp: new Date(`2026-05-${String(day).padStart(2, "0")}T12:00:00`),
          label_short: "Hosur Road",
          duration_min: 30 + day,
          speed_kmh: 30 + day,
          distance_km: 15,
        }));
      }
      // Add some April data
      for (let day = 25; day <= 30; day++) {
        allRows.push(makeRow({
          timestamp: new Date(`2026-04-${String(day).padStart(2, "0")}T12:00:00`),
          label_short: "Hosur Road",
          duration_min: 30 + day,
          speed_kmh: 30 + day,
          distance_km: 15,
        }));
      }

      // Calendar (useDailyStatsAllDay logic): no cutoff, filter by route
      const calRows = allRows.filter(r => r.label_short === "Hosur Road");
      const calDates = calRows.map(r => dateKey(r.timestamp));
      const calMaxDate = calDates.reduce((a, b) => a > b ? a : b);

      // Charts (useFilteredData logic): with 1m period, cutoff = now - 1 month
      // Use "now" = May 15, so cutoff = April 15
      const now = new Date("2026-05-15T18:00:00");
      const cutoff = new Date(now);
      cutoff.setMonth(cutoff.getMonth() - 1); // April 15

      const chartRows = allRows.filter(
        r => r.label_short === "Hosur Road" && r.timestamp >= cutoff
      );
      const chartDates = chartRows.map(r => dateKey(r.timestamp));
      const chartMaxDate = chartDates.reduce((a, b) => a > b ? a : b);

      // Both should see May 11 as the latest date
      expect(calMaxDate).toBe("2026-05-11");
      expect(chartMaxDate).toBe("2026-05-11");
      expect(calMaxDate).toBe(chartMaxDate);
    });
  });

  /* ── 2.8 useDailyStatsAllDay includes all dates ────────────────────── */
  describe("2.8 — useDailyStatsAllDay logic (replicated)", () => {
    it("produces entries for every date in range when route matches", () => {
      const allRows: TrafficRow[] = [];
      for (let day = 1; day <= 11; day++) {
        allRows.push(makeRow({
          timestamp: new Date(`2026-04-${String(day).padStart(2, "0")}T12:00:00`),
          label_short: "Hosur Road",
        }));
      }

      // Replicate useDailyStatsAllDay logic
      const rows = allRows.filter(r => r.label_short === "Hosur Road");
      const byDay = new Map<string, TrafficRow[]>();
      for (const r of rows) {
        const key = dateKey(r.timestamp);
        const arr = byDay.get(key) ?? [];
        arr.push(r);
        byDay.set(key, arr);
      }

      expect(byDay.size).toBe(11);
      for (let day = 1; day <= 11; day++) {
        expect(byDay.has(`2026-04-${String(day).padStart(2, "0")}`)).toBe(true);
      }
    });

    it("excludes rows for a different route", () => {
      const allRows: TrafficRow[] = [
        makeRow({ timestamp: new Date("2026-04-08T12:00"), label_short: "Hosur Road" }),
        makeRow({ timestamp: new Date("2026-04-08T12:00"), label_short: "Outer Ring Rd" }),
      ];

      const rows = allRows.filter(r => r.label_short === "Hosur Road");
      expect(rows).toHaveLength(1);
      expect(rows[0].label_short).toBe("Hosur Road");
    });

    it("computes correct avgSpeed for a day with multiple rows", () => {
      const allRows: TrafficRow[] = [
        makeRow({ timestamp: new Date("2026-04-08T08:00"), speed_kmh: 30 }),
        makeRow({ timestamp: new Date("2026-04-08T09:00"), speed_kmh: 40 }),
        makeRow({ timestamp: new Date("2026-04-08T10:00"), speed_kmh: 50 }),
      ];

      const dayRows = allRows.filter(r => dateKey(r.timestamp) === "2026-04-08");
      const avgSpeed = dayRows.reduce((a, b) => a + b.speed_kmh, 0) / dayRows.length;
      expect(avgSpeed).toBe(40);
    });

    it("handles empty allRows gracefully", () => {
      const allRows: TrafficRow[] = [];
      const rows = allRows.filter(r => r.label_short === "Hosur Road");
      expect(rows).toHaveLength(0);
    });
  });
});

/* ══════════════════════════════════════════════════════════════════════ */
/* Phase 4 — Regression Tests                                           */
/* ══════════════════════════════════════════════════════════════════════ */

describe("Phase 4 — Regression", () => {
  /* ── 4.1 Empty CSV handling ────────────────────────────────────────── */
  describe("4.1 — Empty CSV handling", () => {
    it("produces empty map for empty allRows in useDailyStatsAllDay logic", () => {
      const allRows: TrafficRow[] = [];
      const rows = allRows.filter(r => r.label_short === "Hosur Road");
      expect(rows).toHaveLength(0);
    });

    it("returns zero stats for empty input in computeStats", () => {
      expect(computeStats([])).toEqual({
        mean: 0, median: 0, p95: 0, avgSpeed: 0, count: 0,
      });
    });

    it("returns empty array for empty input in aggregateRows", () => {
      expect(aggregateRows([])).toEqual([]);
    });

    it("PapaParse returns empty array for headers-only CSV", () => {
      const csv = "date,time,route_code,duration,distance\n";
      const result = Papa.parse(csv, { header: true, skipEmptyLines: true });
      expect(result.data).toHaveLength(0);
    });
  });

  /* ── 4.2 Malformed rows are skipped gracefully ─────────────────────── */
  describe("4.2 — Malformed row handling", () => {
    it("skips rows with duration > 300 (outlier filter)", () => {
      const row = makeRow({ duration_min: 350 });
      const isValid = row.duration_min > 0 && row.duration_min <= 300;
      expect(isValid).toBe(false);
    });

    it("skips rows with speed > 150 (outlier filter)", () => {
      const row = makeRow({ speed_kmh: 200 });
      const isValid = row.speed_kmh > 0 && row.speed_kmh <= 150;
      expect(isValid).toBe(false);
    });

    it("skips rows with duration_min = 0", () => {
      const row = makeRow({ duration_min: 0 });
      const isValid = row.duration_min > 0 && row.duration_min <= 300;
      expect(isValid).toBe(false);
    });

    it("handles rows with missing optional fields", () => {
      // parseNum returns 0 for empty strings
      expect(parseNum("")).toBe(0);
      expect(parseNum("")).toBe(0);
    });

    it("parseNum handles non-numeric strings gracefully", () => {
      expect(parseNum("abc")).toBe(0);
      expect(parseNum("12abc")).toBe(12); // parseFloat parses leading digits
    });

    it("skips rows with invalid dates", () => {
      const ts = new Date("invalid-date");
      expect(isNaN(ts.getTime())).toBe(true);
    });
  });

  /* ── 4.3 Week key uniqueness ───────────────────────────────────────── */
  describe("4.3 — Week key uniqueness", () => {
    it("generates unique keys for 6 consecutive Mondays", () => {
      const mondays = [
        "2026-04-06", "2026-04-13", "2026-04-20",
        "2026-04-27", "2026-05-04", "2026-05-11",
      ];
      const keys = mondays.map(d => toWeekKey(new Date(d + "T12:00:00")));
      expect(new Set(keys).size).toBe(6);
      expect(keys).toEqual(mondays);
    });

    it("produces same key for all days in a week", () => {
      const weekDays = [
        "2026-04-06", // Monday
        "2026-04-07", // Tuesday
        "2026-04-08", // Wednesday
        "2026-04-09", // Thursday
        "2026-04-10", // Friday
        "2026-04-11", // Saturday
        "2026-04-12", // Sunday
      ];
      const keys = weekDays.map(d => toWeekKey(new Date(d + "T12:00:00")));
      expect(new Set(keys).size).toBe(1);
      expect(keys[0]).toBe("2026-04-06");
    });

    it("produces sequential non-overlapping keys over 8 weeks", () => {
      const keys: string[] = [];
      for (let i = 0; i < 8; i++) {
        keys.push(toWeekKey(new Date(2026, 3, 6 + i * 7)));
      }
      expect(new Set(keys).size).toBe(8);
      // Each successive key should be > previous (lexicographic works for ISO dates)
      for (let i = 1; i < keys.length; i++) {
        expect(keys[i] > keys[i - 1]).toBe(true);
      }
    });
  });
});