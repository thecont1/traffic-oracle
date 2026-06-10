/**
 * R³S² Context Block — compact route-quality summary near the calendar.
 *
 * Uses the centralized routeConditionCopy system for all user-facing text.
 * Shows: headline verdict, volatility in plain English, data completeness.
 */

import { useMemo } from "react";
import type { RrsContext } from "@/lib/rrsData";
import type { TimeOfDay } from "@/lib/useTrafficData";
import { getRouteConditionCopy, RRS_EXPLAINER, classifyVolatilityTier } from "@/lib/routeConditionCopy";

const mono = "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace";

const TOD_LABELS: Record<string, string> = {
  weekday_morning:   "weekday mornings",
  weekday_afternoon: "weekday afternoons",
  weekday_evening:   "weekday evenings",
  weekends:          "weekends",
  late_hours:        "late hours",
  all:               "all times",
};

interface Props {
  ctx: RrsContext;
  tod: TimeOfDay;
  theme: {
    textPrimary: string;
    textMuted: string;
    key: string;
  };
}

export function RrsContextBlock({ ctx, tod, theme }: Props) {
  const isGray = theme.key === "gray";

  const copy = useMemo(() => getRouteConditionCopy({
    rrsRank: ctx.rank,
    totalRoutes: ctx.totalRoutes,
    cv: ctx.cv,
    speedSd: ctx.speedSd,
    isBenchmarkRoute: ctx.isBenchmarkRoute,
    todLabel: TOD_LABELS[tod] ?? tod,
  }), [ctx, tod]);

  if (ctx.scoreStatus === "insufficient_data") {
    return (
      <div style={{
        marginTop: 12, padding: "10px 12px",
        background: isGray ? "#f5f5f5" : "#1e293b",
        border: `1px solid ${isGray ? "#d4d4d4" : "#334155"}`,
        fontFamily: mono, fontSize: 11, lineHeight: 1.7,
        color: theme.textMuted,
      }}>
        <div style={{ fontWeight: 700, color: theme.textPrimary, marginBottom: 2 }}>
          Route quality — not enough recent data
        </div>
        <div>
          {ctx.datesPresent} of {ctx.datesExpected} days recorded. Need at least 7 to score this route.
        </div>
      </div>
    );
  }

  const rankColor = ctx.rank <= 3 ? "#22c55e" : ctx.rank >= ctx.totalRoutes - 2 ? "#ef4444" : theme.textPrimary;
  const volTier = classifyVolatilityTier(ctx.cv);
  const volColor = volTier === "erratic" ? "#ef4444" : volTier === "choppy" ? "#fdba74" : volTier === "fairly_steady" ? "#fde68a" : "#22c55e";

  return (
    <div style={{
      marginTop: 12, padding: "10px 12px",
      background: isGray ? "#f5f5f5" : "#1e293b",
      border: `1px solid ${isGray ? "#d4d4d4" : "#334155"}`,
      fontFamily: mono, fontSize: 11, lineHeight: 1.8,
      color: theme.textPrimary,
    }}>
      {/* Headline */}
      <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 4 }}>
        {copy.headline}
      </div>

      {/* Rank + Score line */}
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 4 }}>
        <span>
          <span style={{ fontWeight: 700 }}>R³S²</span>{" "}lately:{" "}
          <span style={{ fontWeight: 800, color: rankColor }}>
            Rank {ctx.rank}/{ctx.totalRoutes}
          </span>
          {" · "}
          <span style={{ color: ctx.score > 0 ? "#22c55e" : ctx.score < 0 ? "#ef4444" : theme.textPrimary, fontWeight: 700 }}>
            {ctx.score > 0 ? "+" : ""}{ctx.score.toFixed(1)}
          </span>
        </span>
        <span style={{ color: theme.textMuted, fontSize: 10 }}>
          {ctx.windowDays}-day window
        </span>
      </div>

      {/* Volatility line */}
      <div style={{ marginTop: 2 }}>
        <span style={{ color: volColor, fontWeight: 600 }}>
          Traffic swings: {ctx.speedSd < 1 ? ctx.speedSd.toFixed(1) : Math.round(ctx.speedSd)} km/h
        </span>
        <span style={{ color: theme.textMuted }}> · {copy.volatilityBadge}</span>
      </div>

      {/* Volatility interpretation */}
      <div style={{ color: theme.textMuted, fontSize: 10, marginTop: 1 }}>
        {volTier === "erratic" || volTier === "choppy"
          ? "Unpredictable from day to day."
          : "Fairly consistent day to day."}
      </div>

      {/* Benchmark note */}
      {copy.benchmarkNote && (
        <div style={{ marginTop: 4, padding: "4px 8px", background: isGray ? "#e5e5e5" : "#0f172a", fontSize: 10, color: theme.textMuted }}>
          {copy.benchmarkNote}
        </div>
      )}

      {/* Data completeness */}
      <div style={{ marginTop: 4, fontSize: 10, color: theme.textMuted }}>
        Data: {ctx.datesPresent}/{ctx.datesExpected} days
        {ctx.completeness < 0.5 && (
          <span style={{ color: "#ef4444", fontWeight: 600 }}> — sparse</span>
        )}
      </div>
    </div>
  );
}
