/**
 * R³S² Context Block — compact summary displayed near the calendar.
 *
 * Shows route-level rolling score context: rank, score, volatility,
 * completeness. Clearly separate from the daily dot grid.
 */

import type { RrsContext } from "@/lib/rrsData";

interface Props {
  ctx: RrsContext;
  theme: {
    textPrimary: string;
    textMuted: string;
    cardBg?: string;
    cardBorder?: string;
    key: string;
  };
}

const mono = "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace";

function volatilityColor(label: string): string {
  switch (label) {
    case "very low":    return "#22c55e";
    case "low":         return "#86efac";
    case "moderate":    return "#fde68a";
    case "medium-high": return "#fdba74";
    case "high":        return "#fca5a5";
    case "very high":   return "#ef4444";
    default:            return "#94a3b8";
  }
}

export function RrsContextBlock({ ctx, theme }: Props) {
  const volColor = volatilityColor(ctx.volatilityLabel);
  const isGray = theme.key === "gray";

  if (ctx.scoreStatus === "insufficient_data") {
    return (
      <div style={{
        marginTop: 12, padding: "8px 10px",
        background: isGray ? "#f5f5f5" : "#1e293b",
        border: `1px solid ${isGray ? "#d4d4d4" : "#334155"}`,
        fontFamily: mono, fontSize: 11, lineHeight: 1.6,
        color: theme.textMuted,
      }}>
        <span style={{ fontWeight: 700, color: theme.textPrimary }}>R³S²</span>
        {" "}unavailable — not enough recent data
        <span style={{ marginLeft: 8, fontSize: 10 }}>
          ({ctx.datesPresent}/{ctx.datesExpected} days)
        </span>
      </div>
    );
  }

  return (
    <div style={{
      marginTop: 12, padding: "8px 10px",
      background: isGray ? "#f5f5f5" : "#1e293b",
      border: `1px solid ${isGray ? "#d4d4d4" : "#334155"}`,
      fontFamily: mono, fontSize: 11, lineHeight: 1.8,
      color: theme.textPrimary,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 4 }}>
        <span>
          <span style={{ fontWeight: 700 }}>R³S²</span>
          {" "}lately:{" "}
          <span style={{ fontWeight: 800, color: ctx.rank <= 3 ? "#22c55e" : ctx.rank >= ctx.totalRoutes - 2 ? "#ef4444" : theme.textPrimary }}>
            Rank {ctx.rank}/{ctx.totalRoutes}
          </span>
        </span>
        <span style={{ color: theme.textMuted, fontSize: 10 }}>
          {ctx.windowDays}-day window · {ctx.windowEndDate}
        </span>
      </div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 2 }}>
        <span>
          Score: <strong>{ctx.score > 0 ? "+" : ""}{ctx.score.toFixed(1)}</strong>
        </span>
        <span>
          Volatility: <span style={{ color: volColor, fontWeight: 700 }}>{ctx.volatilityLabel}</span>
        </span>
        <span>
          Data: {ctx.datesPresent}/{ctx.datesExpected} days
          {ctx.completeness < 0.5 && (
            <span style={{ color: "#ef4444", fontWeight: 600 }}> (sparse)</span>
          )}
        </span>
      </div>
    </div>
  );
}
