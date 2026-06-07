import { percentile, matchesToD } from "@/lib/useTrafficData";
import type { WeeklyAggregate, TrafficRow, TimeOfDay } from "@/lib/useTrafficData";
import type { IntervalDatum } from "@/components/UncertaintyBandChart";

export type { IntervalDatum };

/**
 * Build an IntervalDatum[] from a slice of WeeklyAggregates.
 *
 * For each week the raw trips are fetched from `allRouteRows` (route already
 * filtered by the caller) by timestamp window, then additionally filtered by
 * `tod` so the bands reflect the same time bracket as the rest of the dashboard.
 *
 * Fallback (< 3 matching trips in a week): uses the mean of whatever
 * tod-filtered speeds are available, or the pre-aggregated all-hours weekly
 * average as a last resort, to emit a synthetic flat band (±5 % inner,
 * ±10 % outer) rather than computing meaningless percentiles from 1–2 points.
 */
export function buildBands(
  weeks: WeeklyAggregate[],
  allRouteRows: TrafficRow[],
  tod: TimeOfDay = "all",
): IntervalDatum[] {
  return weeks.map(w => {
    const wStart = new Date(w.weekKey);
    const wEnd   = new Date(wStart.getTime() + 7 * 86400_000);
    const speeds = allRouteRows
      .filter(r =>
        r.timestamp >= wStart &&
        r.timestamp < wEnd &&
        matchesToD(r.hour, r.dayOfWeek, tod),
      )
      .map(r => r.speed_kmh)
      .sort((a, b) => a - b);

    if (speeds.length < 3) {
      const s = speeds.length > 0
        ? Math.round((speeds.reduce((a, b) => a + b, 0) / speeds.length) * 10) / 10
        : Math.round((w.avgSpeed || 0) * 10) / 10;
      return {
        x:   w.weekKey,
        p05: Math.round(s * 0.90 * 10) / 10,
        p15: Math.round(s * 0.95 * 10) / 10,
        p50: s,
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
