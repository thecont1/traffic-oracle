/**
 * R³S² Context — humble footer under the calendar.
 *
 * Two lines max. No box, no border, no competition with the calendar.
 *   1. Plain-language headline (includes TOD phrase)
 *   2. R³S² rank + score + volatility badge
 */

import { useMemo } from "react";
import type { RrsContext } from "@/lib/rrsData";
import type { TimeOfDay } from "@/lib/useTrafficData";
import { getRouteConditionCopy, classifyVolatilityTier } from "@/lib/routeConditionCopy";

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
  const copy = useMemo(() => getRouteConditionCopy({
    rrsRank: ctx.rank,
    totalRoutes: ctx.totalRoutes,
    cv: ctx.cv,
    speedSd: ctx.speedSd,
    isBenchmarkRoute: ctx.isBenchmarkRoute,
    tod,
    routeLabel: ctx.routeLabel,
  }), [ctx, tod]);

  if (ctx.scoreStatus === "insufficient_data") {
    return (
      <div style={{
        fontSize: 10,
        color: theme.textMuted,
        lineHeight: 1.5,
      }}>
        R³S² unavailable — not enough recent data ({ctx.datesPresent}/{ctx.datesExpected} days)
      </div>
    );
  }

  const rankColor = ctx.rank <= 3 ? "#22c55e" : ctx.rank >= ctx.totalRoutes - 2 ? "#ef4444" : theme.textMuted;
  const scoreColor = ctx.score > 0 ? "#22c55e" : ctx.score < 0 ? "#ef4444" : theme.textMuted;
  const volTier = classifyVolatilityTier(ctx.cv);

  return (
    <div style={{
      fontSize: 10,
      lineHeight: 1.5,
      color: theme.textMuted,
    }}>
      {/* Line 1: plain-language headline */}
      <div style={{ color: theme.textPrimary, fontWeight: 600 }}>
        {copy.headline}
      </div>

      {/* Line 2: R³S² rank · score · volatility */}
      <div>
        R³S² lately:{' '}
        <span style={{ fontWeight: 700, color: rankColor }}>
          #{ctx.rank}/{ctx.totalRoutes}
        </span>
        {' · '}
        <span style={{ fontWeight: 700, color: scoreColor }}>
          {ctx.score > 0 ? '+' : ''}{ctx.score.toFixed(1)}
        </span>
        {' · '}
        {volTier}
      </div>
    </div>
  );
}
