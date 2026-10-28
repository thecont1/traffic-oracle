import { describe, it, expect } from "bun:test";
import { computeTODStats } from "../../src/core/trafficNow";
import type { TrafficRow } from "../../src/lib/useTrafficData";

/** Minimal row: computeTODStats reads only timestamp and speed_kmh. */
function row(utcMs: number, speed: number): TrafficRow {
  return {
    timestamp: new Date(utcMs),
    speed_kmh: speed,
    duration_min: 30,
    hour: 0,
    dayOfWeek: 0,
    weekKey: "",
    label_short: "Test Route",
    distance_km: 10,
    temp: null,
    realfeel: null,
    humidity: null,
    rsi_flag: null,
    aqi: null,
    date: "",
    time: "",
    route_code: "",
    route_label: "",
  } as unknown as TrafficRow;
}

// Reference instant: 08:30 IST = 03:00 UTC on a mid-year date.
const REF = Date.UTC(2026, 6, 15, 3, 0);

describe("computeTODStats — time-of-day matching", () => {
  it("matches rows within ±90 min of the same city wall-clock time", () => {
    const rows = [
      row(REF, 30),                      // 08:30 — 0 min
      row(REF + 5 * 60_000, 32),         // 08:35 — within
      row(REF + 89 * 60_000, 34),        // 09:59 — within
      row(REF - 120 * 60_000, 35),       // 06:30 — outside
      row(REF + 180 * 60_000, 40),       // 11:30 — outside
    ];
    const stats = computeTODStats(rows, new Date(REF), 90, 90)!;
    expect(stats).not.toBeNull();
    expect(stats.count).toBe(3);
  });

  it("wraps around midnight", () => {
    // Reference 00:10 IST = 18:40 UTC the previous day.
    const ref = Date.UTC(2026, 6, 15, 18, 40);
    const rows = [
      row(Date.UTC(2026, 6, 15, 18, 10), 30), // 23:40 IST — 30 min before
      row(Date.UTC(2026, 6, 15, 18, 25), 31), // 23:55 IST — 15 min before
      row(Date.UTC(2026, 6, 15, 18, 50), 32), // 00:20 IST — 10 min after
      row(Date.UTC(2026, 6, 15, 20, 30), 40), // 02:00 IST — 110 min after, outside
    ];
    const stats = computeTODStats(rows, new Date(ref), 90, 90)!;
    expect(stats.count).toBe(3);
  });

  it("keeps a DST-crossing viewer on the city clock", () => {
    // Reference 08:30 IST in May (PDT for a US viewer) and a row at 07:50 IST in
    // February (PST): 84 days apart, both inside the 90-day cutoff. The two are
    // 40 min apart on Bangalore's clock, but a viewer's local getters see them
    // 100 min apart across the spring-forward boundary and drop the row.
    const ref = Date.UTC(2026, 4, 15, 3, 0);   // 08:30 IST
    const febRow = Date.UTC(2026, 1, 20, 2, 20); // 07:50 IST
    const rows = [row(febRow, 30), row(ref, 31), row(ref + 5 * 60_000, 32)];
    const stats = computeTODStats(rows, new Date(ref), 90, 90)!;
    expect(stats).not.toBeNull();
    expect(stats.count).toBe(3);
  });
});
