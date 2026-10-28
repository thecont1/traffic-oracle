/**
 * Trailing-window percentile helpers for a *previous* calendar colour system.
 * Extracted from Dashboard.tsx for testability.
 *
 * @deprecated Not used by any surface. The calendar now renders categories from
 * the canonical upstream day-anomaly export (`src/lib/calendarAnomalies.ts`),
 * which compares a route with its own preceding 90 days. This helper's 30-day
 * window and two-observation minimum are not that method — do not reconnect it
 * as a shortcut. Safe to delete once the plan for its removal is scheduled;
 * kept for now so the decision is explicit rather than accidental.
 */

import type { DayStats } from "@/lib/useTrafficData";

/**
 * Trailing 30-day p10/p90 for a given date, NOT including the date itself.
 *
 * Returns `insufficient: true` when the window has fewer than 2 data points,
 * meaning the percentile values are meaningless.  Callers should render those
 * days with a neutral "insufficient data" style.
 */
export function trailingPercentiles(
  stats: Map<string, DayStats>,
  dateKey: string,
): { p10: number; p90: number; count: number; insufficient: boolean } {
  const dkMs = new Date(dateKey + "T12:00:00").getTime();
  const wStart = dkMs - 30 * 86400000;
  const speeds: number[] = [];
  for (const [k, d] of stats.entries()) {
    if (k === dateKey) continue;
    const t = new Date(k + "T12:00:00").getTime();
    if (t >= wStart && t < dkMs && d.avgSpeed > 0) {
      speeds.push(d.avgSpeed);
    }
  }
  speeds.sort((a, b) => a - b);
  if (speeds.length < 2) {
    return { p10: 25, p90: 25, count: speeds.length, insufficient: true };
  }
  const at = (pct: number) => {
    const idx = (pct / 100) * (speeds.length - 1);
    const lo = Math.floor(idx), hi = Math.ceil(idx);
    return speeds[lo] + (speeds[hi] - speeds[lo]) * (idx - lo);
  };
  return { p10: at(10), p90: at(90), count: speeds.length, insufficient: false };
}
