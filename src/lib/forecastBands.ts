import { percentile } from "@/lib/useTrafficData";
import type { WeeklyAggregate, TrafficRow } from "@/lib/useTrafficData";
import type { IntervalDatum } from "@/components/UncertaintyBandChart";

export type { IntervalDatum };

/**
 * Build an IntervalDatum[] from a slice of WeeklyAggregates.
 *
 * For each week the raw trips are fetched from `allRouteRows` (all hours,
 * route already filtered) by timestamp window so the percentile bands
 * reflect the real speed distribution — not the pre-aggregated averages.
 *
 * Fallback: when fewer than 3 trips exist in a week the function uses the
 * week's pre-aggregated avgSpeed to emit a synthetic flat band (±5 % inner,
 * ±10 % outer) rather than computing meaningless percentiles from 1–2 points.
 */
export function buildBands(
  weeks: WeeklyAggregate[],
  allRouteRows: TrafficRow[],
): IntervalDatum[] {
  return weeks.map(w => {
    const wStart = new Date(w.weekKey);
    const wEnd   = new Date(wStart.getTime() + 7 * 86400_000);
    const speeds = allRouteRows
      .filter(r => r.timestamp >= wStart && r.timestamp < wEnd)
      .map(r => r.speed_kmh)
      .sort((a, b) => a - b);

    if (speeds.length < 3) {
      const s = w.avgSpeed || 0;
      return {
        x:   w.weekKey,
        p05: Math.round(s * 0.90 * 10) / 10,
        p15: Math.round(s * 0.95 * 10) / 10,
        p50: Math.round(s        * 10) / 10,
        p85: Math.round(s * 1.05 * 10) / 10,
        p95: Math.round(s * 1.10 * 10) / 10,
      };
    }

    return {
      x:   w.weekKey,
      p05: Math.round(percentile(speeds,  5) * 10) / 10,
      p15: Math.round(percentile(speeds, 15) * 10) / 10,
      p50: Math.round(percentile(speeds, 50) * 10) / 10,
      p85: Math.round(percentile(speeds, 85) * 10) / 10,
      p95: Math.round(percentile(speeds, 95) * 10) / 10,
    };
  });
}
