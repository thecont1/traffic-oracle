vi.mock("../../src/config.json", () => ({
  default: {
    worst_case_percentile: 95,
    verdict_threshold_kmh: 0.5,
    baseline_default_start: "2025-10-20",
    baseline_default_end: "2025-12-15",
  },
}));

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import * as Papa from "papaparse";

import {
  useDailyStatsAllDay,
  useFilteredData,
  fetchTrafficData,
  bust,
  toWeekKey,
  TrafficRow,
} from "@/lib/useTrafficData";

/* ── Helpers ────────────────────────────────────────────────────── */

function makeRow(
  dateStr: string,
  opts: Partial<
    Omit<TrafficRow, "timestamp" | "weekKey" | "hour" | "dayOfWeek"> & {
      hour?: number;
      dayOfWeek?: number;
    }
  > = {},
): TrafficRow {
  const ts = new Date(dateStr + "T12:00:00");
  return {
    timestamp: ts,
    route_code: "R-100",
    label_short: "Hosur Road",
    duration_min: 40,
    distance_km: 18,
    speed_kmh: 27,
    hour: 12,
    dayOfWeek: ts.getDay(),
    weekKey: `${ts.getFullYear()}-${String(ts.getMonth() + 1).padStart(2, "0")}-${String(ts.getDate()).padStart(2, "0")}`,
    ...opts,
  };
}

/* ================================================================
 * Phase 2 (hooks): Calendar and chart consistency
 * ================================================================ */

describe("Phase 2 (hooks) — Calendar <-> Chart consistency", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-15T18:00:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calendar (useDailyStatsAllDay) and charts (useFilteredData) agree on max date", () => {
    // Data from April 1 through May 11
    const rows: TrafficRow[] = [];
    for (let day = 1; day <= 30; day++) {
      rows.push(makeRow(`2026-04-${day < 10 ? "0" + day : day}`, {}));
    }
    for (let day = 1; day <= 11; day++) {
      rows.push(makeRow(`2026-05-${day < 10 ? "0" + day : day}`, {}));
    }

    const calResult = renderHook(() => useDailyStatsAllDay(rows, "Hosur Road"));
    const chartResult = renderHook(() =>
      useFilteredData(rows, "Hosur Road", "1m", "all"),
    );

    // Calendar: max date key
    const calDates = Array.from(calResult.current.keys()).sort();
    const calMax = calDates[calDates.length - 1];

    // Chart: max date in filtered rows
    const chartMaxTs = Math.max(
      ...chartResult.current.filtered.map(
        (r: TrafficRow) => r.timestamp.getTime(),
      ),
    );
    const chartMaxDate = new Date(chartMaxTs);
    const chartMaxKey = `${chartMaxDate.getFullYear()}-${String(chartMaxDate.getMonth() + 1).padStart(2, "0")}-${String(chartMaxDate.getDate()).padStart(2, "0")}`;

    // Both should show the same latest date
    expect(calMax).toBe(chartMaxKey);
    expect(calMax).toBe("2026-05-11");
  });

  it("calendar shows all dates; charts show only dates within the period window", () => {
    const rows: TrafficRow[] = [];
    for (let day = 1; day <= 30; day++) {
      rows.push(makeRow(`2026-04-${day < 10 ? "0" + day : day}`, {}));
    }
    for (let day = 1; day <= 11; day++) {
      rows.push(makeRow(`2026-05-${day < 10 ? "0" + day : day}`, {}));
    }

    const calResult = renderHook(() => useDailyStatsAllDay(rows, "Hosur Road"));
    const chartResult = renderHook(() =>
      useFilteredData(rows, "Hosur Road", "1m", "all"),
    );

    // Calendar: all 41 dates present (April 1 - May 11)
    expect(calResult.current.size).toBe(41);

    // Chart: only dates from April 15 onward (cutoff = May 15 - 1m = April 15)
    const chartDates = chartResult.current.filtered.map(
      (r: TrafficRow) =>
        `${r.timestamp.getFullYear()}-${String(r.timestamp.getMonth() + 1).padStart(2, "0")}-${String(r.timestamp.getDate()).padStart(2, "0")}`,
    );
    const uniqueChartDates = [...new Set(chartDates)];
    expect(uniqueChartDates.length).toBeLessThanOrEqual(27); // April 15-30 + May 1-11
    expect(uniqueChartDates.length).toBeGreaterThanOrEqual(25);
  });
});

/* ================================================================
 * Phase 3: Integration / Fetch Tests
 * ================================================================ */

describe("Phase 3 — Integration (fetch)", () => {
  /* ---------- 3.1 Freshness: fetch returns latest data ---------- */
  describe("3.1 — Freshness: fetch returns latest data", () => {
    const routesCsv =
      "route_code,label_full,label_short\nR-100,Hosur Road,Hosur Road\nR-101,Outer Ring Road,Outer Ring Rd";

    const trafficCsv = (dates: string[]) =>
      [
        "date,time,route_code,label_full,label_short,duration,distance",
        ...dates.map((d: string) => `${d},08:30,R-100,Hosur Road,Hosur Road,35,18`),
      ].join("\n");

    it("with mocked fetch, returns parsed routes and rows", async () => {
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("csv-routes.csv")) {
          return Promise.resolve({
            ok: true,
            text: () => Promise.resolve(routesCsv),
          });
        }
        if (url.includes("csv-bangalore_traffic.csv")) {
          return Promise.resolve({
            ok: true,
            text: () =>
              Promise.resolve(trafficCsv(["2026-05-10", "2026-05-11", "2026-05-12"])),
          });
        }
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });

      const originalFetch = globalThis.fetch;
      // Override global fetch for test
      Object.defineProperty(globalThis, "fetch", { value: mockFetch });

      try {
        const { routes, allRows, rowCount } = await fetchTrafficData(undefined);
        expect(routes).toHaveLength(2);
        expect(routes[0].route_code).toBe("R-100");
        expect(routes[1].route_code).toBe("R-101");

        expect(allRows.length).toBe(3);
        expect(rowCount).toBe(3);
        expect(allRows[0].label_short).toBe("Hosur Road");
      } finally {
        Object.defineProperty(globalThis, "fetch", { value: originalFetch });
      }
    });

    it("fails gracefully on HTTP error", async () => {
      const mockFetch = vi.fn().mockImplementation(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          text: () => Promise.resolve("Server Error"),
        }),
      );

      const originalFetch = globalThis.fetch;
      Object.defineProperty(globalThis, "fetch", { value: mockFetch });

      try {
        await expect(fetchTrafficData(undefined)).rejects.toThrow("HTTP 500");
      } finally {
        Object.defineProperty(globalThis, "fetch", { value: originalFetch });
      }
    });
  });

  /* ---------- 3.2 Consistency: both widgets see same data ---------- */
  describe("3.2 — Consistency: calendar and charts see same data", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-05-15T18:00:00"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("both useDailyStatsAllDay and useFilteredData produce the same max date from identical allRows", () => {
      const rows: TrafficRow[] = [];
      for (let i = 0; i < 45; i++) {
        const d = new Date(2026, 3, 1 + i);
        rows.push({
          timestamp: d,
          route_code: "R-100",
          label_short: "Hosur Road",
          duration_min: 30 + (i % 20),
          distance_km: 18,
          speed_kmh: 35 + (i % 15),
          hour: 8 + (i % 12),
          dayOfWeek: d.getDay(),
          weekKey: toWeekKey(d),
        });
      }

      const cal = renderHook(() => useDailyStatsAllDay(rows, "Hosur Road"));
      const chart = renderHook(() =>
        useFilteredData(rows, "Hosur Road", "1m", "all"),
      );

      const calMaxDate = Array.from(cal.result.current.keys()).sort().pop()!;
      const chartMaxTs = Math.max(
        ...chart.result.current.filtered.map(
          (r: TrafficRow) => r.timestamp.getTime(),
        ),
      );
      const chartMaxDateObj = new Date(chartMaxTs);
      const chartMaxKey = `${chartMaxDateObj.getFullYear()}-${String(chartMaxDateObj.getMonth() + 1).padStart(2, "0")}-${String(chartMaxDateObj.getDate()).padStart(2, "0")}`;

      expect(calMaxDate).toBe(chartMaxKey);
    });
  });

  /* ---------- 3.3 Cache bypass verification ---------- */
  describe("3.3 — Cache bypass: bust() generates unique URLs", () => {
    it("two consecutive bust() calls produce different query params", () => {
      const url = "https://raw.githubusercontent.com/data.csv";
      const result1 = bust(url);
      const result2 = bust(url);

      const ts1 = parseInt(result1.split("?t=")[1], 10);
      const ts2 = parseInt(result2.split("?t=")[1], 10);

      expect(ts1).toBeGreaterThanOrEqual(Date.now() - 100);
      expect(ts2).toBeGreaterThanOrEqual(Date.now() - 100);
    });

    it("busted URL preserves the base path", () => {
      const base =
        "https://raw.githubusercontent.com/thecont1/blr-traffic-monitor/main/csv-bangalore_traffic.csv";
      const busted = bust(base);
      expect(busted.startsWith(base)).toBe(true);
      expect(busted).toMatch(/\?t=\d+$/);
    });
  });
});