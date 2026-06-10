/**
 * R³S² Debug Block — detailed audit section for the R³S² score.
 *
 * Shows:
 * - Summary fields (route, TOD, window, score, rank, completeness)
 * - Per-day audit table for the selected route in the rolling window
 * - Collapsible all-routes ranking table
 */

import { useState } from "react";
import type { RrsContext } from "@/lib/rrsData";
import type { TimeOfDay } from "@/lib/useTrafficData";

const mono = "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace";

const TOD_LABELS: Record<string, string> = {
  weekday_morning:   "Weekday Mornings",
  weekday_afternoon: "Weekday Afternoons",
  weekday_evening:   "Weekday Evenings",
  weekends:          "Weekends",
  late_hours:        "Late Hours",
  all:               "All Times",
};

function dateFmt(d: string): string {
  const dt = new Date(d + "T12:00:00");
  return dt.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

function sigmaColor(band: string): string {
  if (band.includes("-3")) return "#ef4444";
  if (band.includes("-2")) return "#fca5a5";
  if (band.includes("-1")) return "#fdba74";
  if (band === "[0, +1σ)")  return "#d9f99d";
  if (band.includes("+1")) return "#bef264";
  if (band.includes("+2")) return "#86efac";
  if (band.includes("+3")) return "#22c55e";
  if (band.startsWith(">")) return "#16a34a";
  return "#94a3b8";
}

interface Props {
  ctx: RrsContext;
  selectedRoute: string;
  tod: TimeOfDay;
  widgetCalMonth: number;
  widgetCalYear: number;
  theme: {
    textPrimary: string;
    textMuted: string;
    key: string;
  };
}

export function RrsDebugBlock({ ctx, selectedRoute, tod, widgetCalMonth, widgetCalYear, theme }: Props) {
  const [allRoutesOpen, setAllRoutesOpen] = useState(false);
  const isGray = theme.key === "gray";

  const borderColor = "#8B5CF6";  // purple for R³S² debug (distinct from red benchmark debug)
  const bgColor = isGray ? "#f5f5f5" : "#FAF5FF";
  const headerBg = isGray ? "#e5e5e5" : "#EDE9FE";

  const monthLabel = new Date(widgetCalYear, widgetCalMonth).toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  return (
    <div style={{
      border: `2px solid ${borderColor}`,
      background: bgColor,
      padding: 12, marginTop: 12,
      fontFamily: mono, fontSize: 11, lineHeight: 1.6,
      color: "#1F2937", borderRadius: 0,
    }}>
      <div style={{ fontWeight: 800, fontSize: 13, color: borderColor, marginBottom: 8 }}>
        R³S² DEBUG
      </div>

      {/* ── Summary fields ── */}
      <div style={{ marginBottom: 10, lineHeight: 1.8 }}>
        <div><strong>Selected route:</strong> {selectedRoute} ({ctx.routeLabel})</div>
        <div><strong>TOD bucket:</strong> {tod} ({TOD_LABELS[tod] ?? tod})</div>
        <div><strong>Calendar month displayed:</strong> {monthLabel}</div>
        <div><strong>Rolling window:</strong> {ctx.windowDays} days</div>
        <div><strong>Window end date:</strong> {ctx.windowEndDate}</div>
        <div><strong>Total eligible routes:</strong> {ctx.totalRoutes}</div>
        <div><strong>Dates expected:</strong> {ctx.datesExpected}</div>
        <div><strong>Dates present:</strong> {ctx.datesPresent}</div>
        <div><strong>Trip count in window:</strong> {ctx.rawData?.trip_count_window ?? 0}</div>
        <div><strong>Mean speed in window:</strong> {ctx.meanSpeed.toFixed(1)} km/h</div>
        <div><strong>Speed SD:</strong> {ctx.speedSd.toFixed(2)}</div>
        <div><strong>Final rolling R³S² score:</strong> <span style={{ fontWeight: 800, color: ctx.score > 0 ? "#16a34a" : ctx.score < 0 ? "#ef4444" : "#1F2937" }}>{ctx.score > 0 ? "+" : ""}{ctx.score.toFixed(1)}</span></div>
        <div><strong>R³S² rank:</strong> {ctx.rank} / {ctx.totalRoutes}</div>
        <div><strong>Completeness:</strong> {(ctx.completeness * 100).toFixed(0)}% ({ctx.datesPresent}/{ctx.datesExpected})</div>
        <div><strong>Score status:</strong> <span style={{ color: ctx.scoreStatus === "ok" ? "#16a34a" : "#ef4444", fontWeight: 700 }}>{ctx.scoreStatus}</span></div>
      </div>

      {/* ── Daily audit table ── */}
      {ctx.dailyAudit.length > 0 && (
        <div style={{ marginBottom: 10, padding: 8, background: headerBg, border: `1px solid ${borderColor}44` }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Daily Audit — {ctx.routeLabel} ({TOD_LABELS[tod]})</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10.5 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${borderColor}`, textAlign: "left" }}>
                <th style={{ padding: "3px 6px" }}>Date</th>
                <th style={{ padding: "3px 6px", textAlign: "right" }}>Speed</th>
                <th style={{ padding: "3px 6px", textAlign: "right" }}>Rank</th>
                <th style={{ padding: "3px 6px", textAlign: "right" }}>Daily Pts</th>
                <th style={{ padding: "3px 6px", textAlign: "right" }}>Cumul. Pts</th>
                <th style={{ padding: "3px 6px", textAlign: "right" }}>z-score</th>
                <th style={{ padding: "3px 6px" }}>σ band</th>
                <th style={{ padding: "3px 6px", textAlign: "right" }}>Trips</th>
              </tr>
            </thead>
            <tbody>
              {ctx.dailyAudit.map((row, i) => (
                <tr key={row.date} style={{ borderBottom: `1px solid ${borderColor}33`, background: i % 2 === 0 ? "transparent" : `${borderColor}11` }}>
                  <td style={{ padding: "2px 6px", whiteSpace: "nowrap" }}>{dateFmt(row.date)}</td>
                  <td style={{ padding: "2px 6px", textAlign: "right" }}>{row.meanSpeed.toFixed(1)} km/h</td>
                  <td style={{ padding: "2px 6px", textAlign: "right" }}>{row.dailyRank}/{row.participatingRoutes}</td>
                  <td style={{ padding: "2px 6px", textAlign: "right", color: row.rrsDailyPoints > 0 ? "#16a34a" : row.rrsDailyPoints < 0 ? "#ef4444" : "#1F2937" }}>
                    {row.rrsDailyPoints > 0 ? "+" : ""}{row.rrsDailyPoints.toFixed(1)}
                  </td>
                  <td style={{ padding: "2px 6px", textAlign: "right", fontWeight: 700, color: row.cumulativePoints > 0 ? "#16a34a" : row.cumulativePoints < 0 ? "#ef4444" : "#1F2937" }}>
                    {row.cumulativePoints > 0 ? "+" : ""}{row.cumulativePoints.toFixed(1)}
                  </td>
                  <td style={{ padding: "2px 6px", textAlign: "right" }}>{row.zScore.toFixed(2)}</td>
                  <td style={{ padding: "2px 6px" }}>
                    <span style={{ display: "inline-block", width: 10, height: 10, background: sigmaColor(row.sigmaBand), verticalAlign: "middle", marginRight: 4 }} />
                    <span style={{ fontSize: 9 }}>{row.sigmaBand}</span>
                  </td>
                  <td style={{ padding: "2px 6px", textAlign: "right" }}>{row.tripCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── All routes ranking table (collapsible) ── */}
      <div>
        <button
          onClick={() => setAllRoutesOpen(o => !o)}
          style={{
            background: "none", border: `1px solid ${borderColor}66`, cursor: "pointer",
            padding: "3px 10px", fontFamily: mono, fontSize: 10, fontWeight: 700,
            color: borderColor, marginBottom: allRoutesOpen ? 6 : 0,
          }}
        >
          {allRoutesOpen ? "▾" : "▸"} All Routes Ranking ({TOD_LABELS[tod]})
        </button>
        {allRoutesOpen && (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10.5 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${borderColor}`, textAlign: "left" }}>
                <th style={{ padding: "3px 6px" }}>Rank</th>
                <th style={{ padding: "3px 6px" }}>Route</th>
                <th style={{ padding: "3px 6px", textAlign: "right" }}>Score</th>
                <th style={{ padding: "3px 6px", textAlign: "right" }}>Mean Speed</th>
                <th style={{ padding: "3px 6px", textAlign: "right" }}>SD</th>
                <th style={{ padding: "3px 6px", textAlign: "right" }}>CV</th>
                <th style={{ padding: "3px 6px", textAlign: "right" }}>Days</th>
                <th style={{ padding: "3px 6px", textAlign: "right" }}>Completeness</th>
                <th style={{ padding: "3px 6px" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {ctx.allRoutes.map((r, i) => {
                const isSelected = r.route_code === selectedRoute;
                return (
                  <tr key={r.route_code} style={{
                    borderBottom: `1px solid ${borderColor}33`,
                    background: isSelected ? `${borderColor}22` : i % 2 === 0 ? "transparent" : `${borderColor}08`,
                    fontWeight: isSelected ? 700 : 400,
                  }}>
                    <td style={{ padding: "2px 6px" }}>{r.rrs_rank}</td>
                    <td style={{ padding: "2px 6px" }}>{r.route_label || r.route_code}</td>
                    <td style={{ padding: "2px 6px", textAlign: "right", color: r.rrs_rolling_score > 0 ? "#16a34a" : r.rrs_rolling_score < 0 ? "#ef4444" : "#1F2937" }}>
                      {r.rrs_rolling_score > 0 ? "+" : ""}{r.rrs_rolling_score.toFixed(1)}
                    </td>
                    <td style={{ padding: "2px 6px", textAlign: "right" }}>{r.mean_speed_window.toFixed(1)}</td>
                    <td style={{ padding: "2px 6px", textAlign: "right" }}>{r.speed_sd_window.toFixed(2)}</td>
                    <td style={{ padding: "2px 6px", textAlign: "right" }}>{r.speed_cv.toFixed(4)}</td>
                    <td style={{ padding: "2px 6px", textAlign: "right" }}>{r.dates_present}/{r.dates_expected}</td>
                    <td style={{ padding: "2px 6px", textAlign: "right" }}>{(r.completeness_ratio * 100).toFixed(0)}%</td>
                    <td style={{ padding: "2px 6px", color: r.score_status === "ok" ? "#16a34a" : "#ef4444", fontWeight: 600 }}>
                      {r.score_status}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
