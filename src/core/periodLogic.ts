// ---------------------------------------------------------------------------
// Period / baseline window logic — pure computation.
// Extracted from Dashboard.tsx state derivation block.
// ---------------------------------------------------------------------------

import type { WeeklyAggregate, TimePeriod } from "@/lib/useTrafficData";

/** Compute the cutoff date for a given period relative to the last data timestamp. */
export function computeCutoffDate(lastDataMs: number, period: TimePeriod): Date {
  const d = new Date(lastDataMs || Date.now());
  if      (period === "1m")   d.setDate(d.getDate() - 30);
  else if (period === "1.5m") d.setDate(d.getDate() - 45);
  else if (period === "2m")   d.setDate(d.getDate() - 60);
  else if (period === "3m")   d.setMonth(d.getMonth() - 3);
  else if (period === "6m")   d.setMonth(d.getMonth() - 6);
  else                         d.setFullYear(d.getFullYear() - 1);
  return d;
}

/** Split allRouteWeeks into baseline and recent windows. */
export function computeBaselineAndRecent(
  allRouteWeeks: WeeklyAggregate[],
  safeLeft: number,
  safeRight: number,
  periodCutoffDate: Date,
): {
  baselineWeeks: WeeklyAggregate[];
  recentWeeks: WeeklyAggregate[];
  recentWindowStartIdx: number;
} {
  const baselineWeeks = allRouteWeeks.slice(safeLeft, safeRight + 1);

  const recentWindowStartIdx = (() => {
    const idx = allRouteWeeks.findIndex(w => w.weekStart >= periodCutoffDate);
    return idx >= 0 ? idx : allRouteWeeks.length;
  })();

  const recentWeeks = allRouteWeeks.filter(
    (w, i) => i > safeRight && w.weekStart >= periodCutoffDate,
  );

  return { baselineWeeks, recentWeeks, recentWindowStartIdx };
}

/** Compute speed difference metrics. */
export function computeSpeedDiff(baselineSpeed: number, recentSpeed: number): {
  speedDiff: number;
  speedPct: number;
} {
  const speedDiff = recentSpeed - baselineSpeed;
  const speedPct = baselineSpeed > 0 ? Math.round((speedDiff / baselineSpeed) * 100) : 0;
  return { speedDiff, speedPct };
}
