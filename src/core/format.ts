// ---------------------------------------------------------------------------
// Formatting utilities — pure functions, no React dependency.
// Extracted from Dashboard.tsx.
// ---------------------------------------------------------------------------

/** Format an ISO date string (e.g. weekKey "2026-05-18") as "Tue 18 May '26". */
export function fmtDate(s?: string): string {
  if (!s) return "—";
  try {
    const d = new Date(s);
    const wd = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getDay()];
    const mon = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getMonth()];
    return `${wd} ${d.getDate()} ${mon} '${String(d.getFullYear()).slice(2)}`;
  } catch { return s; }
}

/** Alias — used interchangeably with fmtDate in the original code. */
export const fmtSliderDate = fmtDate;
export const fmtShortDate  = fmtDate;

/** Format a duration in minutes to a human-readable string. */
export function fmtDuration(min: number): string {
  if (!min) return "—";
  if (min < 60) return `${min.toFixed(0)} min`;
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** Format an ISO date string as a short month+day label (for chart axes). */
export function fmtWeek(s: string): string {
  try { return new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "short" }); } catch { return s; }
}

/** Compute the average of a numeric field across an array of week objects. */
export function weeklyAvg(weeks: { avgSpeed: number }[], key: "avgSpeed"): number;
export function weeklyAvg(weeks: { avgDuration: number }[], key: "avgDuration"): number;
export function weeklyAvg(weeks: Record<string, number>[], key: string): number {
  if (!weeks.length) return 0;
  return Math.round((weeks.reduce((a, b) => a + (b[key] as number), 0) / weeks.length) * 10) / 10;
}
