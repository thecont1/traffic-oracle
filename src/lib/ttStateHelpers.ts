/**
 * Time Travel state preservation helpers.
 *
 * Pure functions extracted from Dashboard.tsx for testability.
 * These handle the snapshot → save → restore lifecycle when
 * transitioning between Live and Time Travel modes.
 */

export interface WeeklyAggregate {
  weekKey: string;
  weekStart: Date;
  lastDate: Date;
  avgSpeed: number;
  p05Speed: number;
  p95Speed: number;
  avgDuration: number;
  p05Duration: number;
  medianDuration: number;
  p95Duration: number;
  count: number;
}

export interface DashboardSnapshot {
  sliderWeekKeys: [string, string] | null;
  periodIdx: number;
  todIdx: number;
  questionMode: "worsened" | "improved";
  chartView: "speed" | "duration";
  chartGranularity: "daily" | "weekly";
  routeName: string;
}

/**
 * Given saved weekKeys and current allRouteWeeks, return the matching
 * [leftIdx, rightIdx] pair — or null if either weekKey is missing.
 *
 * The caller should fall back to auto-set logic when this returns null.
 */
export function resolveSliderFromWeekKeys(
  savedKeys: [string, string] | null,
  allRouteWeeks: WeeklyAggregate[],
): [number, number] | null {
  if (!savedKeys) return null;
  const [lKey, rKey] = savedKeys;
  const lIdx = allRouteWeeks.findIndex((w) => w.weekKey === lKey);
  const rIdx = allRouteWeeks.findIndex((w) => w.weekKey === rKey);
  if (lIdx >= 0 && rIdx >= 0) {
    return [Math.min(lIdx, rIdx), Math.max(lIdx, rIdx)];
  }
  return null;
}

/**
 * Given a saved route name and current live-mode route list, return the
 * matching index — or -1 if the route no longer exists.
 */
export function resolveRouteIndex(
  savedRouteName: string,
  liveRoutes: string[],
): number {
  return liveRoutes.indexOf(savedRouteName);
}

/**
 * Validates that a snapshot has all required fields populated.
 */
export function validateSnapshot(s: unknown): s is DashboardSnapshot {
  if (typeof s !== "object" || s === null) return false;
  const obj = s as Record<string, unknown>;
  if (typeof obj.periodIdx !== "number") return false;
  if (typeof obj.todIdx !== "number") return false;
  if (obj.questionMode !== "worsened" && obj.questionMode !== "improved") return false;
  if (obj.chartView !== "speed" && obj.chartView !== "duration") return false;
  if (obj.chartGranularity !== "daily" && obj.chartGranularity !== "weekly") return false;
  if (typeof obj.routeName !== "string" || obj.routeName === "") return false;
  if (obj.sliderWeekKeys !== null) {
    if (!Array.isArray(obj.sliderWeekKeys)) return false;
    if (obj.sliderWeekKeys.length !== 2) return false;
    if (typeof obj.sliderWeekKeys[0] !== "string" || typeof obj.sliderWeekKeys[1] !== "string") return false;
  }
  return true;
}
