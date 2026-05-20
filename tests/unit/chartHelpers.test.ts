import { describe, it, expect } from "bun:test";
import {
  computeBaselineStats,
  computeChartDomain,
} from "../../src/lib/chartHelpers";
import type { WeeklyAggregate } from "../../src/lib/useTrafficData";

function makeWeek(overrides: { weekKey: string } & Partial<Omit<WeeklyAggregate, "weekKey">>): WeeklyAggregate {
  const base = {
    weekKey: overrides.weekKey,
    weekStart: new Date(overrides.weekKey),
    lastDate: new Date(overrides.weekKey),
    avgSpeed: 20,
    p05Speed: 15,
    p95Speed: 25,
    avgDuration: 30,
    medianDuration: 30,
    p95Duration: 45,
    count: 10,
  };
  return { ...base, ...overrides };
}

describe("computeBaselineStats", () => {
  it("returns null for empty weeks", () => {
    expect(computeBaselineStats([])).toBeNull();
  });

  it("computes correct stats for a single week", () => {
    const weeks = [makeWeek({ weekKey: "2026-04-06", avgSpeed: 25, avgDuration: 30 })];
    const result = computeBaselineStats(weeks);
    expect(result).not.toBeNull();
    expect(result!.speedAvg).toBe(25);
    expect(result!.speedP05).toBe(25);
    expect(result!.speedP95).toBe(25);
    expect(result!.durationAvg).toBe(30);
    expect(result!.durationP05).toBe(30);
    expect(result!.durationP95).toBe(30);
  });

  it("filters out zero values", () => {
    const weeks = [
      makeWeek({ weekKey: "2026-04-06", avgSpeed: 0, avgDuration: 0 }),
      makeWeek({ weekKey: "2026-04-13", avgSpeed: 30, avgDuration: 25 }),
    ];
    const result = computeBaselineStats(weeks);
    expect(result!.speedAvg).toBe(30);
    expect(result!.durationAvg).toBe(25);
  });

  it("computes p05 and p95 with interpolation", () => {
    const weeks = [
      makeWeek({ weekKey: "2026-04-06", avgSpeed: 10 }),
      makeWeek({ weekKey: "2026-04-13", avgSpeed: 20 }),
      makeWeek({ weekKey: "2026-04-20", avgSpeed: 30 }),
      makeWeek({ weekKey: "2026-04-27", avgSpeed: 40 }),
      makeWeek({ weekKey: "2026-05-04", avgSpeed: 50 }),
    ];
    const result = computeBaselineStats(weeks);
    // p05: idx = 0.05 * 4 = 0.2 → 10 + (20-10)*0.2 = 12
    expect(result!.speedP05).toBeCloseTo(12, 10);
    // p95: idx = 0.95 * 4 = 3.8 → 40 + (50-40)*0.8 = 48
    expect(result!.speedP95).toBeCloseTo(48, 10);
    expect(result!.speedAvg).toBe(30); // (10+20+30+40+50)/5
  });
});

describe("computeChartDomain", () => {
  it("uses data range when no baseline stats", () => {
    const data = [
      makeWeek({ weekKey: "2026-04-06", avgSpeed: 15, avgDuration: 25 }),
      makeWeek({ weekKey: "2026-04-13", avgSpeed: 25, avgDuration: 35 }),
    ];
    const domain = computeChartDomain(data, "speed", null);
    expect(domain.min).toBeLessThanOrEqual(15);
    expect(domain.max).toBeGreaterThanOrEqual(25);
    expect(domain.min).toBeGreaterThanOrEqual(0);
  });

  it("expands domain to include baseline stats", () => {
    const data = [
      makeWeek({ weekKey: "2026-04-06", avgSpeed: 20, avgDuration: 30 }),
      makeWeek({ weekKey: "2026-04-13", avgSpeed: 22, avgDuration: 32 }),
    ];
    const baseline = computeBaselineStats([
      makeWeek({ weekKey: "2026-01-01", avgSpeed: 10, avgDuration: 20 }),
      makeWeek({ weekKey: "2026-01-08", avgSpeed: 40, avgDuration: 60 }),
    ]);
    const speedDomain = computeChartDomain(data, "speed", baseline);
    // Baseline p05=10, p95=40 should expand past data 20-22
    expect(speedDomain.min).toBeLessThanOrEqual(10);
    expect(speedDomain.max).toBeGreaterThanOrEqual(40);
  });

  it("uses duration keys for duration view", () => {
    const data = [
      makeWeek({ weekKey: "2026-04-06", avgSpeed: 50, avgDuration: 10 }),
      makeWeek({ weekKey: "2026-04-13", avgSpeed: 60, avgDuration: 12 }),
    ];
    const domain = computeChartDomain(data, "duration", null);
    expect(domain.min).toBeLessThanOrEqual(10);
    expect(domain.max).toBeGreaterThanOrEqual(12);
    // Should not be influenced by speed values
    expect(domain.max).toBeLessThan(50);
  });

  it("handles degenerate all-identical values", () => {
    const data = [
      makeWeek({ weekKey: "2026-04-06", avgSpeed: 20, avgDuration: 30 }),
      makeWeek({ weekKey: "2026-04-13", avgSpeed: 20, avgDuration: 30 }),
    ];
    const domain = computeChartDomain(data, "speed", null);
    expect(domain.min).toBeLessThan(20);
    expect(domain.max).toBeGreaterThan(20);
  });

  it("never returns negative min", () => {
    const data = [
      makeWeek({ weekKey: "2026-04-06", avgSpeed: 2, avgDuration: 1 }),
    ];
    const domain = computeChartDomain(data, "speed", null);
    expect(domain.min).toBeGreaterThanOrEqual(0);
  });

  it("places baseline lines between min and max", () => {
    const data = [
      makeWeek({ weekKey: "2026-04-06", avgSpeed: 18, avgDuration: 28 }),
      makeWeek({ weekKey: "2026-04-13", avgSpeed: 22, avgDuration: 32 }),
    ];
    const baseline = computeBaselineStats([
      makeWeek({ weekKey: "2026-01-01", avgSpeed: 15, avgDuration: 25 }),
      makeWeek({ weekKey: "2026-01-08", avgSpeed: 25, avgDuration: 35 }),
    ]);
    const domain = computeChartDomain(data, "speed", baseline);
    // All baseline values (p05=15, avg=20, p95=25) must sit inside the domain
    expect(domain.min).toBeLessThanOrEqual(15);
    expect(domain.max).toBeGreaterThanOrEqual(25);
  });
});
