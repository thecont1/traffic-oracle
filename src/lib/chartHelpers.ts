import type { WeeklyAggregate } from "./useTrafficData";

export interface BaselineChartStats {
  speedAvg: number;
  speedP05: number;
  speedP95: number;
  durationAvg: number;
  durationP05: number;
  durationP95: number;
}

export interface ChartDomain {
  min: number;
  max: number;
}

/** Round a number to a "nice" step for axis ticks (gentle, avoids huge jumps). */
function niceRound(value: number, direction: "up" | "down"): number {
  const abs = Math.abs(value);
  if (abs === 0) return 0;
  const exponent = Math.floor(Math.log10(abs));
  const step = Math.pow(10, exponent - 1);
  return direction === "up"
    ? Math.ceil(value / step) * step
    : Math.floor(value / step) * step;
}

/** Compute baseline stats from a set of weekly aggregates. */
export function computeBaselineStats(baselineWeeks: WeeklyAggregate[]): BaselineChartStats | null {
  if (baselineWeeks.length === 0) return null;
  const speeds = baselineWeeks.map(w => w.avgSpeed).filter(s => s > 0).sort((a, b) => a - b);
  const durations = baselineWeeks.map(w => w.avgDuration).filter(d => d > 0).sort((a, b) => a - b);

  const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
  const pct = (arr: number[], p: number) => {
    if (!arr.length) return 0;
    const idx = (p / 100) * (arr.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return arr[lo];
    return arr[lo] + (arr[hi] - arr[lo]) * (idx - lo);
  };

  return {
    speedAvg: avg(speeds),
    speedP05: pct(speeds, 5),
    speedP95: pct(speeds, 95),
    durationAvg: avg(durations),
    durationP05: pct(durations, 5),
    durationP95: pct(durations, 95),
  };
}

/** Build a chart domain that comfortably includes both the data and any baseline references. */
export function computeChartDomain(
  data: WeeklyAggregate[],
  view: "speed" | "duration",
  baselineStats: BaselineChartStats | null,
  padFraction = 0.08,
): ChartDomain {
  const dataValues = view === "speed"
    ? data.flatMap(w => [w.avgSpeed, w.p05Speed, w.p95Speed]).filter(v => v > 0)
    : data.flatMap(w => [w.avgDuration, w.p95Duration]).filter(v => v > 0);

  let min = dataValues.length ? Math.min(...dataValues) : 0;
  let max = dataValues.length ? Math.max(...dataValues) : 0;

  if (baselineStats) {
    const bValues = view === "speed"
      ? [baselineStats.speedP05, baselineStats.speedAvg, baselineStats.speedP95]
      : [baselineStats.durationP05, baselineStats.durationAvg, baselineStats.durationP95];
    const bMin = Math.min(...bValues);
    const bMax = Math.max(...bValues);
    min = Math.min(min, bMin);
    max = Math.max(max, bMax);
  }

  if (min === max) {
    // Degenerate case — give it some breathing room
    min = Math.max(0, min - 1);
    max = max + 1;
  }

  const pad = (max - min) * padFraction;
  const rawMin = Math.max(0, min - pad);
  const rawMax = max + pad;

  return {
    min: niceRound(rawMin, "down"),
    max: niceRound(rawMax, "up"),
  };
}
