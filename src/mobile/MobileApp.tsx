import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  useTrafficData, useFilteredData, useAllRouteWeeks, useWeatherData,
} from "@/lib/useTrafficData";
import type { TimeOfDay } from "@/lib/useTrafficData";
import { ThemeProvider, useTheme } from "@/lib/ThemeContext";
import { TimeTravelProvider } from "@/lib/TimeTravelContext";
import { fmtDate, fmtDuration } from "@/core/format";
import { TOD_LIST, VERDICT, deriveVerdict } from "@/core/constants";
import type { VerdictKey } from "@/core/constants";
import { computeCutoffDate, computeBaselineAndRecent, computeSpeedDiff } from "@/core/periodLogic";
import { readUrlParams } from "@/core/urlState";
import { useMobileShare } from "@/mobile/hooks/useMobileShare";
import SwipeableRouteCards from "@/mobile/components/SwipeableRouteCards";
import NapkinChart from "@/components/shared/NapkinChart";
import LocationDropdown from "@/components/shared/LocationDropdown";
import {
  AreaChart, Area, ComposedChart, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip as RCTooltip, ResponsiveContainer,
} from "recharts";
import { useChartTooltip } from "@/components/shared/ChartTooltipFactory";
import { Share2, Menu } from "lucide-react";
import appConfig from "../config.json";
import type { AppConfig } from "../lib/config";

const cfg = appConfig as AppConfig;
const CITIES = cfg.cities;

// Mobile defaults: predetermined period and ToD
const MOBILE_TOD: TimeOfDay = cfg.defaults.time_of_day as TimeOfDay || "weekday_evening";
const MOBILE_PERIOD_MONTHS = 1.5; // fixed at 1.5 months for mobile

/* ── Mobile car loading animation ────────────────────────────── */
function MobileCarLoader({ thm, onComplete }: { thm: any; onComplete: () => void }) {
  const [pct, setPct] = useState(0);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const start = performance.now();
    const DURATION = 1400;
    let raf: number;
    const tick = (now: number) => {
      const raw = Math.min(100, ((now - start) / DURATION) * 100);
      const step = Math.min(100, Math.ceil(raw / 5) * 5);
      setPct(step);
      if (raw < 100) { raf = requestAnimationFrame(tick); }
      else {
        setTimeout(() => setFading(true), 200);
        setTimeout(() => onComplete(), 600);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [onComplete]);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      background: thm.bodyBg,
      opacity: fading ? 0 : 1,
      transition: "opacity 0.4s ease",
    }}>
      <img src="/trafficoracle-light.png" alt="TraffiCOracle" style={{ width: 160, marginBottom: 32 }} />
      <p style={{
        fontFamily: "var(--app-font-display)", fontWeight: 800,
        fontSize: "clamp(2rem, 10vw, 3.5rem)", letterSpacing: "-0.04em",
        color: thm.textPrimary, lineHeight: 1, marginBottom: 16,
      }}>
        {pct}
      </p>
      <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24"
        fill="none" stroke={thm.textPrimary} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" />
        <circle cx="7" cy="17" r="2" /><path d="M9 17h6" /><circle cx="17" cy="17" r="2" />
      </svg>
    </div>
  );
}

/* ── Mobile Inner (consumes ThemeContext) ────────────────────── */
function MobileInner() {
  const { theme: thm, themeKey } = useTheme();
  const { share, shared } = useMobileShare();
  const [showLoader, setShowLoader] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  // City selection
  const urlParams = useMemo(() => readUrlParams(), []);
  const defaultCityName = CITIES.find(c => c.data_source)?.name ?? CITIES[0].name;
  const initialCity = urlParams.city
    ? (CITIES.find(c => c.name === urlParams.city)?.name ?? defaultCityName)
    : defaultCityName;
  const [selectedCity, setSelectedCity] = useState(initialCity);
  const selectedCityConfig = useMemo(
    () => CITIES.find(c => c.name === selectedCity) ?? CITIES[0],
    [selectedCity],
  );
  const citySource = selectedCityConfig.data_source;

  // Data loading — no auto-refresh, no TT pausing
  const { routes, allRows, loading, error, rowCount, dataTimestamp, refresh } =
    useTrafficData(citySource, false);
  const weatherMap = useWeatherData();

  // Route options
  const routeOptions = useMemo(() => {
    const labels = Array.from(new Set(allRows.map(r => r.label_short))).sort();
    return labels.length ? labels : ["Old Airport Road"];
  }, [allRows]);

  const [routeIdx, setRouteIdx] = useState(0);
  const selectedRoute = routeOptions[routeIdx % routeOptions.length] ?? "Old Airport Road";

  // Apply URL route param once
  const routeApplied = useRef(false);
  useEffect(() => {
    if (allRows.length === 0 || routeApplied.current) return;
    if (urlParams.route) {
      const idx = routeOptions.indexOf(urlParams.route as string);
      if (idx >= 0) setRouteIdx(idx);
    } else if (cfg.defaults.route) {
      const idx = routeOptions.indexOf(cfg.defaults.route);
      if (idx >= 0) setRouteIdx(idx);
    }
    routeApplied.current = true;
  }, [routeOptions]);

  // Route info
  const selectedRouteInfo = useMemo(
    () => routes.find(r => r.label_short === selectedRoute),
    [routes, selectedRoute],
  );
  const labelFull = selectedRouteInfo?.label_full ?? selectedRoute;
  const arrowIdx = labelFull.indexOf("→");
  const routeOrigin = arrowIdx > 0 ? labelFull.slice(0, arrowIdx).trim() : labelFull;
  const routeDestination = arrowIdx > 0 ? labelFull.slice(arrowIdx + 1).trim() : "";

  // Mobile analytics: predetermined period + TOD
  const tod = MOBILE_TOD;
  const lastDataMs = useMemo(
    () => allRows.reduce((max, r) => Math.max(max, r.timestamp.getTime()), 0),
    [allRows],
  );
  const periodCutoff = useMemo(
    () => computeCutoffDate(lastDataMs, cfg.defaults.period as any),
    [lastDataMs],
  );

  // All route weeks (full history for baseline)
  const allRouteWeeks = useAllRouteWeeks(allRows, selectedRoute, tod);

  // Mobile baseline: fixed 4-week window centered at 60% of history
  const { baselineWeeks, recentWeeks } = useMemo(() => {
    const n = allRouteWeeks.length;
    if (n < 4) return { baselineWeeks: allRouteWeeks.slice(0, Math.max(1, Math.floor(n / 2))), recentWeeks: allRouteWeeks.slice(Math.floor(n / 2)) };
    // Baseline: weeks from 50-70% of history
    const blStart = Math.floor(n * 0.4);
    const blEnd = Math.min(n - 1, Math.floor(n * 0.6));
    const bl = allRouteWeeks.slice(blStart, blEnd + 1);
    // Recent: everything after baseline
    const rc = allRouteWeeks.slice(blEnd + 1).filter(w => w.weekStart >= periodCutoff);
    return { baselineWeeks: bl, recentWeeks: rc };
  }, [allRouteWeeks, periodCutoff]);

  // Filtered data for charts
  const { merged, dailyData, selectedStats } = useFilteredData(allRows, selectedRoute, cfg.defaults.period as any, tod);

  // Verdict
  const baselineSpeed = useMemo(() => {
    if (!baselineWeeks.length) return 0;
    return Math.round((baselineWeeks.reduce((s, w) => s + w.avgSpeed, 0) / baselineWeeks.length) * 10) / 10;
  }, [baselineWeeks]);
  const recentSpeed = useMemo(() => {
    if (!recentWeeks.length) return 0;
    return Math.round((recentWeeks.reduce((s, w) => s + w.avgSpeed, 0) / recentWeeks.length) * 10) / 10;
  }, [recentWeeks]);

  const { dataTrend, verdictKey } = deriveVerdict(
    cfg.defaults.question_mode, recentSpeed, baselineSpeed, recentWeeks.length, cfg.percentile.verdict_threshold_kmh,
  );
  const v = VERDICT[verdictKey];

  // Chart data — mobile uses daily for better resolution
  const chartData = dailyData.length > 0 ? dailyData : merged;
  const chartGranularity = dailyData.length > 0 ? "daily" : "weekly";
  const chartDataKey = chartGranularity === "daily" ? "dateKey" : "weekKey";

  const colors = thm.chart;
  const speedTooltip = useChartTooltip(thm, "speed");
  const durationTooltip = useChartTooltip(thm, "duration");

  // X-axis ticks
  const xAxisTicks = useMemo(() => {
    const n = chartData.length;
    if (n === 0) return [] as string[];
    const maxLabels = 5;
    const step = Math.max(1, Math.ceil((n - 1) / (maxLabels - 1)));
    const ticks: string[] = [];
    const keyProp = chartDataKey;
    for (let i = 0; i < n; i += step) ticks.push((chartData[i] as any)[keyProp]);
    const last = (chartData[n - 1] as any)[keyProp];
    if (ticks[ticks.length - 1] !== last) ticks.push(last);
    return ticks;
  }, [chartData, chartDataKey]);

  // Share handler
  const handleShare = useCallback(() => {
    share({
      title: `TraffiCOracle — ${selectedRoute}`,
      text: `${v.msg} (${selectedRoute})`,
      url: window.location.href,
    });
  }, [share, selectedRoute, v.msg]);

  const handleRouteSelect = useCallback((label: string) => {
    const idx = routeOptions.indexOf(label);
    if (idx >= 0) setRouteIdx(idx);
  }, [routeOptions]);

  // Chart domains — must be above any early return
  const speedDomain = useMemo(() => {
    const vals = (chartData as any[]).flatMap((d: any) => [d.avgSpeed, d.p05Speed, d.p95Speed]).filter((v: number) => v > 0);
    if (!vals.length) return { min: 0, max: 1 };
    const pad = (Math.max(...vals) - Math.min(...vals)) * 0.08 || 1;
    return { min: Math.round(Math.max(0, Math.min(...vals) - pad) * 10) / 10, max: Math.round((Math.max(...vals) + pad) * 10) / 10 };
  }, [chartData]);

  const durationDomain = useMemo(() => {
    const vals = (chartData as any[]).flatMap((d: any) => [d.avgDuration, d.p05Duration, d.p95Duration]).filter((v: number) => v > 0);
    if (!vals.length) return { min: 0, max: 1 };
    const pad = (Math.max(...vals) - Math.min(...vals)) * 0.08 || 1;
    return { min: Math.round(Math.max(0, Math.min(...vals) - pad) * 10) / 10, max: Math.round((Math.max(...vals) + pad) * 10) / 10 };
  }, [chartData]);

  // Loading state — after all hooks
  if (showLoader && citySource) {
    return <MobileCarLoader thm={thm} onComplete={() => setShowLoader(false)} />;
  }

  return (
    <div style={{
      display: "flex", flexDirection: "column", height: "100dvh",
      background: thm.bodyBg, overflow: "hidden",
    }}>
      {/* ── Header ──────────────────────────────────────────── */}
      <header style={{
        background: thm.headerBg, backdropFilter: "blur(12px)",
        borderBottom: `1px solid ${thm.key === "gray" ? "#e0e0e0" : "hsl(var(--border))"}`,
        padding: "12px 16px", display: "flex", alignItems: "center",
        justifyContent: "space-between", flexShrink: 0, zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <img src="/trafficoracle-light.png" alt="TraffiCOracle" style={{ height: 28, width: "auto" }} />
          <LocationDropdown thm={thm} selectedCity={selectedCity} onCityChange={setSelectedCity} cities={CITIES} />
        </div>
        <button
          onClick={() => setMenuOpen(o => !o)}
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: thm.textMuted, padding: 8,
          }}
          aria-label="Menu"
        >
          <Menu size={20} />
        </button>
      </header>

      {/* ── Simple menu overlay ─────────────────────────────── */}
      {menuOpen && (
        <div style={{
          position: "absolute", top: 56, right: 8, zIndex: 200,
          background: thm.sectionBg, border: thm.cardBorder,
          borderRadius: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
          padding: 8, minWidth: 180,
        }}>
          <button onClick={handleShare} style={{
            display: "flex", alignItems: "center", gap: 8, width: "100%",
            padding: "10px 12px", border: "none", background: "transparent",
            cursor: "pointer", fontSize: 13, color: thm.textPrimary, borderRadius: 8,
          }}>
            <Share2 size={14} />
            {shared ? "Copied!" : "Share"}
          </button>
          <button onClick={() => { refresh(); setMenuOpen(false); }} style={{
            display: "flex", alignItems: "center", gap: 8, width: "100%",
            padding: "10px 12px", border: "none", background: "transparent",
            cursor: "pointer", fontSize: 13, color: thm.textPrimary, borderRadius: 8,
          }}>
            🔄 Refresh data
          </button>
        </div>
      )}

      {/* ── Scrollable content ──────────────────────────────── */}
      <main style={{
        flex: 1, overflowY: "auto", overflowX: "hidden",
        padding: "16px", display: "flex", flexDirection: "column", gap: 16,
      }}>
        {/* Loading */}
        {loading && (
          <p style={{ textAlign: "center", color: thm.textMuted, padding: "2rem 0" }}>
            Loading traffic data…
          </p>
        )}

        {/* Error */}
        {!loading && error && (
          <div style={{ textAlign: "center", padding: "3rem 1rem" }}>
            <p style={{ fontSize: 48, marginBottom: 8 }}>📡</p>
            <p style={{ fontWeight: 700, color: thm.textPrimary }}>Data unavailable</p>
            <p style={{ fontSize: 13, color: thm.textMuted }}>{error}</p>
          </div>
        )}

        {/* City 404 */}
        {!loading && !error && !citySource && (
          <div style={{ textAlign: "center", padding: "3rem 1rem" }}>
            <p style={{ fontSize: 48, marginBottom: 8 }}>🚧</p>
            <p style={{ fontWeight: 700, color: thm.textPrimary }}>No data for {selectedCity}</p>
            <p style={{ fontSize: 13, color: thm.textMuted }}>This city page isn't ready yet.</p>
          </div>
        )}

        {/* Data loaded */}
        {!loading && !error && rowCount > 0 && citySource && (
          <>
            {/* ── Fixed route cards (swipeable) ──────────────── */}
            <SwipeableRouteCards
              allRows={allRows}
              routes={routes}
              selectedRoute={selectedRoute}
              onRouteSelect={handleRouteSelect}
              routeOptions={routeOptions}
              weatherMap={weatherMap}
            />

            {/* ── Route question ─────────────────────────────── */}
            <div style={{ textAlign: "center", padding: "8px 0" }}>
              <p style={{
                fontFamily: "var(--app-font-display)", fontWeight: 800,
                fontSize: "clamp(1rem, 4vw, 1.4rem)", lineHeight: 1.5,
                color: thm.textPrimary, margin: 0,
              }}>
                Has traffic {cfg.defaults.question_mode} on {selectedRoute}?
              </p>
            </div>

            {/* ── Verdict ────────────────────────────────────── */}
            <div style={{
              background: thm.verdictBg(v.bg),
              border: `2px solid ${thm.verdictBorder(v.border)}`,
              borderRadius: 16, padding: "16px 20px", textAlign: "center",
            }}>
              <p style={{ fontSize: "2.5rem", lineHeight: 1, marginBottom: 6 }}>{v.face}</p>
              <p style={{
                fontFamily: "var(--app-font-display)", fontWeight: 700, fontSize: 15,
                color: thm.verdictText(v.tc), margin: 0,
              }}>
                {v.msg}
              </p>

              {/* Napkin chart — open, no border */}
              {(baselineWeeks.length > 0 || recentWeeks.length > 0) && (
                <div style={{ display: "flex", alignItems: "center", gap: 0, marginTop: 14 }}>
                  {baselineSpeed > 0 && (
                    <div style={{ textAlign: "center", paddingRight: 4, flexShrink: 0 }}>
                      <p style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: thm.baselineLabel, marginBottom: 2 }}>
                        Baseline
                      </p>
                      <p style={{ fontFamily: "var(--app-font-display)", fontWeight: 800, fontSize: 18, color: thm.verdictText(v.tc), lineHeight: 1 }}>
                        {baselineSpeed}<span style={{ fontSize: 9, fontWeight: 600 }}> km/h</span>
                      </p>
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <NapkinChart baselineWeeks={baselineWeeks} recentWeeks={recentWeeks} height={100} />
                  </div>
                  {recentSpeed > 0 && (
                    <div style={{ textAlign: "center", paddingLeft: 4, flexShrink: 0 }}>
                      <p style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: thm.recentLabel, marginBottom: 2 }}>
                        Recent
                      </p>
                      <p style={{ fontFamily: "var(--app-font-display)", fontWeight: 800, fontSize: 18, color: thm.verdictText(v.tc), lineHeight: 1 }}>
                        {recentSpeed}<span style={{ fontSize: 9, fontWeight: 600 }}> km/h</span>
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── Speed chart ────────────────────────────────── */}
            {chartData.length > 0 && (
              <div style={{
                background: thm.key !== "colour" ? thm.cardBg : "transparent",
                border: thm.key !== "colour" ? thm.cardBorder : "none",
                borderRadius: 16, padding: "16px 8px 8px",
              }}>
                <p style={{
                  fontFamily: "var(--app-font-display)", fontWeight: 700, fontSize: 14,
                  color: thm.textPrimary, margin: "0 0 4px 8px",
                }}>
                  ⚡ Speed Over Time
                </p>
                <p style={{ fontSize: 11, color: thm.textMuted, margin: "0 0 10px 8px" }}>
                  Daily avg km/h — higher is faster
                </p>
                <ResponsiveContainer width="100%" height={220}>
                  <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="m_sg" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={colors.line1} stopOpacity={0.2} />
                        <stop offset="95%" stopColor={colors.line1} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={thm.key === "gray" ? "#e0e0e0" : "hsl(var(--border))"} vertical={false} />
                    <XAxis
                      dataKey={chartDataKey}
                      tickFormatter={(s: string) => { try { return new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "short" }); } catch { return s; } }}
                      ticks={xAxisTicks}
                      interval={0}
                      tickMargin={6}
                      tick={{ fontSize: 10, fill: thm.textMuted }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      width={40}
                      tick={{ fontSize: 10, fill: thm.textMuted }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v: number) => Math.round(v).toString()}
                      domain={[Math.floor(speedDomain.min), Math.ceil(speedDomain.max)]}
                      allowDecimals={false}
                    />
                    <RCTooltip content={speedTooltip} />
                    <Area type="monotone" dataKey="avgSpeed" name="Avg Speed"
                      stroke={colors.line1} strokeWidth={2} fill="url(#m_sg)" dot={false} connectNulls />
                    <Line type="monotone" dataKey="p95Speed" name="Best"
                      stroke={thm.key === "gray" ? "#444" : "#22c55e"} strokeWidth={1.5}
                      strokeDasharray="5 3" dot={false} connectNulls />
                    <Line type="monotone" dataKey="p05Speed" name="Worst"
                      stroke={thm.key === "gray" ? "#444" : "#ef4444"} strokeWidth={1.5}
                      strokeDasharray="5 3" dot={false} connectNulls />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* ── Duration chart ─────────────────────────────── */}
            {chartData.length > 0 && (
              <div style={{
                background: thm.key !== "colour" ? thm.cardBg : "transparent",
                border: thm.key !== "colour" ? thm.cardBorder : "none",
                borderRadius: 16, padding: "16px 8px 8px",
              }}>
                <p style={{
                  fontFamily: "var(--app-font-display)", fontWeight: 700, fontSize: 14,
                  color: thm.textPrimary, margin: "0 0 4px 8px",
                }}>
                  🐌 Trip Duration Over Time
                </p>
                <p style={{ fontSize: 11, color: thm.textMuted, margin: "0 0 10px 8px" }}>
                  Daily avg and bad-day trips — lower is better
                </p>
                <ResponsiveContainer width="100%" height={220}>
                  <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="m_dur" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={colors.line1} stopOpacity={0.2} />
                        <stop offset="95%" stopColor={colors.line1} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={thm.key === "gray" ? "#e0e0e0" : "hsl(var(--border))"} vertical={false} />
                    <XAxis
                      dataKey={chartDataKey}
                      tickFormatter={(s: string) => { try { return new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "short" }); } catch { return s; } }}
                      ticks={xAxisTicks}
                      interval={0}
                      tickMargin={6}
                      tick={{ fontSize: 10, fill: thm.textMuted }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      width={40}
                      tick={{ fontSize: 10, fill: thm.textMuted }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v: number) => Math.round(v).toString()}
                      domain={[Math.floor(durationDomain.min), Math.ceil(durationDomain.max)]}
                      allowDecimals={false}
                    />
                    <RCTooltip content={durationTooltip} />
                    <Area type="monotone" dataKey="avgDuration" name="Avg Duration"
                      stroke={colors.line1} strokeWidth={2} fill="url(#m_dur)" dot={false} connectNulls />
                    <Line type="monotone" dataKey="p05Duration" name="Best"
                      stroke={thm.key === "gray" ? "#444" : "#22c55e"} strokeWidth={1.5}
                      strokeDasharray="5 3" dot={false} connectNulls />
                    <Line type="monotone" dataKey="p95Duration" name="Worst"
                      stroke={thm.key === "gray" ? "#444" : "#ef4444"} strokeWidth={1.5}
                      strokeDasharray="5 3" dot={false} connectNulls />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* ── Footer ─────────────────────────────────────── */}
            <footer style={{
              fontSize: 10, color: thm.textMuted, textAlign: "center",
              padding: "8px 0 16px", borderTop: `1px solid ${thm.key === "gray" ? "#e0e0e0" : "hsl(var(--border))"}`,
            }}>
              {rowCount > 0 && dataTimestamp && (
                <span>{rowCount.toLocaleString()} rows · {dataTimestamp.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
              )}
              {" · "}
              © 2026 <a href="https://thecontrarian.in/" target="_blank" rel="noopener noreferrer" style={{ color: thm.chart.line4 }}>Mahesh Shantaram</a>
            </footer>
          </>
        )}
      </main>
    </div>
  );
}

/* ── Public export ─────────────────────────────────────────────── */
export default function MobileApp() {
  const urlParams = useMemo(() => readUrlParams(), []);
  return (
    <TimeTravelProvider>
      <ThemeProvider initialTheme={urlParams.theme as any}>
        <MobileInner />
      </ThemeProvider>
    </TimeTravelProvider>
  );
}
