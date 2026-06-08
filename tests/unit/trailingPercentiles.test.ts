import { describe, it, expect } from "bun:test";
import { trailingPercentiles } from "../../src/lib/trailingPercentiles";
import type { DayStats } from "../../src/lib/useTrafficData";

/* ══════════════════════════════════════════════════════════════════ */
/* trailingPercentiles — 30-day rolling window p10/p90               */
/* ══════════════════════════════════════════════════════════════════ */

/** Build a minimal DayStats with only the fields trailingPercentiles reads. */
function ds(avgSpeed: number): DayStats {
  return {
    dateKey: "",
    avgSpeed,
    minSpeed: avgSpeed - 5,
    maxSpeed: avgSpeed + 5,
    minTime: "8:00 AM",
    maxTime: "10:00 PM",
    p05Speed: avgSpeed - 8,
    p95Speed: avgSpeed + 8,
    avgDuration: 0,
    p05Duration: 0,
    medianDuration: 0,
    p95Duration: 0,
    count: 10,
  };
}

/** Build a stats Map with N entries at 20–40 km/h spread over 30 days. */
function buildStats(speeds: number[], baseDate = "2025-04-15"): Map<string, DayStats> {
  const map = new Map<string, DayStats>();
  const base = new Date(baseDate + "T12:00:00").getTime();
  for (let i = 0; i < speeds.length; i++) {
    const d = new Date(base - (i + 1) * 86400000);
    const key = d.toISOString().slice(0, 10);
    const s = ds(speeds[i]);
    s.dateKey = key;
    map.set(key, s);
  }
  return map;
}

describe("trailingPercentiles — full 30-day window", () => {
  it("returns correct p10/p90 for a dense window", () => {
    // 30 entries, speeds 20–49
    const speeds = Array.from({ length: 30 }, (_, i) => 20 + i);
    const stats = buildStats(speeds);
    const result = trailingPercentiles(stats, "2025-04-15");

    expect(result.insufficient).toBe(false);
    expect(result.count).toBe(30);
    // p10 of [20..49] ≈ 22.9, p90 ≈ 46.1
    expect(result.p10).toBeGreaterThan(20);
    expect(result.p10).toBeLessThan(25);
    expect(result.p90).toBeGreaterThan(44);
    expect(result.p90).toBeLessThan(49);
  });

  it("p10 < p90 always for non-degenerate windows", () => {
    const speeds = Array.from({ length: 30 }, (_, i) => 20 + i);
    const stats = buildStats(speeds);
    const result = trailingPercentiles(stats, "2025-04-15");
    expect(result.p10).toBeLessThan(result.p90);
  });
});

describe("trailingPercentiles — sparse weekend window", () => {
  it("handles 8 data points", () => {
    const speeds = [25, 27, 28, 29, 30, 32, 33, 35];
    const stats = buildStats(speeds);
    const result = trailingPercentiles(stats, "2025-04-15");

    expect(result.insufficient).toBe(false);
    expect(result.count).toBe(8);
    expect(result.p10).toBeGreaterThan(24);
    expect(result.p10).toBeLessThan(30);
    expect(result.p90).toBeGreaterThan(30);
    expect(result.p90).toBeLessThan(36);
  });
});

describe("trailingPercentiles — insufficient data", () => {
  it("marks single data point as insufficient", () => {
    const stats = buildStats([30]);
    const result = trailingPercentiles(stats, "2025-04-15");

    expect(result.insufficient).toBe(true);
    expect(result.count).toBe(1);
    expect(result.p10).toBe(25);
    expect(result.p90).toBe(25);
  });

  it("marks empty window as insufficient", () => {
    const stats = new Map<string, DayStats>();
    const result = trailingPercentiles(stats, "2025-04-15");

    expect(result.insufficient).toBe(true);
    expect(result.count).toBe(0);
  });
});

describe("trailingPercentiles — monotonic trend", () => {
  it("t increases with speed for a monotonic input", () => {
    const speeds = Array.from({ length: 20 }, (_, i) => 20 + i); // 20–39
    const stats = buildStats(speeds);

    // For a speed near p10, t should be low
    const lowSpeed = buildStats(speeds);
    lowSpeed.set("2025-04-15", { ...ds(21), dateKey: "2025-04-15" });
    const rLow = trailingPercentiles(lowSpeed, "2025-04-15");
    const tLow = (21 - rLow.p10) / (rLow.p90 - rLow.p10);

    // For a speed near p90, t should be high
    const highSpeed = buildStats(speeds);
    highSpeed.set("2025-04-15", { ...ds(38), dateKey: "2025-04-15" });
    const rHigh = trailingPercentiles(highSpeed, "2025-04-15");
    const tHigh = (38 - rHigh.p10) / (rHigh.p90 - rHigh.p10);

    expect(tLow).toBeLessThan(tHigh);
  });
});

describe("trailingPercentiles — excludes current date", () => {
  it("does not include the target date in the window", () => {
    // Put a very different speed on the target date — should not affect p10/p90
    const speeds = Array.from({ length: 20 }, (_, i) => 25); // all 25
    const stats = buildStats(speeds);
    stats.set("2025-04-15", { ...ds(99), dateKey: "2025-04-15" }); // outlier on target

    const result = trailingPercentiles(stats, "2025-04-15");
    expect(result.p10).toBe(25);
    expect(result.p90).toBe(25);
    expect(result.count).toBe(20); // not 21
  });
});
