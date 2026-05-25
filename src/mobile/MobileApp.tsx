import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  useTrafficData, useFilteredData, useAllRouteWeeks, useWeatherData,
} from "@/lib/useTrafficData";
import type { TimeOfDay } from "@/lib/useTrafficData";
import { ThemeProvider, useTheme } from "@/lib/ThemeContext";
import { THEMES, THEME_META } from "@/lib/theme";
import type { ThemeKey } from "@/lib/theme";
import { TimeTravelProvider } from "@/lib/TimeTravelContext";
import { fmtDate, fmtDuration } from "@/core/format";
import { PERIOD_LIST, TOD_LIST, VERDICT, deriveVerdict } from "@/core/constants";
import type { VerdictKey } from "@/core/constants";
import { computeCutoffDate } from "@/core/periodLogic";
import { readUrlParams } from "@/core/urlState";
import { useMobileShare } from "@/mobile/hooks/useMobileShare";
import SwipeableRouteCards from "@/mobile/components/SwipeableRouteCards";
import NapkinChart from "@/components/shared/NapkinChart";
import Route404 from "@/components/shared/Route404";
import {
  AreaChart, Area, ComposedChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip as RCTooltip, ResponsiveContainer,
} from "recharts";
import { useChartTooltip } from "@/components/shared/ChartTooltipFactory";
import { Share2, EllipsisVertical } from "lucide-react";
import appConfig from "../config.json";
import type { AppConfig } from "../lib/config";

const cfg = appConfig as AppConfig;
const CITIES = cfg.cities;

/* ── Mobile car loading animation ────────────────────────────── */
function MobileCarLoader({ thm, onComplete }: { thm: any; onComplete: () => void }) {
  const [pct, setPct] = useState(0);
  const [fading, setFading] = useState(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

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
        setTimeout(() => onCompleteRef.current(), 600);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []); // stable — reads onComplete via ref

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      background: thm.bodyBg,
      opacity: fading ? 0 : 1,
      transition: "opacity 0.4s ease",
    }}>
      <img src="/trafficoracle-light.png" alt="TraffiCOracle" style={{ width: "min(40vw, 200px)", marginBottom: 32 }} />
      <p style={{
        fontFamily: "var(--app-font-display)", fontWeight: 800,
        fontSize: "clamp(2rem, 10vw, 3.5rem)", letterSpacing: "-0.04em",
        color: thm.textPrimary, lineHeight: 1, marginBottom: 16,
      }}>
        {pct}
      </p>
      <svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 24 24"
        fill="none" stroke={thm.textPrimary} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" />
        <circle cx="7" cy="17" r="2" /><path d="M9 17h6" /><circle cx="17" cy="17" r="2" />
      </svg>
    </div>
  );
}

/* ── Mobile Inner (consumes ThemeContext) ────────────────────── */
function MobileInner() {
  const { theme: thm, themeKey, setTheme } = useTheme();
  const { share, shared } = useMobileShare();
  const [showLoader, setShowLoader] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [chartGranularity, setChartGranularity] = useState<"daily" | "weekly">("weekly");

  // Question pills state (clickable, cycle through options)
  const [questionModeState, setQuestionModeState] = useState<"worsened" | "improved">(
    cfg.defaults.question_mode as "worsened" | "improved",
  );
  const [todIdx, setTodIdx] = useState(() => {
    const def = cfg.defaults.time_of_day as TimeOfDay || "weekday_evening";
    const idx = TOD_LIST.findIndex(t => t.value === def);
    return idx >= 0 ? idx : 0;
  });
  const [periodIdx, setPeriodIdx] = useState(() => {
    const idx = PERIOD_LIST.findIndex(p => p.value === cfg.defaults.period);
    return idx >= 0 ? idx : 0;
  });

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

  // Sync selectedCity to URL so shell switch (mobile ↔ desktop) preserves the city
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    p.set("city", selectedCity);
    window.history.replaceState(null, "", `${window.location.pathname}?${p.toString()}`);
  }, [selectedCity]);

  // Data loading — no auto-refresh, no TT pausing
  const { routes, allRows, loading, error, rowCount, dataTimestamp, refresh } =
    useTrafficData(citySource, false);
  const weatherMap = useWeatherData();

  // Re-trigger loading animation on city switch
  const prevCityRef = useRef(selectedCity);
  useEffect(() => {
    if (prevCityRef.current !== selectedCity) {
      prevCityRef.current = selectedCity;
      setShowLoader(true);
    }
  }, [selectedCity]);

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

  // Mobile analytics: state-driven period + TOD
  const tod = TOD_LIST[todIdx].value;
  const mobilePeriod = PERIOD_LIST[periodIdx].value;
  const lastDataMs = useMemo(
    () => allRows.reduce((max, r) => Math.max(max, r.timestamp.getTime()), 0),
    [allRows],
  );
  const periodCutoff = useMemo(
    () => computeCutoffDate(lastDataMs, mobilePeriod),
    [lastDataMs, mobilePeriod],
  );

  // All route weeks (full history for baseline)
  const allRouteWeeks = useAllRouteWeeks(allRows, selectedRoute, tod);

  // Mobile verdict: double-period window
  // Recent = question's time period; Baseline = same duration before that
  const { baselineWeeks, recentWeeks } = useMemo(() => {
    // Recent: weeks within the question's time period
    const rc = allRouteWeeks.filter(w => w.weekStart >= periodCutoff);
    // Baseline: same duration immediately before the recent period
    const periodMs = lastDataMs - periodCutoff.getTime();
    const baselineStart = new Date(periodCutoff.getTime() - periodMs);
    const bl = allRouteWeeks.filter(w => w.weekStart >= baselineStart && w.weekStart < periodCutoff);
    return { baselineWeeks: bl, recentWeeks: rc };
  }, [allRouteWeeks, periodCutoff, lastDataMs]);

  // Filtered data for charts
  const { merged, dailyData, selectedStats } = useFilteredData(allRows, selectedRoute, mobilePeriod, tod);

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
    questionModeState, recentSpeed, baselineSpeed, recentWeeks.length, cfg.percentile.verdict_threshold_kmh,
  );
  const v = VERDICT[verdictKey];

  // Chart data — user-togglable daily/weekly
  const chartData = chartGranularity === "daily" ? dailyData : merged;
  const chartDataKey = chartGranularity === "daily" ? "dateKey" : "weekKey";

  const colors = thm.chart;
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

  // Cycle handlers for clickable question pills
  const toggleMode = useCallback(() => {
    setQuestionModeState(m => m === "worsened" ? "improved" : "worsened");
  }, []);
  const nextTod = useCallback(() => {
    setTodIdx(i => (i + 1) % TOD_LIST.length);
  }, []);
  const nextPeriod = useCallback(() => {
    setPeriodIdx(i => (i + 1) % PERIOD_LIST.length);
  }, []);
  const nextRoute = useCallback(() => {
    setRouteIdx(i => (i + 1) % routeOptions.length);
  }, [routeOptions.length]);

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

  // Chart domain — must be above any early return
  const durationDomain = useMemo(() => {
    const vals = (chartData as any[]).flatMap((d: any) => [d.avgDuration, d.p05Duration, d.p95Duration]).filter((v: number) => v > 0);
    if (!vals.length) return { min: 0, max: 1 };
    const pad = (Math.max(...vals) - Math.min(...vals)) * 0.08 || 1;
    return { min: Math.round(Math.max(0, Math.min(...vals) - pad) * 10) / 10, max: Math.round((Math.max(...vals) + pad) * 10) / 10 };
  }, [chartData]);

  // Loading state — after all hooks
  if (showLoader) {
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
        <div style={{ position: "relative", display: "inline-block" }}>
          <img src="/trafficoracle-light.png" alt="TraffiCOracle" style={{ height: 28, width: "auto", display: "block" }} />
          <svg
            height={18}
            viewBox="0 0 120 12"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{ position: "absolute", bottom: -11, right: -15, overflow: "visible" }}
          >
            <rect
              x={58}
              y={3}
              width={74}
              height={12}
              rx={0}
              fill={thm.sectionBg}
              stroke={thm.cardBorder}
              strokeWidth={0.5}
            />
            <text
              x={50}
              y={10}
              textAnchor="start"
              fill={thm.textMuted}
              fontSize={9}
              fontFamily="var(--app-font-display), Inter, system-ui, sans-serif"
              fontWeight={900}
              letterSpacing="0.14em"
            >
              {selectedCity.toUpperCase()}
            </text>
          </svg>
        </div>
        <button
          onClick={() => setMenuOpen(o => !o)}
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: thm.textMuted, padding: 8,
          }}
          aria-label="Menu"
        >
          <EllipsisVertical size={20} />
        </button>
      </header>

      {/* ── Simple menu overlay ─────────────────────────────── */}
      {menuOpen && (
        <div style={{
          position: "absolute", top: 64, right: 8, zIndex: 200,
          background: thm.sectionBg, border: thm.cardBorder,
          borderRadius: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
          padding: 8, minWidth: 200,
        }}>

          {/* ── City selector ───────────────────────────────── */}
          <p style={{ fontSize: 10, fontWeight: 600, color: thm.textMuted, margin: "6px 12px 4px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            City
          </p>
          {CITIES.map((city) => {
            const hasData = !!city.data_source;
            return (
              <button
                key={city.name}
                onClick={() => { setSelectedCity(city.name); setMenuOpen(false); }}
                style={{
                  display: "flex", alignItems: "center", gap: 8, width: "100%",
                  padding: "8px 12px", border: "none",
                  background: selectedCity === city.name ? "rgba(128,128,128,0.15)" : "transparent",
                  cursor: "pointer", fontSize: 13, color: thm.textPrimary, borderRadius: 8,
                  fontWeight: selectedCity === city.name ? 600 : 400,
                  opacity: hasData ? 1 : 0.55,
                }}
              >
                <span style={{ fontSize: 10 }}>
                  {selectedCity === city.name ? "●" : hasData ? "○" : "◌"}
                </span>
                <span>{city.name}</span>
              </button>
            );
          })}

          <div style={{ height: 1, background: thm.cardBorder, margin: "4px 8px" }} />

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

          {/* ── Theme selector ───────────────────────────────── */}
          <div style={{ height: 1, background: thm.cardBorder, margin: "4px 8px" }} />
          <p style={{ fontSize: 10, fontWeight: 600, color: thm.textMuted, margin: "6px 12px 4px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Theme
          </p>
          {(["colour", "gray", "pastel"] as ThemeKey[]).map(key => (
            <button key={key} onClick={() => { setTheme(key); setMenuOpen(false); }} style={{
              display: "flex", alignItems: "center", gap: 8, width: "100%",
              padding: "8px 12px", border: "none",
              background: themeKey === key ? "rgba(128,128,128,0.15)" : "transparent",
              cursor: "pointer", fontSize: 13, color: thm.textPrimary, borderRadius: 8,
              fontWeight: themeKey === key ? 600 : 400,
            }}>
              <span>{THEME_META[key].icon}</span>
              <span>{THEME_META[key].label}</span>
              {themeKey === key && <span style={{ marginLeft: "auto", fontSize: 11, color: thm.textMuted }}>✓</span>}
            </button>
          ))}
        </div>
      )}

      {/* ── Scrollable content ──────────────────────────────── */}
      <main style={{
        flex: 1, overflowY: "auto", overflowX: "hidden",
        padding: "16px", display: "flex", flexDirection: "column", gap: 24,
      }}>
        {/* Error */}
        {!loading && error && (
          <div style={{ textAlign: "center", padding: "3rem 1rem" }}>
            <p style={{ fontSize: 48, marginBottom: 8 }}>📡</p>
            <p style={{ fontWeight: 700, color: thm.textPrimary }}>Data unavailable</p>
            <p style={{ fontSize: 13, color: thm.textMuted }}>{error}</p>
          </div>
        )}

        {/* City 404 — shared Route 404 page */}
        {!loading && !error && !citySource && (
          <div style={{ padding: "3rem 1.5rem" }}>
            <Route404 selectedCity={selectedCity} thm={thm} />
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

            {/* ── Route question (clickable pills) ─────────── */}
            <div style={{ textAlign: "center", padding: "8px 0" }}>
              <p style={{
                fontFamily: "var(--app-font-display)", fontWeight: 800,
                fontSize: "clamp(1.15rem, 5vw, 1.6rem)", lineHeight: 1.6,
                color: thm.textPrimary, margin: 0,
                display: "flex", flexWrap: "wrap", alignItems: "center",
                justifyContent: "center", gap: "0.3em",
              }}>
                <span>Has traffic</span>
                <button onClick={toggleMode} style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  padding: "2px 10px", borderRadius: 8, cursor: "pointer",
                  background: thm.verdictBg(v.bg),
                  border: `1px solid ${thm.verdictBorder(v.border)}`,
                  color: thm.verdictText(v.tc),
                  fontWeight: 700, fontSize: "inherit",
                  fontFamily: "inherit",
                }}>{questionModeState === "worsened" ? "👎" : "👍"} {questionModeState}</button>
                <span style={{ width: "100%", height: 0, flexBasis: "100%" }} />
                <span>on</span>
                <button onClick={nextRoute} style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  padding: "2px 10px", borderRadius: 8, cursor: "pointer",
                  background: thm.sectionBg, border: thm.cardBorder,
                  color: thm.chart.line1, fontWeight: 700, fontSize: "inherit",
                  fontFamily: "inherit",
                }}>🚦 {selectedRoute}</button>
                <span style={{ width: "100%", height: 0, flexBasis: "100%" }} />
                <span>during</span>
                <button onClick={nextTod} style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  padding: "2px 10px", borderRadius: 8, cursor: "pointer",
                  background: thm.sectionBg, border: thm.cardBorder,
                  color: thm.textPrimary, fontWeight: 600, fontSize: "inherit",
                  fontFamily: "inherit",
                }}>⏱️ {TOD_LIST[todIdx].label}</button>
                <span style={{ width: "100%", height: 0, flexBasis: "100%" }} />
                <span>over the past</span>
                <button onClick={nextPeriod} style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  padding: "2px 10px", borderRadius: 8, cursor: "pointer",
                  background: thm.sectionBg, border: thm.cardBorder,
                  color: thm.textPrimary, fontWeight: 600, fontSize: "inherit",
                  fontFamily: "inherit",
                }}>📅 {PERIOD_LIST[periodIdx].label}</button>
                <span>?</span>
              </p>
            </div>

            {/* ── Verdict ────────────────────────────────────── */}
            <div style={{
              background: thm.verdictBg(v.bg),
              border: `1px solid ${thm.verdictBorder(v.border)}`,
              borderRadius: 14, padding: "16px 16px", textAlign: "center",
            }}>
              <p style={{ fontSize: "2.5rem", lineHeight: 1, marginBottom: 6 }}>{v.face}</p>
              <p style={{
                fontFamily: "var(--app-font-display)", fontWeight: 700, fontSize: 15,
                color: thm.verdictText(v.tc), margin: 0,
              }}>
                {v.msg}
              </p>

              {/* Napkin chart — edge-to-edge, no side labels */}
              {(baselineWeeks.length > 0 || recentWeeks.length > 0) && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ margin: "0 -4px" }}>
                    <NapkinChart baselineWeeks={baselineWeeks} recentWeeks={recentWeeks} height={100} />
                  </div>
                  {/* Legend row below sparkline */}
                  <div style={{
                    display: "flex", justifyContent: "center", alignItems: "center",
                    gap: 8, marginTop: 8,
                  }}>
                    {baselineSpeed > 0 && (
                      <span style={{ fontSize: 11, color: thm.textMuted }}>
                        Baseline{" "}
                        <span style={{ fontWeight: 700, fontSize: 13, color: thm.verdictText(v.tc) }}>
                          {baselineSpeed}
                        </span>
                        <span style={{ fontSize: 10 }}> km/h</span>
                      </span>
                    )}
                    {baselineSpeed > 0 && recentSpeed > 0 && (
                      <span style={{
                        fontSize: 14, fontWeight: 700,
                        color: recentSpeed > baselineSpeed
                          ? thm.key === "colour" ? "#34D399" : "#2E7D32"
                          : recentSpeed < baselineSpeed
                            ? thm.key === "colour" ? "#F87171" : "#C0392B"
                            : thm.textMuted,
                      }}>
                        {recentSpeed > baselineSpeed ? "↗" : recentSpeed < baselineSpeed ? "↘" : "→"}
                      </span>
                    )}
                    {recentSpeed > 0 && (
                      <span style={{ fontSize: 11, color: thm.textMuted }}>
                        Recent{" "}
                        <span style={{ fontWeight: 700, fontSize: 13, color: thm.verdictText(v.tc) }}>
                          {recentSpeed}
                        </span>
                        <span style={{ fontSize: 10 }}> km/h</span>
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* ── Duration chart ─────────────────────────────── */}
            {chartData.length > 0 && (
              <div style={{
                background: thm.key !== "colour" ? thm.cardBg : "transparent",
                border: thm.key !== "colour" ? thm.cardBorder : "none",
                borderRadius: 16, padding: "16px 8px 8px",
              }}>
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  margin: "0 8px 4px",
                }}>
                  <p style={{
                    fontFamily: "var(--app-font-display)", fontWeight: 700, fontSize: 14,
                    color: thm.textPrimary, margin: 0,
                  }}>
                    🐌 Trip Duration Over Time
                  </p>
                  {/* Daily / Weekly toggle */}
                  <div style={{ display: "flex", alignItems: "center", gap: 4, background: thm.sectionBg, borderRadius: 8, padding: 2 }}>
                    {(["daily", "weekly"] as const).map(g => (
                      <button key={g}
                        onClick={() => setChartGranularity(g)}
                        style={{
                          padding: "4px 10px",
                          borderRadius: 6,
                          border: "none",
                          background: chartGranularity === g ? thm.cardBg : "transparent",
                          color: chartGranularity === g ? thm.textPrimary : thm.textMuted,
                          fontSize: 11,
                          fontWeight: chartGranularity === g ? 600 : 400,
                          cursor: "pointer",
                          boxShadow: chartGranularity === g ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                          textTransform: "capitalize",
                        }}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                </div>
                <p style={{ fontSize: 11, color: thm.textMuted, margin: "0 0 10px 8px" }}>
                  {chartGranularity === "daily" ? "Daily" : "Weekly"} avg and bad-day trips — lower is better
                </p>
                <ResponsiveContainer width="100%" height={220}>
                  <ComposedChart key={`dur-${chartGranularity}`} data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
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
              fontSize: 11, color: thm.textMuted,
              textAlign: "center",
              padding: "8px 0 16px", borderTop: `1px solid ${thm.key === "gray" ? "#e0e0e0" : "hsl(var(--border))"}`,
            }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", flexWrap: "wrap", gap: "0 4px" }}>
                <b style={{ lineHeight: 1 }}>Data Source</b>{" "}
                {(() => {
                  const trafficUrl = selectedCityConfig.data_source?.traffic_csv ?? "";
                  const ghMatch = trafficUrl.match(/raw\.githubusercontent\.com\/([^/]+\/[^/]+)/);
                  const cdnMatch = trafficUrl.match(/cdn\.jsdelivr\.net\/gh\/([^/]+\/[^/]+)/);
                  const shortGh = ghMatch ? ghMatch[1] : cdnMatch ? cdnMatch[1].replace(/@.*$/, "") : null;
                  const shortUrl = shortGh ?? trafficUrl;
                  const href = shortGh ? `https://github.com/${shortGh}` : trafficUrl;
                  const showLogo = !!shortGh;
                  return (
                    <a href={href} target="_blank" rel="noopener noreferrer"
                      style={{ color: thm.chart.line4, display: "inline-flex", alignItems: "baseline", gap: 4, lineHeight: 1, padding: "0 2px" }}>
                      {showLogo && <svg height="11" width="11" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" style={{ flexShrink: 0 }}>
                        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                      </svg>}
                      {shortUrl}
                    </a>
                  );
                })()}
                {" · "}
                {rowCount > 0 && dataTimestamp && (
                  <span>{rowCount.toLocaleString()} rows updated at {dataTimestamp.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false })}</span>
                )}
              </div>
              <p style={{ margin: "4px 0 0", fontSize: 10 }}>© 2026 <a href="https://thecontrarian.in/" target="_blank" rel="noopener noreferrer" style={{ color: thm.chart.line4 }}>Mahesh Shantaram</a></p>
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
