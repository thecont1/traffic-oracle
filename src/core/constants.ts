// ---------------------------------------------------------------------------
// Shared constants — filter options, verdict messages.
// Extracted from Dashboard.tsx.
// ---------------------------------------------------------------------------

import type { TimePeriod, TimeOfDay } from "@/lib/useTrafficData";

export const PERIOD_LIST: { value: TimePeriod; label: string }[] = [
  { value: "1m",   label: "1 month" },
  { value: "1.5m", label: "1½ months" },
  { value: "2m",   label: "2 months" },
  { value: "3m",   label: "3 months" },
  { value: "6m",   label: "6 months" },
];

export const TOD_LIST: { value: TimeOfDay; label: string }[] = [
  { value: "weekday_morning",   label: "weekday mornings (8–12)" },
  { value: "weekday_afternoon", label: "weekday afternoons (12–18)" },
  { value: "weekday_evening",   label: "weekday evenings (18–22)" },
  { value: "weekends",          label: "weekends (all day)" },
  { value: "late_hours",        label: "late hours (22–4)" },
  { value: "all",               label: "any time of day" },
];

/* ── Verdict ──────────────────────────────────────────────────────── */

export type DataTrend = "improved" | "worsened" | "stable" | "insufficient";

export type VerdictKey =
  | "confirmed_good" | "confirmed_bad"
  | "contradicted_better" | "contradicted_worse"
  | "no_change" | "insufficient";

export interface VerdictEntry {
  face: string;
  msg: string;
  border: string;
  bg: string;
  tc: string;
}

export const VERDICT: Record<VerdictKey, VerdictEntry> = {
  confirmed_good:      { face: "🤩", msg: "Yes! It's gotten better — speed is up. 🎉",          border: "#86EFAC", bg: "#F0FDF4", tc: "#166534" },
  confirmed_bad:       { face: "🥵", msg: "Yep, it's gotten worse — traffic is heavier.",         border: "#FCA5A5", bg: "#FFF1F2", tc: "#991B1B" },
  contradicted_better: { face: "🤩", msg: "Actually, things have improved! Roads are faster.",    border: "#86EFAC", bg: "#F0FDF4", tc: "#166534" },
  contradicted_worse:  { face: "🥵", msg: "Actually, things have gotten worse — traffic is heavier.", border: "#FCA5A5", bg: "#FFF1F2", tc: "#991B1B" },
  no_change:           { face: "😐", msg: "Not really — no meaningful change either way.",         border: "#FDE68A", bg: "#FFFBEB", tc: "#92400E" },
  insufficient:        { face: "🔍", msg: "Need more data — widen the baseline window.",           border: "#C4B5FD", bg: "#F5F3FF", tc: "#5B21B6" },
};

/**
 * Derive the verdict from the question mode, data trend, and threshold.
 * Pure function — no state dependency.
 */
export function deriveVerdict(
  questionMode: "worsened" | "improved",
  recentSpeed: number,
  baselineSpeed: number,
  recentWeekCount: number,
  verdictThreshold: number,
): { dataTrend: DataTrend; verdictKey: VerdictKey } {
  const speedDiff = recentSpeed - baselineSpeed;
  const dataTrend: DataTrend =
    recentSpeed > 0 && baselineSpeed > 0 && recentWeekCount >= 1
      ? speedDiff >  verdictThreshold ? "improved"
      : speedDiff < -verdictThreshold ? "worsened"
      : "stable"
      : "insufficient";

  const verdictKey: VerdictKey =
    dataTrend === "insufficient" ? "insufficient"
    : dataTrend === "stable"     ? "no_change"
    : questionMode === "improved"
      ? dataTrend === "improved" ? "confirmed_good"      : "contradicted_worse"
      : dataTrend === "worsened" ? "confirmed_bad"       : "contradicted_better";

  return { dataTrend, verdictKey };
}
