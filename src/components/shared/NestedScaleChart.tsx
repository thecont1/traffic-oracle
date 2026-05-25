import { useMemo } from "react";
import type { AppTheme } from "@/lib/theme";
import type { LiveStatus, RouteTODStats } from "@/core/trafficNow";

/* ── Nested-scale bullet chart (shared desktop + mobile) ─────── */
export default function NestedScaleChart({
  liveSpeed,
  prevSpeed,
  typical,
  cityMin,
  cityMax,
  status,
  thm,
  expanded,
}: {
  liveSpeed: number | null;
  prevSpeed: number | null;
  typical: RouteTODStats | null;
  cityMin: number;
  cityMax: number;
  status: LiveStatus;
  thm: AppTheme;
  expanded: boolean;
}) {
  const hasData = liveSpeed !== null && typical !== null && cityMax > cityMin;

  const isFaster = status === "faster" || status === "unusually-fast";
  const isSlower = status === "slower" || status === "unusually-slower";
  const isTypical = status === "as-expected";

  const statusColor = isTypical
    ? thm.key === "colour"
      ? "#9CA3AF"
      : "#4A4A4A"
    : thm.key === "gray"
      ? isFaster
        ? "#2D8A4E"
        : isSlower
          ? "#C0392B"
          : "#555555"
      : thm.key === "pastel"
        ? isFaster
          ? "#2E7D32"
          : isSlower
            ? "#D84315"
            : "#546E7A"
        : isFaster
          ? "#34D399"
          : isSlower
            ? "#F87171"
            : "#60A5FA";

  const bandColor =
    thm.key === "colour" ? "rgba(255,255,255,0.20)" : "rgba(0,0,0,0.18)";
  const tickColor =
    thm.key === "colour" ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.35)";
  const railColor =
    thm.key === "colour" ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
  const railCapColor =
    thm.key === "colour" ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)";
  const labelColor =
    thm.key === "gray" ? "#767676" : thm.key === "pastel" ? "#6E675B" : "#94A3B8";

  const animKey = useMemo(() => Math.random(), [liveSpeed]);

  const cityRange = cityMax - cityMin || 1;
  const pct = (v: number) => ((v - cityMin) / cityRange) * 100;

  const livePos = hasData ? pct(liveSpeed!) : null;
  const prevPos = hasData && prevSpeed !== null ? pct(prevSpeed) : null;
  const p05Pos = hasData ? pct(typical!.p05) : null;
  const p15Pos = hasData ? pct(typical!.p15) : null;
  const p50Pos = hasData ? pct(typical!.p50) : null;
  const p85Pos = hasData ? pct(typical!.p85) : null;
  const p95Pos = hasData ? pct(typical!.p95) : null;

  const fmt = (n: number | null) =>
    n === null ? "--" : n % 1 === 0 ? n.toString() : n.toFixed(1);

  const ariaLabel = !hasData
    ? "No data available."
    : `Speed ${fmt(liveSpeed)} km/h. Usual range ${fmt(typical!.p15)} to ${fmt(typical!.p85)} km/h. City-wide range ${fmt(cityMin)} to ${fmt(cityMax)} km/h.`;

  const BAR_ROW_H = 28;
  const LABEL_H = 14;
  const TOP_GAP = 2;
  const BOTTOM_GAP = 4;
  const TOTAL_H = LABEL_H + TOP_GAP + BAR_ROW_H + BOTTOM_GAP + LABEL_H;
  const BAND_H = 10;
  const DIAMOND = 10;

  return (
    <div style={{ width: "100%", position: "relative", height: TOTAL_H }}>
      {/* Top labels: p15 and p85 (visible when expanded) */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: LABEL_H,
          opacity: expanded ? 1 : 0,
          transition: "opacity 0.15s",
          pointerEvents: expanded ? "auto" : "none",
        }}
      >
        {hasData && (
          <>
            <span
              style={{
                position: "absolute",
                left: `${p15Pos}%`,
                transform: "translateX(-50%)",
                fontSize: 9,
                color: labelColor,
                fontWeight: 500,
                lineHeight: 1,
                whiteSpace: "nowrap",
              }}
            >
              {fmt(typical!.p15)}
            </span>
            <span
              style={{
                position: "absolute",
                left: `${p85Pos}%`,
                transform: "translateX(-50%)",
                fontSize: 9,
                color: labelColor,
                fontWeight: 500,
                lineHeight: 1,
                whiteSpace: "nowrap",
              }}
            >
              {fmt(typical!.p85)}
            </span>
          </>
        )}
      </div>

      {/* Bar row */}
      <div
        style={{
          position: "absolute",
          top: LABEL_H + TOP_GAP,
          left: 0,
          right: 0,
          height: BAR_ROW_H,
        }}
        role="img"
        aria-label={ariaLabel}
      >
        {/* Outer rail */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: BAR_ROW_H / 2,
            transform: "translateY(-50%)",
            height: 2,
            borderRadius: 1,
            background: railColor,
          }}
        />
        {/* Rail caps */}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: BAR_ROW_H / 2,
            transform: "translateY(-50%)",
            width: 2,
            height: 8,
            borderRadius: 1,
            background: railCapColor,
          }}
        />
        <div
          style={{
            position: "absolute",
            right: 0,
            top: BAR_ROW_H / 2,
            transform: "translateY(-50%)",
            width: 2,
            height: 8,
            borderRadius: 1,
            background: railCapColor,
          }}
        />

        {hasData && (
          <>
            {/* p05–p95 band */}
            <div
              style={{
                position: "absolute",
                left: `${p05Pos}%`,
                width: `${p95Pos! - p05Pos!}%`,
                top: (BAR_ROW_H - BAND_H) / 2,
                height: BAND_H,
                borderRadius: BAND_H / 2,
                background: (() => {
                  const span = p95Pos! - p05Pos! || 1;
                  const medPct = Math.round(
                    ((p50Pos! - p05Pos!) / span) * 100,
                  );
                  const c = bandColor;
                  return `linear-gradient(to right, transparent 0%, ${c} ${medPct}%, transparent 100%)`;
                })(),
              }}
            />

            {/* Midpoint tick: p50 */}
            <div
              style={{
                position: "absolute",
                left: `${p50Pos}%`,
                top: (BAR_ROW_H - BAND_H) / 2 - 3,
                width: 1,
                height: BAND_H + 6,
                background: tickColor,
                borderRadius: 1,
                transform: "translateX(-0.5px)",
              }}
            />

            {/* Trail diamond */}
            {prevPos !== null && prevPos !== livePos && (
              <div
                key={`trail-${animKey}`}
                style={{
                  position: "absolute",
                  top: BAR_ROW_H / 2,
                  width: DIAMOND,
                  height: DIAMOND,
                  background: statusColor,
                  borderRadius: 2,
                  transform: "translate(-50%, -50%) rotate(45deg)",
                  opacity: 0,
                  ["--diamond-from" as string]: `${prevPos}%`,
                  ["--diamond-to" as string]: `${livePos}%`,
                  animation: "diamond-trail 2.2s ease-in-out infinite",
                  zIndex: 1,
                }}
              />
            )}

            {/* Live diamond */}
            <div
              style={{
                position: "absolute",
                left: `${livePos}%`,
                top: BAR_ROW_H / 2,
                width: DIAMOND,
                height: DIAMOND,
                background: statusColor,
                borderRadius: 2,
                transform: "translate(-50%, -50%) rotate(45deg)",
                boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
                zIndex: 2,
              }}
            />
          </>
        )}
      </div>

      {/* Bottom labels: cityMin, live speed, cityMax */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: LABEL_H,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
        }}
      >
        <span
          style={{
            fontSize: 9,
            color: labelColor,
            fontWeight: 500,
            lineHeight: 1,
            opacity: expanded ? 1 : 0,
            transition: "opacity 0.15s",
          }}
        >
          {hasData ? fmt(cityMin) : ""}
        </span>
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            color: statusColor,
            position: "absolute",
            left: `${livePos}%`,
            transform: "translateX(-50%)",
            whiteSpace: "nowrap",
            lineHeight: 1,
            bottom: 0,
          }}
        >
          {hasData ? fmt(liveSpeed) : ""}
        </span>
        <span
          style={{
            fontSize: 9,
            color: labelColor,
            fontWeight: 500,
            lineHeight: 1,
            opacity: expanded ? 1 : 0,
            transition: "opacity 0.15s",
          }}
        >
          {hasData ? fmt(cityMax) : ""}
        </span>
      </div>
    </div>
  );
}
