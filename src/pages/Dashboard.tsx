import { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import * as SliderPrimitive from "@radix-ui/react-slider";
import {
  AreaChart, Area, ComposedChart, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip as RCTooltip, Legend, ResponsiveContainer,
} from "recharts";
import { computeBaselineStats, computeChartDomain } from "@/lib/chartHelpers";
import type { BaselineChartStats, ChartDomain } from "@/lib/chartHelpers";
import { Share2, Plus, Minus } from "lucide-react";
import InfoTip from "@/components/ui/InfoTip";
import { TOOLTIP_CONTENT, fillTemplate } from "@/lib/tooltipContent";
import {
  useTrafficData, useFilteredData, useAllRouteWeeks, useDailyStats, useWeatherData,
  useBenchmarkRoutes, useBenchmarkDailyStats, useEmpiricalBandThresholds,
  matchesToD, aggregateRows,
} from "@/lib/useTrafficData";
import type { TimePeriod, TimeOfDay, DayStats, TrafficRow, WeatherRow } from "@/lib/useTrafficData";
import { ThemeProvider, useTheme } from "@/lib/ThemeContext";
import { THEME_META, THEME_CYCLE } from "@/lib/theme";
import type { ChipVariant, AppTheme } from "@/lib/theme";
import { TimeTravelProvider, useTimeTravel } from "@/lib/TimeTravelContext";
import { resolveSliderFromWeekKeys, resolveRouteIndex, validateSnapshot } from "@/lib/ttStateHelpers";
import type { DashboardSnapshot } from "@/lib/ttStateHelpers";
import RouteBrowserPane from "@/components/RouteBrowserPane";
import UncertaintyBandChart from "@/components/UncertaintyBandChart";
import { CalendarWidget } from "@/components/CalendarWidget";
import type { ViewingMode } from "@/components/UncertaintyBandChart";
import { buildBands } from "@/lib/forecastBands";
import appConfig from "../config.json";
import type { AppConfig } from "../lib/config";

// ── Shared core modules ──────────────────────────────────────────
import { fmtWeek, fmtDate, fmtDuration, weeklyAvg } from "@/core/format";
import { PERIOD_LIST, TOD_LIST, VERDICT, deriveVerdict } from "@/core/constants";
import type { VerdictKey, DataTrend } from "@/core/constants";
import { computeAllRouteCards } from "@/core/trafficNow";
import type { RouteCardData } from "@/core/trafficNow";
import { readUrlParams } from "@/core/urlState";
import { computeCutoffDate, computeBaselineAndRecent, computeSpeedDiff } from "@/core/periodLogic";

// ── Shared UI components ────────────────────────────────────────
import LocationDropdown from "@/components/shared/LocationDropdown";
import Chip from "@/components/shared/Chip";
import NapkinChart from "@/components/shared/NapkinChart";
import { useChartTooltip } from "@/components/shared/ChartTooltipFactory";
import Route404 from "@/components/shared/Route404";

// ── R³S² (Rolling Relative Route Scoring System) ────────────────
import { useRrsData, useRrsContext } from "@/lib/rrsData";
import { RrsContextBlock } from "@/components/RrsContextBlock";
import { RrsDebugBlock } from "@/components/RrsDebugBlock";

const cfg = appConfig as AppConfig;
const CITIES = cfg.cities;

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const handler = (e: MediaQueryListEvent | MediaQueryList) => setIsMobile(e.matches);
    handler(mq);
    mq.addEventListener("change", handler as any);
    return () => mq.removeEventListener("change", handler as any);
  }, []);
  return isMobile;
}

const URL_PARAMS = readUrlParams();

const fmtSliderDate = fmtDate;
const fmtShortDate  = fmtDate;

/* ── Sparkles ─────────────────────────────────────────────────── */
function Sparkles() {
  const s = ["🎊","✨","🎉","⭐","💫","🌟","🎊","✨","🎉","💥"];
  return (
    <div style={{ position:"absolute", inset:0, pointerEvents:"none", overflow:"hidden", zIndex:20 }}>
      {s.map((e,i) => (
        <span key={i} className="sparkle-particle" style={{
          position:"absolute", left:`${4+i*9.6}%`, top:`${15+(i%4)*16}%`,
          fontSize:12+(i%3)*8, animationDelay:`${i*0.07}s`,
        }}>{e}</span>
      ))}
    </div>
  );
}

/* ── Calendar widget ──────────────────────────────────────────── */
const CIRCLE_D = 38;
const DAY_HDR  = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

function parseYM(s: string) {
  const d = new Date(s + "T12:00:00");
  return { y: d.getFullYear(), m: d.getMonth() };
}

/* ── Main dashboard (inner — consumes ThemeContext) ───────────── */
function DashboardInner() {
  const { theme: thm, themeKey, nextThemeKey, cycleTheme } = useTheme();
  const tt = useTimeTravel();
  const isMobile = useIsMobile();
  const liveRef = useRef<HTMLDivElement>(null);

  // Time Travel pill state and helpers
  const [ttPopoverOpen, setTtPopoverOpen] = useState(false);
  const ttButtonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth());
  const [calYear, setCalYear] = useState(() => new Date().getFullYear());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState(() => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  });

  function ttFormat(dt: Date): string {
    const wd = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][dt.getDay()];
    const d = dt.getDate();
    const mon = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][dt.getMonth()];
    const yr = String(dt.getFullYear()).slice(2);
    const hh = String(dt.getHours()).padStart(2, "0");
    const mm = String(dt.getMinutes()).padStart(2, "0");
    return `${wd} ${d} ${mon} '${yr} · ${hh}:${mm}`;
  }

  // TT glow colours per theme — blazing tier
  const ttGlowMap: Record<string, string> = {
    colour: "0 0 18px rgba(139,92,246,0.55), 0 0 6px rgba(139,92,246,0.4), 0 0 40px rgba(139,92,246,0.15)",
    gray:   "0 0 14px rgba(160,160,160,0.4), 0 0 4px rgba(200,200,200,0.3), 0 0 32px rgba(160,160,160,0.1)",
    pastel: "0 0 18px rgba(251,191,36,0.5), 0 0 6px rgba(251,191,36,0.35), 0 0 40px rgba(251,191,36,0.12)",
  };
  const ttBgActiveMap: Record<string, string> = {
    colour: "linear-gradient(135deg, rgba(139,92,246,0.25), rgba(99,102,241,0.15), rgba(139,92,246,0.2))",
    gray:   "linear-gradient(135deg, #e0e0e0, #d0d0d0)",
    pastel: "linear-gradient(135deg, #FDE68A, #F5E6C8)",
  };
  const ttBorderActiveMap: Record<string, string> = {
    colour: "rgba(139,92,246,0.8)",
    gray:   "#777",
    pastel: "#B8860B",
  };
  const ttTextActiveMap: Record<string, string> = {
    colour: "#E9D5FF",
    gray:   "#333",
    pastel: "#78350F",
  };

  // Build month grid for calendar (Monday-start)
  function buildMonthGrid(year: number, month: number): (number | null)[][] {
    const firstDay = new Date(year, month, 1);
    let startDow = firstDay.getDay() - 1;
    if (startDow < 0) startDow = 6;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: (number | null)[] = [];
    for (let i = 0; i < startDow; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length < 42) cells.push(null);
    const rows: (number | null)[][] = [];
    for (let i = 0; i < 42; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }

  // Click-outside dismiss for TT popover
  useEffect(() => {
    if (!ttPopoverOpen) return;
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
          ttButtonRef.current && !ttButtonRef.current.contains(e.target as Node)) {
        setTtPopoverOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [ttPopoverOpen]);

  // Announce dynamic changes to screen readers
  const announce = useCallback((msg: string) => {
    if (liveRef.current) liveRef.current.textContent = msg;
  }, []);

  /* City selection */
  const defaultCityName = CITIES.find(c => c.data_source)?.name ?? CITIES[0].name;
  const initialCity = URL_PARAMS.city
    ? (CITIES.find(c => c.name === URL_PARAMS.city)?.name ?? defaultCityName)
    : defaultCityName;
  const [selectedCity, setSelectedCity] = useState(initialCity);

  // Clean city from URL after initial read — city is shown in the logo instead
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.has("city")) {
      p.delete("city");
      const qs = p.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`);
    }
  }, []);

  const selectedCityConfig = useMemo(() =>
    CITIES.find(c => c.name === selectedCity) ?? CITIES[0],
    [selectedCity],
  );
  const citySource = selectedCityConfig.data_source;

  /* UI state */
  const [periodIdx,    setPeriodIdx]    = useState(() => {
    const i = PERIOD_LIST.findIndex(p => p.value === URL_PARAMS.period);
    return i >= 0 ? i : PERIOD_LIST.findIndex(p => p.value === cfg.defaults.period);
  });
  const [todIdx,       setTodIdx]       = useState(() => {
    const i = TOD_LIST.findIndex(t => t.value === URL_PARAMS.tod);
    return i >= 0 ? i : TOD_LIST.findIndex(t => t.value === cfg.defaults.time_of_day);
  });
  const [routeIdx,     setRouteIdx]     = useState(0);
  const [questionMode, setQuestionMode] = useState<"worsened"|"improved">(
    URL_PARAMS.mode === "improved" ? "improved" : cfg.defaults.question_mode
  );
  const [chartView, setChartView] = useState<'speed' | 'duration'>(
    (URL_PARAMS.metric === "duration" ? "duration" : URL_PARAMS.metric === "speed" ? "speed" : null) ?? cfg.defaults.chart_metric
  );
  const [chartGranularity, setChartGranularity] = useState<'daily' | 'weekly'>(
    (URL_PARAMS.aggregation === "weekly" ? "weekly" : URL_PARAMS.aggregation === "daily" ? "daily" : null) ?? cfg.defaults.time_aggregation
  );

  /* chip animation */
  const [chipAnim, setChipAnim] = useState<Record<string,boolean>>({});
  const chipTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const popChip = useCallback((key:string) => {
    clearTimeout(chipTimer.current);
    setChipAnim(a => ({...a,[key]:true}));
    chipTimer.current = setTimeout(() => setChipAnim(a => ({...a,[key]:false})), 400);
  }, []);

  /* slider */
  const [sliderVals,  setSliderVals]  = useState<[number,number]>([0,1]);
  const [sliderManuallySet, setSliderManuallySet] = useState(false);
  const [showSparkle, setShowSparkle] = useState(false);
  const sparkleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [overlapWarning, setOverlapWarning] = useState(false);
  const overlapTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [dragThumb,   setDragThumb]   = useState<-1|0|1>(-1);
  const sliderValsRef = useRef(sliderVals);
  sliderValsRef.current = sliderVals;
  const trackRef = useRef<HTMLElement>(null);
  const [trackW, setTrackW] = useState(0);
  useLayoutEffect(() => {
    if (trackRef.current) {
      setTrackW(trackRef.current.getBoundingClientRect().width);
    }
  });
  useEffect(() => {
    const up = () => setDragThumb(-1);
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, []);

  const urlParamsRef = useRef<{ bl?: number; br?: number; routeApplied: boolean }>({
    bl: typeof URL_PARAMS.bl === "number" ? URL_PARAMS.bl : undefined,
    br: typeof URL_PARAMS.br === "number" ? URL_PARAMS.br : undefined,
    routeApplied: false,
  });

  /* Share */
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  /* ── Car animation — runs on mount and on every city change ──── */
  const [showIntro, setShowIntro] = useState(true); /* hides cards until car finishes */
  const [showCar,   setShowCar]   = useState(true); /* keeps car visible until cards are in */
  const [loadPct,   setLoadPct]   = useState(0);    /* 0-100 counter shown during car */
  const [carReady,  setCarReady]  = useState(false); /* true once trackW measured & timer started */
  const [carFading, setCarFading] = useState(false); /* true during 400ms fade-out after reveal */
  const [settledCity, setSettledCity] = useState<string | null>(null);
  const [paneOpen,  setPaneOpen]  = useState(() => {
    try { const s = localStorage.getItem("to:paneOpen"); if (s !== null) return s === "1"; } catch {}
    return cfg.route_pane.open ?? true;
  });
  const willReopenPane = useRef(false);
  const animStarted = useRef(false); /* guard: start timers exactly once per city switch */
  const cleanupRef = useRef<(() => void) | null>(null);

  /* Sync reset before paint — prevents one-frame card flash on city switch */
  useLayoutEffect(() => {
    setShowIntro(true);
    setShowCar(!!citySource);
    setLoadPct(0);
    setCarReady(false);
    setCarFading(false);
    setSettledCity(citySource ? null : selectedCity);
    animStarted.current = false; /* allow animation to start for this city */
    if (!citySource) {
      setPaneOpen(false);
      willReopenPane.current = false;
    }
  }, [selectedCity]);

  /* ── Car animation timer — fires once data loads ──
     The car races the full width of the timeline.
     Sequence:
       0 ms  : car appears at left edge, counter at 0%
       2.0s  : car reaches finish line, all components reveal (showIntro → false)
       2.6s  : car and counter begin gentle fade-out
       4.0s  : car removed, pane reopens, settledCity set
  ── */
  /* trackWReadyRef: mirrors trackW so the animation effect can read the latest
     value without adding trackW to deps (which would cancel timers on resize). */
  const trackWReadyRef = useRef(0);
  trackWReadyRef.current = trackW;

  useEffect(() => {
    if (!citySource) return;

    /* Poll until the slider DOM is measured AND real data is loaded,
       then start exactly once. */
    let pollRaf: number;
    const waitForTrack = () => {
      if (animStarted.current) return; /* already started */
      if (trackWReadyRef.current <= 0 || loadingRef.current || rowCountRef.current === 0 || routeWeeksRef.current <= 1) {
        pollRaf = requestAnimationFrame(waitForTrack);
        return;
      }
      /* Track is measured and data is loaded — kick off the animation. */
      animStarted.current = true;
      setCarReady(true);

      const DURATION = 2000;
      const start = performance.now();
      let raf: number;
      const tick = (now: number) => {
        /* Step counter in multiples of 5 */
        const raw = Math.min(100, ((now - start) / DURATION) * 100);
        const pct = Math.min(100, Math.ceil(raw / 5) * 5);
        setLoadPct(pct);
        if (raw < 100) { raf = requestAnimationFrame(tick); }
      };
      raf = requestAnimationFrame(tick);

      /* Retract pane invisibly, remember whether to reopen */
      try { const s = localStorage.getItem("to:paneOpen"); willReopenPane.current = s !== null ? s === "1" : (cfg.route_pane.open ?? true); } catch { willReopenPane.current = paneOpen; }
      setPaneOpen(false);

      /* 2.0s: car reaches finish line, all components reveal
         2.6s: gentle fade-out begins (1.2s transition)
         4.0s: React removes car node, reopen pane */
      const t1 = setTimeout(() => setShowIntro(false), 2000);
      const t2 = setTimeout(() => setCarFading(true), 2600);
      const t3 = setTimeout(() => {
        setShowCar(false);
        setCarFading(false);
        setSettledCity(selectedCity);
        if (willReopenPane.current) setPaneOpen(true);
      }, 4000);

      /* Store cleanup refs on the outer scope so the effect cleanup can reach them */
      cleanupRef.current = () => { cancelAnimationFrame(raf); clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
    };
    pollRaf = requestAnimationFrame(waitForTrack);
    return () => {
      cancelAnimationFrame(pollRaf);
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [citySource, selectedCity]); /* stable deps — trackW read via ref */

  /* Zoom control — steps hardcoded; no longer read from config.json */
  const ZOOM_STEPS = [0.80, 0.90, 1.00, 1.10, 1.20];
  const [zoomIdx, setZoomIdx] = useState(() => {
    const z = URL_PARAMS.zoom as number | undefined;
    if (z) {
      const closest = ZOOM_STEPS.reduce((best, v, i) =>
        Math.abs(v - z) < Math.abs(ZOOM_STEPS[best] - z) ? i : best, 0);
      return closest;
    }
    return 2; /* default 1.00 */
  });
  const mainContentRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const zoom = ZOOM_STEPS[zoomIdx];
    /* CSS zoom affects layout flow (unlike transform:scale), so the scrollable
       area grows/shrinks naturally and there is no empty space at the bottom. */
    if (mainContentRef.current) {
      mainContentRef.current.style.zoom = String(zoom);
    }
  }, [zoomIdx]);
  const zoomIn = useCallback(() => setZoomIdx(i => Math.min(i + 1, ZOOM_STEPS.length - 1)), []);
  const zoomOut = useCallback(() => setZoomIdx(i => Math.max(i - 1, 0)), []);

  /* route dropdown */
  const [routeDropdownOpen, setRouteDropdownOpen] = useState(false);
  const routeDropdownRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (routeDropdownRef.current && !routeDropdownRef.current.contains(e.target as Node)) {
        setRouteDropdownOpen(false);
      }
    };
    if (routeDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
    return undefined;
  }, [routeDropdownOpen]);

  /* data */
  const { routes, allRows, loading, error, rowCount, lastUpdated, dataTimestamp, refresh } =
    useTrafficData(citySource, tt.isActive);
  const weatherMap = useWeatherData();

  // Time Travel: filter allRows to historical subset when TT is active
  const ttAllRows = useMemo(() => {
    if (!tt.isActive || !tt.simulatedNow) return allRows;
    const cutoff = tt.simulatedNow.getTime();
    return allRows.filter(r => r.timestamp.getTime() <= cutoff);
  }, [allRows, tt.isActive, tt.simulatedNow]);

  // TT weather: derive from last eligible row per route when TT is active
  const effectiveWeatherMap = useMemo(() => {
    if (!tt.isActive || !tt.simulatedNow) return weatherMap;
    // Build weather from the last eligible row per route_code
    const lastByRoute = new Map<string, TrafficRow>();
    for (const row of ttAllRows) {
      const existing = lastByRoute.get(row.route_code);
      if (!existing || row.timestamp.getTime() > existing.timestamp.getTime()) {
        lastByRoute.set(row.route_code, row);
      }
    }
    const map = new Map<string, WeatherRow>();
    for (const [rc, row] of lastByRoute) {
      // Only include if at least one weather field is populated
      if (row.temp_c === null && row.realfeel_c === null && row.humidity_pct === null && row.aqi === null && row.rsi_flag === null) continue;
      map.set(rc, {
        route_code: rc,
        aqi: row.aqi,
        aqi_category: "",       // not available from traffic CSV
        condition: row.rsi_flag ?? "",
        temp_c: row.temp_c,
        temp_flag: "",           // not available from traffic CSV
        realfeel_c: row.realfeel_c,
        realfeel_word: "",       // not available from traffic CSV
        humidity_pct: row.humidity_pct,
        wind_gust_kmh: null,     // not available from traffic CSV
        uv_index: null,          // not available from traffic CSV
      });
    }
    return map;
  }, [tt.isActive, tt.simulatedNow, ttAllRows, weatherMap]);

  const effectiveRowCount = ttAllRows.length;
  const effectiveDataTimestamp = useMemo(() => {
    if (tt.isActive && tt.simulatedNow) return tt.simulatedNow;
    return dataTimestamp;
  }, [tt.isActive, tt.simulatedNow, dataTimestamp]);

  // Hydrate Time Travel from ?tt= URL param on mount
  const ttHydrated = useRef(false);
  useEffect(() => {
    if (ttHydrated.current) return;
    if (URL_PARAMS.tt && typeof URL_PARAMS.tt === "string" && !tt.isActive) {
      const dt = new Date(URL_PARAMS.tt);
      if (!isNaN(dt.getTime())) {
        tt.activate(dt);
      }
    }
    ttHydrated.current = true;
  }, []);

  // Inject TT animation keyframes when TT is active; remove when off
  useEffect(() => {
    if (!tt.isActive) {
      const el = document.getElementById("tt-animations");
      if (el) el.remove();
      return;
    }
    if (document.getElementById("tt-animations")) return;
    const style = document.createElement("style");
    style.id = "tt-animations";
    style.textContent = `
      @keyframes tt-glow-pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.65; }
      }
      @keyframes tt-ember-sweep {
        0% { background-position: -200% center; }
        100% { background-position: 200% center; }
      }
      @keyframes tt-aura-breath {
        0%, 100% { opacity: 0.55; }
        50% { opacity: 0.9; }
      }
      @media (prefers-reduced-motion: reduce) {
        .tt-pill-blaze, .tt-aura-overlay, .tt-shimmer { animation: none !important; }
      }
    `;
    document.head.appendChild(style);
  }, [tt.isActive]);

  // Update URL during TT playback (replaceState to avoid flooding history)
  const wasTtActiveRef = useRef(false);
  useEffect(() => {
    if (!tt.isActive) {
      if (wasTtActiveRef.current) {
        const p = new URLSearchParams(window.location.search);
        p.delete("tt");
        const qs = p.toString();
        window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`);
        wasTtActiveRef.current = false;
      }
      return;
    }
    if (!tt.simulatedNow) return;
    wasTtActiveRef.current = true;
    const p = new URLSearchParams(window.location.search);
    p.set("tt", tt.simulatedNow.toISOString());
    window.history.replaceState(null, "", `${window.location.pathname}?${p.toString()}${window.location.hash}`);
  }, [tt.isActive, tt.simulatedNow]);

  // Calendar data availability (uses full allRows, not TT-filtered)
  const dataDays = useMemo(() => {
    const set = new Set<string>();
    for (const r of allRows) {
      const d = r.timestamp;
      set.add(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`);
    }
    return set;
  }, [allRows]);

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;

  // Announce data state changes to screen readers
  useEffect(() => {
    if (loading) announce("Loading traffic data…");
    else if (error) announce("Error loading traffic data: " + error);
    else if (rowCount > 0) announce("Traffic data loaded for " + selectedCity + ". " + rowCount.toLocaleString() + " rows.");
  }, [loading, error, rowCount, selectedCity, announce]);

  const routeOptions = useMemo(() => {
    const labels = Array.from(new Set(ttAllRows.map(r => r.label_short))).sort();
    return labels.length ? labels : ["Old Airport Road"];
  }, [ttAllRows]);

  useEffect(() => {
    if (allRows.length === 0 || urlParamsRef.current.routeApplied) return;
    if (URL_PARAMS.route) {
      const idx = routeOptions.indexOf(URL_PARAMS.route as string);
      if (idx >= 0) setRouteIdx(idx);
    } else if (cfg.defaults.route) {
      const idx = routeOptions.indexOf(cfg.defaults.route);
      if (idx >= 0) setRouteIdx(idx);
    }
    urlParamsRef.current.routeApplied = true;
  }, [routeOptions]);

  const selectedRoute = routeOptions[routeIdx % routeOptions.length] ?? "Old Airport Road";
  const period        = PERIOD_LIST[periodIdx].value;
  const tod           = TOD_LIST[todIdx].value;
  const periodLabel   = PERIOD_LIST[periodIdx].label;
  const todLabel      = TOD_LIST[todIdx].label;

  // Live-mode route/weeks — computed from allRows, independent of TT filtering.
  // Used in the save block to capture the user's pre-TT context.
  const liveRouteOptions = useMemo(() => {
    const labels = Array.from(new Set(allRows.map(r => r.label_short))).sort();
    return labels.length ? labels : ["Old Airport Road"];
  }, [allRows]);
  const liveSelectedRoute = liveRouteOptions[routeIdx % liveRouteOptions.length] ?? "Old Airport Road";
  const liveAllRouteWeeks = useAllRouteWeeks(allRows, liveSelectedRoute, tod);

  // Always-current snapshot of user-facing state for TT save/restore.
  // Updated every render so the save effect captures correct values
  // without stale-closure risk.
  const stateSnapshotRef = useRef<Omit<DashboardSnapshot, "sliderWeekKeys">>({
    periodIdx, todIdx, questionMode, chartView, chartGranularity,
    routeName: selectedRoute,
  });
  stateSnapshotRef.current = {
    periodIdx, todIdx, questionMode, chartView, chartGranularity,
    routeName: selectedRoute,
  };

  const selectedRouteInfo = useMemo(
    () => routes.find(r => r.label_short === selectedRoute),
    [routes, selectedRoute],
  );
  const labelFull = selectedRouteInfo?.label_full ?? selectedRoute;
  const arrowIdx  = labelFull.indexOf("→");
  const routeOrigin      = arrowIdx > 0 ? labelFull.slice(0, arrowIdx).trim()      : labelFull;
  const routeDestination = arrowIdx > 0 ? labelFull.slice(arrowIdx + 1).trim() : "";
  const routeEndpoints   = routeDestination ? `${routeOrigin} → ${routeDestination}` : routeOrigin;

  const nextPeriod = () => { setPeriodIdx(i => (i+1)%PERIOD_LIST.length);  popChip("period"); };
  const nextTod    = () => { setTodIdx(i => (i+1)%TOD_LIST.length);         popChip("tod"); };
  const toggleMode = () => {
    setQuestionMode(m => m === "worsened" ? "improved" : "worsened");
    popChip("mode");
  };

  /* ── Slider ─────────────────────────────────────────────────── */
  const allRouteWeeks = useAllRouteWeeks(ttAllRows, selectedRoute, tod);

  /* refs that mirror data state so the animation effect can read them
     without adding them to deps (which would cancel timers). */
  const loadingRef = useRef(false);
  loadingRef.current = loading;
  const rowCountRef = useRef(0);
  rowCountRef.current = rowCount;
  const routeWeeksRef = useRef(0);
  routeWeeksRef.current = allRouteWeeks.length;

  useEffect(() => {
    if (allRouteWeeks.length === 0) return;
    // If user has manually set the slider, don't reset it
    if (sliderManuallySet) return;

    const maxI = allRouteWeeks.length - 1;
    const p = urlParamsRef.current;
    if (p.bl !== undefined && p.br !== undefined) {
      setSliderVals([
        Math.max(0, Math.min(p.bl, maxI)),
        Math.min(maxI, Math.max(p.br, 0)),
      ]);
      urlParamsRef.current = { ...p, bl: undefined, br: undefined };
      return;
    }

    // Equal-length baseline: same number of weeks as the recent period
    const lastDataDate = allRouteWeeks[maxI]?.weekStart ?? new Date();
    const cutoff = new Date(lastDataDate);
    if      (period === "1m")   cutoff.setDate(cutoff.getDate() - 30);
    else if (period === "1.5m") cutoff.setDate(cutoff.getDate() - 45);
    else if (period === "2m")   cutoff.setDate(cutoff.getDate() - 60);
    else if (period === "3m")   cutoff.setMonth(cutoff.getMonth() - 3);
    else if (period === "6m")   cutoff.setMonth(cutoff.getMonth() - 6);
    else                         cutoff.setFullYear(cutoff.getFullYear() - 1);

    const recentStartIdx = allRouteWeeks.findIndex(w => w.weekStart >= cutoff);
    if (recentStartIdx > 0) {
      const recentCount = allRouteWeeks.length - recentStartIdx;
      const rightIdx = recentStartIdx - 1;
      const leftIdx = Math.max(0, rightIdx - recentCount + 1);
      setSliderVals([leftIdx, rightIdx]);
    } else {
      // Fallback: first half of data
      setSliderVals([0, Math.max(0, Math.floor(maxI * 0.5))]);
    }
  }, [tod, allRouteWeeks.length, sliderManuallySet, period]);

  // Time Travel: save pre-TT state on activate, restore on cancel.
  // Uses stateSnapshotRef for closure-safe capture and ttStateHelpers
  // for validated restore logic.
  const preTtStateRef = useRef<DashboardSnapshot | null>(null);

  useEffect(() => {
    if (tt.isActive && !preTtStateRef.current) {
      // Save current state — use live route/weeks (allRows), not TT-filtered
      // to capture the user's pre-TT context accurately.
      const liveMaxIdx = Math.max(1, liveAllRouteWeeks.length - 1);
      const liveSafeLeft = Math.max(0, Math.min(sliderVals[0], liveMaxIdx));
      const liveSafeRight = Math.max(liveSafeLeft, Math.min(sliderVals[1], liveMaxIdx));
      const lKey = liveAllRouteWeeks[liveSafeLeft]?.weekKey ?? null;
      const rKey = liveAllRouteWeeks[liveSafeRight]?.weekKey ?? null;
      preTtStateRef.current = {
        sliderWeekKeys: lKey && rKey ? [lKey, rKey] : null,
        periodIdx: periodIdx,
        todIdx: todIdx,
        questionMode,
        chartView,
        chartGranularity,
        routeName: liveSelectedRoute,
      };
      setSliderManuallySet(false); // allow auto-setting for TT defaults
    } else if (!tt.isActive && preTtStateRef.current) {
      const saved = preTtStateRef.current;
      if (!validateSnapshot(saved)) {
        // Corrupted snapshot — bail out cleanly
        preTtStateRef.current = null;
        return;
      }

      // Restore filter/chart state
      setPeriodIdx(saved.periodIdx);
      setTodIdx(saved.todIdx);
      setQuestionMode(saved.questionMode);
      setChartView(saved.chartView);
      setChartGranularity(saved.chartGranularity);

      // Restore route — validate it still exists in Live data
      const liveRouteLabels = Array.from(new Set(allRows.map(r => r.label_short))).sort();
      const restoredRouteIdx = resolveRouteIndex(saved.routeName, liveRouteLabels);
      if (restoredRouteIdx >= 0) {
        setRouteIdx(restoredRouteIdx);
      }
      // If route not found, keep current routeIdx — modulo handles bounds

      // Restore slider — compute weeks for the saved route/tod directly.
      // React state updates (setTodIdx, setRouteIdx) haven't taken effect yet,
      // so allRouteWeeks still reflects the TT-mode route/tod.
      const savedTod = TOD_LIST[saved.todIdx].value;
      const savedRouteRows = allRows.filter(
        r => r.label_short === saved.routeName && matchesToD(r.hour, r.dayOfWeek, savedTod)
      );
      const savedWeeks = aggregateRows(savedRouteRows);
      const sliderResult = resolveSliderFromWeekKeys(saved.sliderWeekKeys, savedWeeks);
      if (sliderResult) {
        setSliderVals(sliderResult);
        setSliderManuallySet(true); // prevent auto-set from overwriting restored state
      } else {
        setSliderManuallySet(false); // weekKeys missing — let auto-set handle it
      }

      preTtStateRef.current = null;
    }
  }, [tt.isActive]); // eslint-disable-line react-hooks/exhaustive-deps

  // When TT is active and allRouteWeeks are ready, set TT default comparison windows
  useEffect(() => {
    if (!tt.isActive || !tt.simulatedNow || allRouteWeeks.length === 0 || sliderManuallySet) return;

    const simMs = tt.simulatedNow.getTime();
    const recentStart = simMs - 45 * 86400000; // D - 45 days
    const baselineStart = simMs - 120 * 86400000; // D - 4 months
    const baselineEnd = simMs - 75 * 86400000; // D - 2.5 months

    // Find week indices
    let blIdx = allRouteWeeks.findIndex(w => w.weekStart.getTime() >= baselineStart);
    if (blIdx < 0) blIdx = 0;
    let brIdx = -1;
    for (let i = allRouteWeeks.length - 1; i >= 0; i--) {
      if (allRouteWeeks[i].weekStart.getTime() <= baselineEnd) { brIdx = i; break; }
    }
    if (brIdx < 0) brIdx = Math.min(blIdx + 4, allRouteWeeks.length - 1);

    // Set period to 1.5m
    const pIdx = PERIOD_LIST.findIndex(p => p.value === "1.5m");
    if (pIdx >= 0) setPeriodIdx(pIdx);

    setSliderVals([Math.min(blIdx, brIdx), Math.max(blIdx, brIdx)]);
  }, [tt.isActive, tt.simulatedNow, allRouteWeeks.length]);

  const maxIdx    = Math.max(1, allRouteWeeks.length - 1);
  const safeLeft  = Math.max(0, Math.min(sliderVals[0], maxIdx));
  const safeRight = Math.max(safeLeft, Math.min(sliderVals[1], maxIdx));
  const leftPct   = (safeLeft / maxIdx) * 100;
  const rightPct  = (safeRight / maxIdx) * 100;
  const THUMB_W = 22;
  const adjPct = (idx: number) =>
    trackW > 0
      ? ((idx / maxIdx) * (trackW - THUMB_W) + THUMB_W / 2) / trackW * 100
      : (idx / maxIdx) * 100;
  const leftTrackPct  = adjPct(safeLeft);
  const rightTrackPct = adjPct(safeRight);

  const baselineWeeks = useMemo(
    () => allRouteWeeks.slice(safeLeft, safeRight + 1),
    [allRouteWeeks, safeLeft, safeRight],
  );

  const handleShare = useCallback(() => {
    const p = new URLSearchParams({
      city:   selectedCity,
      route:  selectedRoute,
      tod,
      period,
      mode:   questionMode,
      theme:  themeKey,
      bl:     String(safeLeft),
      br:     String(safeRight),
      zoom:   String(ZOOM_STEPS[zoomIdx]),
      aggregation: chartGranularity,
      metric: chartView,
    });
    if (tt.isActive && tt.simulatedNow) {
      p.set("tt", tt.simulatedNow.toISOString());
    }
    const url = `${window.location.origin}${window.location.pathname}?${p.toString()}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2000);
    });
  }, [selectedCity, selectedRoute, tod, period, questionMode, themeKey, safeLeft, safeRight, zoomIdx, chartGranularity, chartView, tt.isActive, tt.simulatedNow]);

  const lastDataMs = useMemo(
    () => ttAllRows.reduce((max, r) => Math.max(max, r.timestamp.getTime()), 0),
    [ttAllRows],
  );
  const periodCutoffDate = useMemo(() => {
    const d = new Date(lastDataMs || Date.now());
    if      (period === "1m")   d.setDate(d.getDate() - 30);
    else if (period === "1.5m") d.setDate(d.getDate() - 45);
    else if (period === "2m")   d.setDate(d.getDate() - 60);
    else if (period === "3m")   d.setMonth(d.getMonth() - 3);
    else if (period === "6m")   d.setMonth(d.getMonth() - 6);
    else                         d.setFullYear(d.getFullYear() - 1);
    return d;
  }, [lastDataMs, period]);

  const recentWindowStartIdx = useMemo(
    () => {
      const idx = allRouteWeeks.findIndex(w => w.weekStart >= periodCutoffDate);
      return idx >= 0 ? idx : allRouteWeeks.length;
    },
    [allRouteWeeks, periodCutoffDate],
  );

  const recentWeeks = useMemo(
    () => allRouteWeeks.filter((w, i) => i > safeRight && w.weekStart >= periodCutoffDate),
    [allRouteWeeks, safeRight, periodCutoffDate],
  );

  const baselineSpeed    = weeklyAvg(baselineWeeks as any, "avgSpeed");
  const recentSpeed      = weeklyAvg(recentWeeks   as any, "avgSpeed");
  const baselineDuration = weeklyAvg(baselineWeeks as any, "avgDuration");
  const recentDuration   = weeklyAvg(recentWeeks   as any, "avgDuration");
  const speedDiff  = recentSpeed - baselineSpeed;
  const speedPct   = baselineSpeed > 0 ? Math.round((speedDiff / baselineSpeed) * 100) : 0;

  const baselineStartDate = allRouteWeeks[safeLeft]?.weekKey;
  const baselineEndDate   = allRouteWeeks[safeRight]?.weekKey;
  const recentStartDate   = recentWeeks[0]?.weekKey;
  const lastDate          = allRouteWeeks[allRouteWeeks.length - 1]?.weekKey;
  /** Actual last data point in the ToD-filtered dataset — may be later than
   *  the last week's weekKey (e.g. weekKey is Monday May 11 but last row is Friday May 15).
   *  Used for display only so the slider boundary matches what the user sees in the header. */
  const lastDataDate = allRouteWeeks[allRouteWeeks.length - 1]?.lastDate;

  /* ── Route browser pane state ─────────────────────────────────── */
  const allRouteCardsRef = useRef<RouteCardData[] | null>(null);
  const [allRouteCards, setAllRouteCards] = useState<RouteCardData[] | null>(null);

  // ── Enrich route cards with R³S² rank/score ───────────────────
  // Build a lookup from route label → R³S² rank/score for the active TOD
  const rrsLookup = useMemo(() => {
    const map = new Map<string, { rank: number; score: number }>();
    if (!rrsData.routeWindow.length) return map;
    for (const row of rrsData.routeWindow) {
      if (row.tod_bucket !== tod) continue;
      const label = row.route_label;
      if (!label) continue;
      // If multiple rows for same label (shouldn't happen), keep the better rank
      const existing = map.get(label);
      if (!existing || row.rrs_rank < existing.rank) {
        map.set(label, { rank: row.rrs_rank, score: row.rrs_rolling_score });
      }
    }
    return map;
  }, [rrsData.routeWindow, tod]);
  const prevBaselineKeyForPane = useRef("");

  useEffect(() => {
    if (ttAllRows.length === 0) return;
    const key = `${baselineStartDate}|${baselineEndDate}`;
    const weatherChanged = effectiveWeatherMap.size > 0;
    if (allRouteCardsRef.current && key === prevBaselineKeyForPane.current && !weatherChanged) return;
    const computed = computeAllRouteCards(ttAllRows, routeOptions, routes, effectiveWeatherMap);
    // Enrich with R³S² rank/score for the active TOD
    const enriched = computed.map(card => {
      const rrs = rrsLookup.get(card.label);
      return {
        ...card,
        rrsRank: rrs?.rank ?? null,
        rrsScore: rrs?.score ?? null,
      };
    });
    allRouteCardsRef.current = enriched;
    setAllRouteCards(enriched);
    prevBaselineKeyForPane.current = key;
  }, [ttAllRows, routeOptions, baselineStartDate, baselineEndDate, effectiveWeatherMap, rrsLookup]);

  /* ── Route cycling in pane order ───────────────────────────────── */
  // When R³S² data is available, cycle in rank order (rank 1 first).
  // Otherwise fall back to allRouteCards order or alphabetical.
  const routeOrder = useMemo(() => {
    if (allRouteCards && allRouteCards.length > 0) {
      const hasRrs = allRouteCards.some(c => c.rrsRank != null);
      if (hasRrs) {
        return [...allRouteCards]
          .sort((a, b) => {
            if (a.rrsRank == null && b.rrsRank == null) return 0;
            if (a.rrsRank == null) return 1;
            if (b.rrsRank == null) return -1;
            return a.rrsRank - b.rrsRank;
          })
          .map(c => c.label);
      }
      return allRouteCards.map(c => c.label);
    }
    return routeOptions;
  }, [allRouteCards, routeOptions]);

  const routeOrderIdx = useMemo(() => {
    const idx = routeOrder.indexOf(selectedRoute);
    return idx >= 0 ? idx : 0;
  }, [routeOrder, selectedRoute]);

  const nextRoute = useCallback(() => {
    const nextIdx = (routeOrderIdx + 1) % routeOrder.length;
    const nextLabel = routeOrder[nextIdx];
    const optIdx = routeOptions.indexOf(nextLabel);
    if (optIdx >= 0) setRouteIdx(optIdx);
    popChip("route");
  }, [routeOrder, routeOrderIdx, routeOptions]);

  const handleRouteSelectFromPane = useCallback((label: string) => {
    const idx = routeOptions.indexOf(label);
    if (idx >= 0) setRouteIdx(idx);
    // No scrollTo — preserve scroll position and slider state
  }, [routeOptions]);

  const gapCenterPct = (() => {
    if (!baselineStartDate || !baselineEndDate || !recentStartDate || !lastDate) return 50;
    const t0   = new Date(baselineStartDate).getTime();
    const span = new Date(lastDate).getTime() - t0 || 1;
    const bEndF   = (new Date(baselineEndDate).getTime()  - t0) / span;
    const rStartF = (new Date(recentStartDate).getTime() - t0) / span;
    return ((4 + ((bEndF + rStartF) / 2) * 492) / 500) * 100;
  })();

  const handleSliderChange = useCallback((vals: number[]) => {
    let [l, r] = vals as [number, number];
    const [prevL, prevR] = sliderValsRef.current;
    if (l !== prevL) setDragThumb(0);
    else if (r !== prevR) setDragThumb(1);
    const maxR = recentWindowStartIdx > 0 ? recentWindowStartIdx - 1 : maxIdx;
    if (r > maxR) {
      r = maxR;
      setOverlapWarning(true);
      clearTimeout(overlapTimer.current);
      overlapTimer.current = setTimeout(() => setOverlapWarning(false), 3000);
    }
    setSliderVals([l, r]);
    setSliderManuallySet(true); // Mark slider as manually set
    const win = r - l;
    if ((win <= 1 || win >= allRouteWeeks.length * 0.85) && !showSparkle) {
      setShowSparkle(true);
      clearTimeout(sparkleTimer.current);
      sparkleTimer.current = setTimeout(() => setShowSparkle(false), 1600);
    }
  }, [allRouteWeeks.length, showSparkle, recentWindowStartIdx, maxIdx]);

  const dailyStats = useDailyStats(ttAllRows, selectedRoute, tod);
  const calendarDailyStats = useDailyStats(allRows, selectedRoute, tod);
  const benchmarkRoutes = useBenchmarkRoutes(allRows);
  const benchmarkDailyStats = useBenchmarkDailyStats(allRows, benchmarkRoutes, tod);
  const benchmarkRouteLabel = benchmarkRoutes[0] ?? "the longest route";

  // ── R³S² data loading and context ─────────────────────────────
  const selectedRouteCode = selectedRouteInfo?.route_code ?? "";
  const rrsData = useRrsData();
  const rrsCtx = useRrsContext(rrsData.routeWindow, rrsData.routeDay, selectedRouteCode, tod, benchmarkRouteLabel);
  const bandThresholds = useEmpiricalBandThresholds(allRows, benchmarkRoutes);
  const { merged, dailyData, selectedStats } = useFilteredData(ttAllRows, selectedRoute, period, tod);

  // Keep chart x-axes consistent across the two Recharts charts.
  // Recharts' default tick auto-skipping can pick different ticks depending on
  // subtle layout differences (e.g. Y-axis label width), which is most visible
  // for longer windows like 3m/6m.
  //
  // We solve it by explicitly providing the same `ticks` list to both charts.
  const chartMargin = { top: 4, right: 32, left: 8, bottom: 0 } as const;

  // Keep the plot-area width aligned between charts.
  // Recharts auto-sizes the YAxis width based on label length; when it differs,
  // the same X ticks can look horizontally shifted between charts.
  const yAxisWidth = isMobile ? 46 : 58;

  /* ── TrafficNOW! per-week percentile bands ───────────────────── */
  const { trafficNowData, trafficNowCompare } = useMemo(() => {
    const routeRows    = ttAllRows.filter(r => r.label_short === selectedRoute);
    const recentData   = buildBands(recentWeeks.length > 0 ? recentWeeks : allRouteWeeks.slice(-12), routeRows, tod);
    const baselineData = buildBands(baselineWeeks.length > 0 ? baselineWeeks : [], routeRows, tod);
    return { trafficNowData: recentData, trafficNowCompare: baselineData };
  }, [ttAllRows, selectedRoute, recentWeeks, baselineWeeks, allRouteWeeks, tod]);

  // Map app theme to UncertaintyBandChart ViewingMode
  const tnMode: ViewingMode = themeKey === "gray" ? "grayscale" : "default";
  const [tnOpen, setTnOpen] = useState(false);
  const [verdictOpen, setVerdictOpen] = useState(true);
  const [chartOpen, setChartOpen] = useState(true);
  const [calendarCardOpen, setCalendarCardOpen] = useState(true);
  const [baselineOpen, setBaselineOpen] = useState(true);

  // Calendar month state (lifted from CalendarWidget)
  const calAllDates = useMemo(() => Array.from(calendarDailyStats.keys()).sort(), [calendarDailyStats]);
  const calLastStr  = calAllDates[calAllDates.length - 1] ?? "";
  const calFirstStr = calAllDates[0] ?? "";

  const [widgetCalYear, setWidgetCalYear] = useState(() => new Date().getFullYear());
  const [widgetCalMonth, setWidgetCalMonth] = useState(() => new Date().getMonth());

  const widgetCalPrefixStr  = `${widgetCalYear}-${String(widgetCalMonth + 1).padStart(2, "0")}`;
  const widgetCalMinMonthStr = calFirstStr ? calFirstStr.slice(0, 7) : widgetCalPrefixStr;
  const { y: wCalLy, m: wCalLm } = calLastStr ? parseYM(calLastStr) : { y: widgetCalYear, m: widgetCalMonth };
  const widgetCalMaxMonthStr = `${wCalLy}-${String(wCalLm + 1).padStart(2, "0")}`;
  const widgetCalCanBack = widgetCalPrefixStr > widgetCalMinMonthStr;
  const widgetCalCanFwd  = widgetCalPrefixStr < widgetCalMaxMonthStr;
  const widgetCalMonthLabel = new Date(widgetCalYear, widgetCalMonth, 1).toLocaleDateString("en-IN", { month:"long", year:"numeric" });

  const widgetCalPrevMo = () => {
    if (widgetCalMonth === 0) { setWidgetCalYear(y => y - 1); setWidgetCalMonth(11); }
    else setWidgetCalMonth(m => m - 1);
  };
  const widgetCalNextMo = () => {
    if (widgetCalMonth === 11) { setWidgetCalYear(y => y + 1); setWidgetCalMonth(0); }
    else setWidgetCalMonth(m => m + 1);
  };

  const widgetCalNavBtn = (label: string, active: boolean, onClick: () => void) => (
    <button onClick={onClick} disabled={!active}
      style={{ background:"none", border:`1px solid ${thm.cardBorder}`,
        borderRadius:8, padding:"3px 11px", fontSize:18, lineHeight:1,
        cursor: active ? "pointer" : "default", opacity: active ? 1 : 0.3,
        color: thm.textPrimary }}>
      {label}
    </button>
  );

  // Unified chart data array based on granularity
  const chartDataKey = chartGranularity === 'daily' ? 'dateKey' : 'weekKey';
  const chartDataArr = chartGranularity === 'daily' ? dailyData : merged;

  const xAxisTicks = useMemo(() => {
    const n = chartDataArr.length;
    if (n === 0) return [] as string[];

    const maxLabels = isMobile ? 5 : 7;
    const step = Math.max(1, Math.ceil((n - 1) / (maxLabels - 1)));

    const ticks: string[] = [];
    const keyProp = chartGranularity === 'daily' ? 'dateKey' : 'weekKey';
    for (let i = 0; i < n; i += step) ticks.push((chartDataArr[i] as any)[keyProp]);

    // Ensure last data point is shown, but avoid crowding:
    // if the last tick is too close (< step/2), replace it instead of appending.
    const last = (chartDataArr[n - 1] as any)[keyProp];
    if (ticks[ticks.length - 1] !== last) {
      const lastTickIdx = chartDataArr.findIndex((d: any) => d[keyProp] === ticks[ticks.length - 1]);
      if (n - 1 - lastTickIdx < step * 0.6) {
        ticks[ticks.length - 1] = last; // replace — too close
      } else {
        ticks.push(last); // append — enough room
      }
    }

    return ticks;
  }, [chartDataArr, chartGranularity, isMobile]);

  /* ── Baseline reference stats for chart ─────────────────────── */
  const baselineChartStats = useMemo(
    () => computeBaselineStats(baselineWeeks),
    [baselineWeeks],
  );

  const speedDomain: ChartDomain = useMemo(() => {
    const vals = (chartDataArr as any[]).flatMap((d: any) => [d.avgSpeed, d.p05Speed, d.p95Speed]).filter((v: number) => v > 0);
    if (!vals.length) return { min: 0, max: 1 };
    const pad = (Math.max(...vals) - Math.min(...vals)) * 0.08 || 1;
    return { min: Math.round(Math.max(0, Math.min(...vals) - pad) * 10) / 10, max: Math.round((Math.max(...vals) + pad) * 10) / 10 };
  }, [chartDataArr]);

  const durationDomain: ChartDomain = useMemo(() => {
    const vals = (chartDataArr as any[]).flatMap((d: any) => [d.avgDuration, d.p05Duration, d.p95Duration]).filter((v: number) => v > 0);
    if (!vals.length) return { min: 0, max: 1 };
    const pad = (Math.max(...vals) - Math.min(...vals)) * 0.08 || 1;
    return { min: Math.round(Math.max(0, Math.min(...vals) - pad) * 10) / 10, max: Math.round((Math.max(...vals) + pad) * 10) / 10 };
  }, [chartDataArr]);

  /* ── Data trend ─────────────────────────────────────────────── */
  const VERDICT_THRESHOLD =
    cfg.percentile.verdict_threshold_kmh;
  /* "1 in N" from the worst-case percentile (e.g. p95 → 1-in-20) */
  const badDayN = Math.round(100 / (100 - cfg.percentile.worst_case));


  type DataTrend = "improved" | "worsened" | "stable" | "insufficient";
  const dataTrend: DataTrend =
    recentSpeed > 0 && baselineSpeed > 0 && recentWeeks.length >= 1
      ? speedDiff >  VERDICT_THRESHOLD ? "improved"
      : speedDiff < -VERDICT_THRESHOLD ? "worsened"
      : "stable"
      : "insufficient";

  type VerdictKey =
    | "confirmed_good" | "confirmed_bad"
    | "contradicted_better" | "contradicted_worse"
    | "no_change" | "insufficient";

  const verdictKey: VerdictKey =
    dataTrend === "insufficient" ? "insufficient"
    : dataTrend === "stable"     ? "no_change"
    : questionMode === "improved"
      ? dataTrend === "improved" ? "confirmed_good"      : "contradicted_worse"
      : dataTrend === "worsened" ? "confirmed_bad"       : "contradicted_better";

  const VERDICT: Record<VerdictKey, {face:string; msg:string; border:string; bg:string; tc:string}> = {
    confirmed_good:      { face:"🤩", msg:"Yes! It's gotten better — speed is up. 🎉",          border:"#86EFAC", bg:"#F0FDF4", tc:"#166534" },
    confirmed_bad:       { face:"🥵", msg:"Yep, it's gotten worse — traffic is heavier.",         border:"#FCA5A5", bg:"#FFF1F2", tc:"#991B1B" },
    contradicted_better: { face:"🤩", msg:"Actually, things have improved! Roads are faster.",    border:"#86EFAC", bg:"#F0FDF4", tc:"#166534" },
    contradicted_worse:  { face:"🥵", msg:"Actually, things have gotten worse — traffic is heavier.", border:"#FCA5A5", bg:"#FFF1F2", tc:"#991B1B" },
    no_change:           { face:"😐", msg:"Not really — no meaningful change either way.",         border:"#FDE68A", bg:"#FFFBEB", tc:"#92400E" },
    insufficient:        { face:"🔍", msg:"Need more data — widen the baseline window.",           border:"#C4B5FD", bg:"#F5F3FF", tc:"#5B21B6" },
  };
  const v      = VERDICT[verdictKey];
  const colors = thm.chart;

  const routeMapLink = selectedRouteInfo?.map_link;
  const verdictSubtext: React.ReactNode | undefined = verdictKey !== "insufficient" && baselineStartDate
    ? <>
        {`Comparing baseline (${fmtShortDate(baselineStartDate)}–${fmtShortDate(baselineEndDate)}) to recent (${fmtShortDate(recentStartDate)}–${lastDataDate ? fmtShortDate(lastDataDate.toISOString()) : fmtShortDate(lastDate)}) · `}
        {routeMapLink
          ? <a href={routeMapLink} target="_blank" rel="noopener noreferrer"
              style={{ color: "inherit", textDecorationLine: "underline", textDecorationStyle: "dotted", textUnderlineOffset: "2px" }}>
              {routeEndpoints}
            </a>
          : routeEndpoints
        }
        {` · ${todLabel}`}
      </>
    : undefined;

  /* ── Shared KPI card/label/value styles ─────────────────────── */
  const kpiLabel: React.CSSProperties = {
    fontSize:11, fontWeight:600,
    color: thm.textSecondary,
    display:"flex", alignItems:"center",
  };
  const kpiValue: React.CSSProperties = {
    fontFamily:"var(--app-font-display)", fontWeight:800,
    fontSize:26, lineHeight:1.1, color: thm.textPrimary,
  };
  const kpiSub: React.CSSProperties = {
    fontSize:11, color: thm.textSecondary,
  };
  const kpiCardBase: React.CSSProperties = {
    position: "relative",
    zIndex: 1,
    border: thm.cardBorder,
    boxShadow: thm.cardShadow,
    borderRadius:18,
    padding:"16px 18px",
    display:"flex", flexDirection:"column", gap:4,
  };

  /* ── Theme toggle button style ──────────────────────────────── */
  const nextMeta = THEME_META[nextThemeKey];
  const curMeta  = THEME_META[themeKey];
  const ttBg = themeKey === "colour"
    ? {
      gradients: [
        "radial-gradient(ellipse at 14% 10%, rgba(168,85,247,0.12), transparent 52%)",
        "radial-gradient(ellipse at 90% 12%, rgba(34,211,238,0.08), transparent 48%)",
      ],
    }
    : themeKey === "pastel"
      ? {
        gradients: [
          "radial-gradient(ellipse at 0% 0%, rgba(245,158,11,0.28), transparent 46%)",
          "radial-gradient(ellipse at 100% 0%, rgba(251,113,133,0.20), transparent 44%)",
          "radial-gradient(ellipse at 50% 100%, rgba(52,211,153,0.16), transparent 52%)",
        ],
      }
      : {
        gradients: [
          "radial-gradient(ellipse at 0% 0%, rgba(40,40,40,0.38), transparent 50%)",
          "radial-gradient(ellipse at 100% 0%, rgba(200,200,200,0.30), transparent 48%)",
          "radial-gradient(ellipse at 50% 100%, rgba(90,90,90,0.22), transparent 55%)",
        ],
      };

  /* ── Render ─────────────────────────────────────────────────── */
  return (
    <div className={thm.isDark ? "dark" : ""}>
      <div aria-live="polite" aria-atomic="true" ref={liveRef} className="sr-only" />
      <div className="transition-colors" style={{ position: "relative", zIndex: 1, background: thm.bodyBg, display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>

        {/* ── Skip link ─────────────────────────────────────── */}
        <a href="#main-content" className="sr-only focusable">
          Skip to main content
        </a>


        {/* ── Header ──────────────────────────────────────────── */}
        <header style={{
          background: thm.headerBg,
          backdropFilter: "blur(12px)",
          borderBottom: `1px solid ${thm.key==="gray"?"#e0e0e0":"hsl(var(--border))"}`,
          position:"sticky", top:0, zIndex:500,
          flexShrink: 0,
        }}>
          <div style={{ margin:"0 auto", padding:"0.75rem 1rem",
            display:"flex", alignItems:"center", justifyContent:"space-between", gap:12 }}>
            {/* Left: Logo + City name */}
            <a href="/" style={{ display:"flex", alignItems:"center", gap:10, flexShrink:0, textDecoration:"none" }}>
              <div style={{ position: "relative", display: "inline-block" }}>
                <img
                  src="/trafficoracle-light.png"
                  alt="traffiCOracle"
                  width={120}
                  height={32}
                  style={{ height:32, width:"auto", flexShrink:0, display:"block" }}
                />
                <svg
                  height={20}
                  viewBox="0 0 120 14"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  style={{ position: "absolute", bottom: -13, right: -8, overflow: "visible" }}
                >
                  <text
                    x={50}
                    y={12}
                    textAnchor="start"
                    fill={thm.textMuted}
                    fontSize={10}
                    fontFamily="var(--app-font-display), Inter, system-ui, sans-serif"
                    fontWeight={900}
                    letterSpacing="0.12em"
                  >
                    {selectedCity.toUpperCase()}
                  </text>
                </svg>
              </div>
            </a>

            {/* Right: Cities + Routes + Time Travel + Share + Zoom + Theme */}
            <div style={{ display:"flex", alignItems:"center", gap:8, flexShrink:0, position:"relative" }}>
              {/* City pill */}
              <LocationDropdown thm={thm} selectedCity={selectedCity} onCityChange={setSelectedCity} cities={CITIES} />

              {/* Route Observer pill */}
              {citySource ? (
                <div ref={routeDropdownRef} style={{ position: "relative" }}>
                  <button
                    onClick={() => setRouteDropdownOpen(o => !o)}
                    aria-expanded={routeDropdownOpen}
                    style={{
                      height: 44,
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      padding: "0 12px",
                      borderRadius: 9999,
                      cursor: "pointer",
                      fontSize: 13,
                      fontWeight: 600,
                      fontFamily: "var(--app-font-display)",
                      border: `1px solid ${thm.key==="gray"?"#e0e0e0":"hsl(var(--border))"}`,
                      background: thm.key==="colour" ? "#141A24" : thm.key==="gray" ? "#f5f5f5" : "#ffefe6",
                      color: thm.textSecondary,
                    }}
                  >
                    <span>Route Observer</span>
                    <span style={{
                      marginLeft: 2,
                      fontSize: 10,
                      transform: routeDropdownOpen ? "rotate(180deg)" : "rotate(0deg)",
                      transition: "transform 0.2s",
                    }}>▼</span>
                  </button>

                  {routeDropdownOpen && (
                    <div style={{
                      position: "absolute",
                      top: "calc(100% + 4px)",
                      left: 0,
                      minWidth: 180,
                      maxHeight: 320,
                      overflow: "auto",
                      background: thm.sectionBg,
                      border: `1px solid ${thm.key === "gray" ? "#e0e0e0" : "hsl(var(--border))"}`,
                      borderRadius: 8,
                      boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                      padding: "4px 0",
                      zIndex: 1000,
                    }}>
                      {routes.map((route) => (
                        <a
                          key={route.route_code}
                          href={route.map_link || undefined}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => { setRouteDropdownOpen(false); }}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            width: "100%",
                            padding: "8px 12px",
                            minHeight: 36,
                            border: "none",
                            background: "transparent",
                            cursor: route.map_link ? "pointer" : "default",
                            fontSize: 12,
                            fontWeight: route.label_short === selectedRoute ? 700 : 400,
                            color: thm.textPrimary,
                            textAlign: "left",
                            textDecoration: "none",
                            opacity: route.map_link ? 1 : 0.55,
                          }}
                        >
                          <span style={{ fontSize: 10 }}>
                            {route.map_link ? "○" : "◌"}
                          </span>
                          <span>{route.label_short}</span>
                          {route.map_link && (
                            <span style={{ marginLeft: "auto", fontSize: 10, color: thm.textMuted }}>↗</span>
                          )}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <button
                  disabled
                  style={{
                    height: 44,
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "0 12px",
                    borderRadius: 9999,
                    cursor: "default",
                    fontSize: 13,
                    fontWeight: 600,
                    fontFamily: "var(--app-font-display)",
                    border: `1px solid ${thm.key==="gray"?"#e0e0e0":"hsl(var(--border))"}`,
                    background: thm.key==="colour" ? "#141A24" : thm.key==="gray" ? "#f5f5f5" : "#ffefe6",
                    color: thm.textSecondary,
                    opacity: 0.45,
                  }}
                >
                  <span>Route Observer</span>
                  <span style={{ marginLeft: 2, fontSize: 10, color: thm.textMuted }}>◌</span>
                </button>
              )}

              {/* Time Travel pill — blazing when active */}
              <button
                ref={ttButtonRef}
                onClick={() => {
                  if (tt.isActive) {
                    tt.deactivate();
                  } else {
                    setTtPopoverOpen(o => !o);
                  }
                }}
                className={tt.isActive ? "tt-pill-blaze" : undefined}
                style={{
                  position: "relative",
                  overflow: "hidden",
                  display:"flex", alignItems:"center", justifyContent:"center", gap:5,
                  border:`${tt.isActive ? 2 : 1}px solid ${tt.isActive
                    ? ttBorderActiveMap[themeKey] ?? ttBorderActiveMap.colour
                    : thm.key==="gray"?"#e0e0e0":"hsl(var(--border))"}`,
                  borderRadius:9999, height:44, padding:"0 16px",
                  color: tt.isActive
                    ? (ttTextActiveMap[themeKey] ?? ttTextActiveMap.colour)
                    : thm.textSecondary,
                  background: tt.isActive
                    ? (ttBgActiveMap[themeKey] ?? ttBgActiveMap.colour)
                    : themeKey==="colour" ? "#141A24" : themeKey==="gray" ? "#f5f5f5" : "#ffefe6",
                  boxShadow: tt.isActive ? (ttGlowMap[themeKey] ?? ttGlowMap.colour) : "none",
                  cursor:"pointer",
                  transition:"color 0.2s, background 0.2s, box-shadow 0.4s, border-color 0.2s",
                  animation: tt.isActive ? "tt-glow-pulse 3s ease-in-out infinite" : "none",
                }}
                title={tt.isActive ? "Click to cancel Time Traveller" : "Open Time Traveller"}
              >
                {/* Shimmer sweep overlay */}
                {tt.isActive && (
                  <span className="tt-shimmer" style={{
                    position:"absolute", inset:0,
                    background:"linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.12) 50%, transparent 100%)",
                    backgroundSize:"200% 100%",
                    animation:"tt-ember-sweep 4s ease-in-out infinite",
                    pointerEvents:"none",
                    borderRadius:9999,
                  }} />
                )}
                <span style={{
                  fontFamily:"var(--app-font-display)", fontSize:13, fontWeight:600, lineHeight:1,
                  whiteSpace:"nowrap", position:"relative", zIndex:1,
                }}>
                  Time Traveller
                </span>
                {!tt.isActive && (
                  <span style={{
                    fontSize: 10,
                    transform: ttPopoverOpen ? "rotate(180deg)" : "rotate(0deg)",
                    transition: "transform 0.2s",
                    marginLeft: 2,
                  }}>▼</span>
                )}
              </button>

              {/* Time Travel calendar popover */}
              {ttPopoverOpen && !tt.isActive && createPortal(
                <div ref={popoverRef} style={{
                  position:"fixed",
                  top: (ttButtonRef.current?.getBoundingClientRect().bottom ?? 60) + 6,
                  right: Math.max(8, window.innerWidth - (ttButtonRef.current?.getBoundingClientRect().right ?? window.innerWidth) + 20),
                  zIndex: 9999,
                  background: thm.key==="colour" ? "#1A2030" : thm.key==="pastel" ? "#FFF8F0" : "#fff",
                  border:`1px solid ${thm.key==="gray"?"#ccc":thm.key==="pastel"?"#DCCFB8":"hsl(var(--border))"}`,
                  borderRadius:12,
                  boxShadow: thm.key==="colour"
                    ? "0 8px 32px rgba(0,0,0,0.5)"
                    : "0 8px 24px rgba(0,0,0,0.12)",
                  padding:16,
                  minWidth:280,
                  animation:"fade-in 0.15s ease",
                }}>
                  {/* Month navigation */}
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
                    <button onClick={() => {
                      if (calMonth === 0) { setCalMonth(11); setCalYear(y => y-1); }
                      else setCalMonth(m => m-1);
                    }} style={{
                      background:"none", border:"none", cursor:"pointer", color:thm.textMuted,
                      fontSize:18, padding:"4px 8px", borderRadius:4,
                    }}>‹</button>
                    <span style={{
                      fontFamily:"var(--app-font-display)", fontWeight:700, fontSize:14,
                      color:thm.textPrimary,
                    }}>
                      {["January","February","March","April","May","June","July","August","September","October","November","December"][calMonth]} {calYear}
                    </span>
                    <button onClick={() => {
                      const nowM = new Date().getMonth();
                      const nowY = new Date().getFullYear();
                      if (calYear > nowY || (calYear === nowY && calMonth >= nowM)) return;
                      if (calMonth === 11) { setCalMonth(0); setCalYear(y => y+1); }
                      else setCalMonth(m => m+1);
                    }} style={{
                      background:"none", border:"none", cursor:"pointer", color:thm.textMuted,
                      fontSize:18, padding:"4px 8px", borderRadius:4,
                      opacity: (calYear > today.getFullYear() || (calYear === today.getFullYear() && calMonth >= today.getMonth())) ? 0.3 : 1,
                    }}>›</button>
                  </div>

                  {/* Weekday labels */}
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(7, 1fr)", gap:2, marginBottom:4 }}>
                    {["Mo","Tu","We","Th","Fr","Sa","Su"].map(d => (
                      <div key={d} style={{
                        textAlign:"center", fontSize:10, fontWeight:600,
                        color:thm.textMuted, padding:"4px 0",
                      }}>{d}</div>
                    ))}
                  </div>

                  {/* Calendar grid */}
                  {buildMonthGrid(calYear, calMonth).map((row, ri) => (
                    <div key={ri} style={{ display:"grid", gridTemplateColumns:"repeat(7, 1fr)", gap:2, marginBottom:2 }}>
                      {row.map((day, ci) => {
                        if (day === null) return <div key={ci} />;
                        const dateStr = `${calYear}-${String(calMonth+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
                        const isFuture = dateStr > todayStr;
                        const hasData = dataDays.has(dateStr);
                        const isToday = dateStr === todayStr;
                        const isSelected = selectedDate &&
                          selectedDate.getFullYear() === calYear &&
                          selectedDate.getMonth() === calMonth &&
                          selectedDate.getDate() === day;
                        const canClick = !isFuture && hasData;

                        const cellBg = isSelected
                          ? (themeKey==="colour" ? "rgba(139,92,246,0.3)" : themeKey==="pastel" ? "#FDE68A" : "#111")
                          : "transparent";
                        const cellColor = isSelected
                          ? (themeKey==="colour" ? "#E9D5FF" : themeKey==="pastel" ? "#92400E" : "#fff")
                          : isFuture
                            ? thm.textMuted
                            : hasData ? thm.textPrimary : thm.textMuted;

                        return (
                          <div
                            key={ci}
                            onClick={() => canClick && setSelectedDate(new Date(calYear, calMonth, day))}
                            style={{
                              textAlign:"center", fontSize:12, padding:"6px 0",
                              borderRadius:6,
                              background: cellBg,
                              color: cellColor,
                              cursor: canClick ? "pointer" : "default",
                              opacity: isFuture ? 0.3 : hasData ? 1 : 0.4,
                              border: isToday
                                ? `1px dashed ${themeKey==="colour"?"rgba(139,92,246,0.5)":themeKey==="pastel"?"#D4A574":"#999"}`
                                : !hasData && !isFuture ? "1px dashed rgba(128,128,128,0.3)" : "1px solid transparent",
                              transition:"background 0.15s, color 0.15s",
                            }}
                            onMouseEnter={e => {
                              if (canClick && !isSelected) (e.currentTarget as HTMLElement).style.background = thm.key==="colour" ? "rgba(139,92,246,0.1)" : thm.key==="pastel" ? "#FEF3C7" : "#f0f0f0";
                            }}
                            onMouseLeave={e => {
                              if (!isSelected) (e.currentTarget as HTMLElement).style.background = "transparent";
                            }}
                          >{day}</div>
                        );
                      })}
                    </div>
                  ))}

                  {/* Time picker */}
                  <div style={{
                    display:"flex", alignItems:"center", justifyContent:"space-between",
                    marginTop:12, paddingTop:12,
                    borderTop:`1px solid ${thm.key==="gray"?"#e0e0e0":thm.key==="pastel"?"#DCCFB8":"hsl(var(--border))"}`,
                  }}>
                    <span style={{ fontSize:11, fontWeight:600, color:thm.textSecondary }}>
                      Time
                    </span>
                    <input
                      type="time"
                      value={selectedTime}
                      onChange={e => setSelectedTime(e.target.value)}
                      style={{
                        background: thm.key==="colour" ? "#0F1218" : thm.key==="pastel" ? "#fff" : "#f5f5f5",
                        border:`1px solid ${thm.key==="gray"?"#ccc":thm.key==="pastel"?"#DCCFB8":"hsl(var(--border))"}`,
                        borderRadius:6, padding:"4px 8px",
                        fontSize:13, fontWeight:600,
                        color: thm.textPrimary,
                        fontFamily:"var(--app-font-display)",
                      }}
                    />
                  </div>

                  {/* Activate button */}
                  <button
                    onClick={() => {
                      if (!selectedDate) return;
                      const [hh, mm] = selectedTime.split(":").map(Number);
                      const dt = new Date(selectedDate);
                      dt.setHours(hh, mm, 0, 0);
                      tt.activate(dt);
                      setTtPopoverOpen(false);
                    }}
                    disabled={!selectedDate}
                    style={{
                      width:"100%", marginTop:10, padding:"8px 0",
                      borderRadius:8, border:"none",
                      background: selectedDate
                        ? (themeKey==="colour" ? "linear-gradient(135deg, rgba(139,92,246,0.3), rgba(99,102,241,0.2))" : themeKey==="pastel" ? "#FDE68A" : "#111")
                        : (thm.key==="colour" ? "#2A3545" : "#e0e0e0"),
                      color: selectedDate
                        ? (themeKey==="colour" ? "#E9D5FF" : themeKey==="pastel" ? "#92400E" : "#fff")
                        : thm.textMuted,
                      fontFamily:"var(--app-font-display)", fontSize:12, fontWeight:700,
                      cursor: selectedDate ? "pointer" : "default",
                      transition:"background 0.2s, color 0.2s",
                    }}
                  >
                    {selectedDate ? `Travel to ${selectedDate.getDate()} ${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][selectedDate.getMonth()]} at ${selectedTime}` : "Select a date above"}
                  </button>
                </div>,
                document.body
              )}

              {/* Share pill */}
              {!loading && effectiveRowCount > 0 && (
                <button onClick={handleShare} style={{
                  display:"flex", alignItems:"center", justifyContent:"center", gap:5,
                  border:`1px solid ${thm.key==="gray"?"#e0e0e0":"hsl(var(--border))"}`,
                  borderRadius:9999, height:44, padding:"0 14px",
                  color: copied ? thm.speedGood : thm.textSecondary,
                  background: copied ? "rgba(111,174,99,0.1)" : thm.key==="colour" ? "#141A24" : thm.key==="gray" ? "#f5f5f5" : "#ffefe6",
                  cursor:"pointer", transition:"color 0.2s, background 0.2s",
                }} title="Copy shareable link">
                  <span style={{ fontFamily:"var(--app-font-display)", fontSize:13, fontWeight:600, lineHeight:1 }}>
                    {copied ? "Copied!" : "Share"}
                  </span>
                </button>
              )}

              {/* Zoom +/- */}
              <div style={{
                display:"flex", alignItems:"center",
                border:`1px solid ${thm.key==="gray"?"#e0e0e0":"hsl(var(--border))"}`,
                borderRadius:9999, height:44, overflow:"hidden",
                background: thm.key==="colour" ? "#141A24" : thm.key==="gray" ? "#f5f5f5" : "#ffefe6",
              }}>
                <button onClick={zoomOut} disabled={zoomIdx === 0}
                  title="Decrease size"
                  style={{
                    display:"flex", alignItems:"center", justifyContent:"center",
                    width:44, height:44, border:"none", background:"transparent",
                    color: thm.textMuted, cursor: zoomIdx === 0 ? "default" : "pointer",
                    opacity: zoomIdx === 0 ? 0.3 : 1,
                  }}>
                  <span style={{ fontFamily:"var(--app-font-display)", fontSize:13, fontWeight:600, color: thm.textMuted }}>−</span>
                </button>
                <span style={{
                  fontFamily:"var(--app-font-display)", fontSize:13, fontWeight:600,
                  color: thm.textSecondary, lineHeight:1, minWidth:32, textAlign:"center",
                  userSelect:"none",
                }}>
                  {Math.round(ZOOM_STEPS[zoomIdx] * 100)}%
                </span>
                <button onClick={zoomIn} disabled={zoomIdx === ZOOM_STEPS.length - 1}
                  title="Increase size"
                  style={{
                    display:"flex", alignItems:"center", justifyContent:"center",
                    width:44, height:44, border:"none", background:"transparent",
                    color: thm.textMuted, cursor: zoomIdx === ZOOM_STEPS.length - 1 ? "default" : "pointer",
                    opacity: zoomIdx === ZOOM_STEPS.length - 1 ? 0.3 : 1,
                  }}>
                  <span style={{ fontFamily:"var(--app-font-display)", fontSize:13, fontWeight:600, color: thm.textMuted }}>+</span>
                </button>
              </div>

              {/* Theme pill */}
              <button
                onClick={cycleTheme}
                title={`Switch to ${nextMeta.label}`}
                style={{
                  display:"flex", alignItems:"center", justifyContent:"center", gap:6,
                  height:44, borderRadius:9999, padding:"0 12px",
                  minWidth: 160,
                  border:`1px solid ${thm.key==="gray"?"#e0e0e0":"hsl(var(--border))"}`,
                  background: thm.key==="colour" ? "#141A24" : thm.key==="gray" ? "#f5f5f5" : "#ffefe6",
                  cursor:"pointer",
                  transition:"background 0.2s",
                }}
                aria-label="Cycle theme"
              >
                <span style={{ fontSize:14 }}>{curMeta.icon}</span>
                <span style={{ fontFamily:"var(--app-font-display)", fontSize:13, fontWeight:600,
                  color: thm.textSecondary, lineHeight:1, whiteSpace:"nowrap" }}>
                  {curMeta.label}
                </span>
              </button>
            </div>
          </div>
        </header>

        {/* ── TT sticky banner ──────────────────────────────────── */}
        {tt.isActive && tt.simulatedNow && (
          <div style={{
            position:"sticky", top: 0, zIndex: 499,
            background: themeKey === "colour"
              ? "linear-gradient(135deg, #1E1533, #1A1030)"
              : themeKey === "pastel"
                ? "linear-gradient(135deg, #FDF6E3, #FEF3C7)"
                : "linear-gradient(135deg, #E8E8E8, #D8D8D8)",
            borderBottom: `1px solid ${themeKey === "colour" ? "rgba(139,92,246,0.3)" : themeKey === "pastel" ? "#D4A574" : "#bbb" }`,
            padding: "8px 1.5rem",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            flexWrap: "wrap", gap: 8,
            animation: "fade-in 0.4s ease",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 16 }}>⏳</span>
              <span style={{
                fontFamily: "var(--app-font-display)", fontWeight: 700, fontSize: 13,
                color: themeKey === "colour" ? "#E9D5FF" : themeKey === "pastel" ? "#78350F" : "#333",
              }}>
                Time Travel active — {selectedCity} as of {ttFormat(tt.simulatedNow)}
              </span>
              <span style={{
                fontSize: 11,
                color: themeKey === "colour" ? "rgba(233,213,255,0.5)" : themeKey === "pastel" ? "rgba(120,53,15,0.5)" : "rgba(0,0,0,0.4)",
              }}>
                Showing historical traffic playback
              </span>
            </div>
            <button
              onClick={() => tt.deactivate()}
              style={{
                fontFamily: "var(--app-font-display)", fontWeight: 700, fontSize: 11,
                padding: "5px 14px", borderRadius: 9999, border: "none",
                background: themeKey === "colour"
                  ? "rgba(139,92,246,0.3)" : themeKey === "pastel"
                    ? "#FDE68A" : "#ccc",
                color: themeKey === "colour" ? "#E9D5FF" : themeKey === "pastel" ? "#78350F" : "#333",
                cursor: "pointer",
                transition: "background 0.2s",
                whiteSpace: "nowrap",
              }}
              title="Return to live dashboard"
            >
              ← Return to Present
            </button>
          </div>
        )}

        {/* ── Below-header area: main content + route pane ─────────── */}
        <div style={{
          display: "flex", flex: 1, minHeight: 0,
          position: "relative",
          backgroundImage: tt.isActive ? ttBg.gradients.join(", ") : undefined,
          backgroundRepeat: tt.isActive ? ttBg.gradients.map(() => "no-repeat").join(", ") : undefined,
          backgroundSize: tt.isActive ? ttBg.gradients.map(() => "100% 100%").join(", ") : undefined,
        }}>

          {/* ── Question pane (independent scroll + footer) ─────── */}
          <div style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}>
          <main id="main-content" tabIndex={-1} className="scrollbar-hide" ref={mainContentRef} style={{
            flex: 1,
            overflowY: "auto",
            position: "relative",
          }}>
          {/* ── City 404 overlay — only after animation settles on this city ── */}
          {!citySource && settledCity === selectedCity && (
            <div style={{
              position: "absolute", inset: 0, zIndex: 100,
              display: "flex", alignItems: "center", justifyContent: "center",
              padding: "2rem",
              background: thm.paneBg,
              animation: "cards-reveal 0.4s ease both",
            }}>
              <Route404 selectedCity={selectedCity} thm={thm} />
            </div>
          )}

          <div style={{
            maxWidth: isMobile ? "100%" : 1320,
            margin: "0 auto",
            padding: isMobile ? "1.5rem 1rem 2rem" : "1.5rem 1.5rem 2rem",
            display: "flex",
            flexDirection: "column",
            gap: "1.5rem",
            visibility: "visible",
          }}>

          {/* ── Hero question ────────────────────────────────── */}
          <div className="animate-bounce-in" style={{ textAlign:"center", padding:"0.75rem 1rem 0.5rem",
            opacity: showIntro ? 0 : 1,
            animation: showIntro ? "none" : "cards-reveal 0.4s ease both",
            position: "sticky", top: 0, zIndex: 200,
            background: thm.headerBg,
            backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
            borderBottom: thm.cardBorder,
          }}>
            <h1 style={{
              fontFamily:"var(--app-font-display)", fontWeight:900,
              fontSize:"clamp(1.3rem,3.2vw,2rem)", lineHeight:1.7,
              color: thm.textPrimary,
              display:"flex", flexWrap:"wrap", alignItems:"center",
              justifyContent:"center", gap:"0.3em",
            }}>
              <span>Has traffic</span>
              <Chip icon={questionMode==="worsened"?"👎":"👍"} variant={questionMode}
                onClick={toggleMode} animate={!!chipAnim.mode}>{questionMode}</Chip>
              <span>on</span>
              <Chip icon="🚦" variant="route"
                onClick={nextRoute} animate={!!chipAnim.route}>{selectedRoute}</Chip>
              <span>during</span>
              <Chip icon="⏱️" variant="tod"
                onClick={nextTod} animate={!!chipAnim.tod}>{todLabel}</Chip>
              <span>over the past</span>
              <Chip icon="📅" variant="period"
                onClick={nextPeriod} animate={!!chipAnim.period}>{periodLabel}</Chip>
              <span>?</span>
            </h1>
            <p style={{ marginTop:"0.25rem", fontSize:12, color: thm.textMuted }}>
              <br></br>(Tap any highlighted word to explore a different question.)
            </p>
          </div>

          {/* Loading — hidden during intro (car animation is shown instead) */}
          {loading && !showCar && (
            <div style={{ textAlign:"center", padding:"4rem 0" }}>
              <p style={{ color: thm.textMuted, fontWeight:600 }}>Fetching traffic data…</p>
            </div>
          )}

          {/* Error — 404-style full-page */}
          {!loading && error && (
            <div style={{ textAlign:"center", padding:"6rem 2rem",
              opacity: showIntro ? 0 : 1,
            }}>
              <div style={{ fontSize:64, marginBottom:16 }}>📡</div>
              <p style={{ fontWeight:700, fontSize:18, color: thm.textPrimary, marginBottom:8 }}>
                Data unavailable for {selectedCity}
              </p>
              <p style={{ fontSize:14, color: thm.textMuted, maxWidth:400, margin:"0 auto" }}>
                {error.includes("HTTP") ? "The dataset could not be fetched. Check the data source URL in config.json." : error}
              </p>
            </div>
          )}

          {/* ── Baseline slider ─ rendered immediately ──── */}
          {citySource && (
            <div className="animate-fade-in" style={{
                  background: showIntro ? "transparent" : thm.sectionBg,
                  border: showIntro ? "none" : thm.cardBorder,
                  boxShadow: showIntro ? "none" : thm.cardShadow,
                  borderRadius:"1.5rem",
                  padding: "1.25rem 1.5rem 2rem",
                  position:"relative", zIndex: 1, overflow:"hidden",
                }}>
                  {showSparkle && <Sparkles />}

                  {/* ── Full-width intro car ── */}
                  {showCar && carReady && <div style={{
                    position: "absolute", top: "3.5rem", left: 0, right: 0,
                    height: 80,
                    opacity: carFading ? 0 : 1,
                    transition: carFading ? "opacity 1.2s ease-out" : "none",
                    pointerEvents: "none",
                    zIndex: 50,
                  }}>
                    {/* 0→100% loading counter */}
                    <div style={{
                      position: "absolute",
                      top: "60px",
                      left: 0, right: 0,
                      textAlign: "center",
                      fontFamily: "var(--app-font-display)",
                      fontWeight: 800,
                      fontSize: "clamp(2rem,6vw,3.5rem)",
                      letterSpacing: "-0.04em",
                      color: thm.textPrimary,
                      userSelect: "none",
                      lineHeight: 1,
                    }}>
                      {loadPct}
                    </div>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="80" height="80"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke={thm.textPrimary}
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{
                        position: "absolute",
                        top: "-20px",
                        left: 0,
                        zIndex: 50,
                        animation: `track-run 2s ease-in-out forwards`,
                      }}
                    >
                      <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" />
                      <circle cx="7" cy="17" r="2" />
                      <path d="M9 17h6" />
                      <circle cx="17" cy="17" r="2" />
                    </svg>
                  </div>}

                  {/* Header row: title + toggle + InfoTip — TrafficNOW! style */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: baselineOpen ? 14 : 0,
                    opacity: showIntro ? 0 : 1,
                  }}>
                    <button onClick={() => setBaselineOpen(o => !o)} style={{
                      display: "flex", alignItems: "center", gap: 8,
                      background: "none", border: "none", cursor: "pointer", padding: 0,
                    }}>
                      <p style={{ fontFamily: "var(--app-font-display)", fontWeight: 700, fontSize: 17, color: thm.textPrimary, margin: 0 }}>
                        ✳︎ Baseline — Compare with this earlier period
                      </p>
                      <InfoTip thm={thm}>{TOOLTIP_CONTENT.baselineSlider.body}</InfoTip>
                      <span style={{ fontSize: 16, color: thm.textMuted, display: "inline-block",
                        transform: baselineOpen ? "rotate(180deg)" : "rotate(0deg)",
                        transition: "transform 0.2s ease" }}>▾</span>
                    </button>
                    {!baselineOpen && baselineStartDate && (
                      <span style={{ fontSize: 13, color: thm.textMuted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "50%" }}>
                        {fmtShortDate(baselineStartDate)}–{fmtShortDate(baselineEndDate)}
                      </span>
                    )}
                  </div>

                  {baselineOpen && (
                  <>
                  <div style={{ padding:"28px 0 4px", position:"relative" }}>
                    {/* Slider interior — hidden until real data loads so placeholder
                        [0,1] thumb positions are never visible */}
                    <div style={{
                      opacity: carReady ? 1 : 0,
                      transition: "opacity 0.3s ease",
                    }}>
                    <SliderPrimitive.Root
                      min={0} max={maxIdx} step={1}
                      value={sliderVals} onValueChange={handleSliderChange}
                      onValueCommit={() => setDragThumb(-1)}
                      style={{ position:"relative", display:"flex",
                        alignItems:"center", height:40, userSelect:"none", touchAction:"none" }}
                    >
                      {/* Left thumb date label */}
                      {baselineStartDate && (
                        <div style={{
                          opacity: showIntro ? 0 : 1,
                          position:"absolute", left:`${leftPct}%`, top:-20,
                          transform:"translateX(-50%)",
                          fontSize:10, fontWeight: dragThumb === 0 ? 600 : 400,
                          color: dragThumb === 0 ? thm.textPrimary : thm.textMuted,
                          whiteSpace:"nowrap", pointerEvents:"none", zIndex:30,
                          transition:"color 0.12s, font-weight 0.12s",
                        }}>
                          {fmtDate(baselineStartDate)}
                        </div>
                      )}
                      {/* Right thumb date label */}
                      {baselineEndDate && (
                        <div style={{
                          opacity: showIntro ? 0 : 1,
                          position:"absolute", left:`${rightPct}%`, top:-20,
                          transform:"translateX(-50%)",
                          fontSize:10, fontWeight: dragThumb === 1 ? 600 : 400,
                          color: dragThumb === 1 ? thm.textPrimary : thm.textMuted,
                          whiteSpace:"nowrap", pointerEvents:"none", zIndex:30,
                          transition:"color 0.12s, font-weight 0.12s",
                        }}>
                          {fmtDate(baselineEndDate)}
                        </div>
                      )}

                      {/* Track */}
                      <SliderPrimitive.Track ref={trackRef} style={{
                        position:"relative", flexGrow:1,
                        height:10, borderRadius:9999, overflow:"hidden",
                        background: thm.slider.rail,
                      }}>
                        {/* Left unselected segment */}
                        <div style={{
                          position:"absolute", top:0, left:0,
                          width:`${leftTrackPct}%`, height:"100%",
                          background: thm.slider.rail, pointerEvents:"none",
                        }} />
                        {/* Selected baseline window — hidden during intro */}
                        <div style={{
                          position:"absolute", top:0,
                          left:`${leftTrackPct}%`,
                          width:`${Math.max(0, rightTrackPct - leftTrackPct)}%`,
                          height:"100%",
                          background: thm.slider.track,
                          pointerEvents:"none",
                          opacity: showIntro ? 0 : 1,
                          transition: "opacity 0.3s ease",
                        }} />
                        {/* Right unselected segment */}
                        <div style={{
                          position:"absolute", top:0, left:`${rightTrackPct}%`,
                          width:`${100 - rightTrackPct}%`, height:"100%",
                          background: thm.slider.rail, pointerEvents:"none",
                        }} />
                        <SliderPrimitive.Range style={{ display:"none" }} />
                      </SliderPrimitive.Track>

                      {/* Left thumb — hidden during intro */}
                      <SliderPrimitive.Thumb
                        className="slider-thumb"
                        onPointerDown={() => setDragThumb(0)}
                        style={{ display:"flex", alignItems:"center", justifyContent:"center",
                          width:22, height:40, background:"transparent",
                          border:"none", outline:"none", cursor:"grab", zIndex:10, flexShrink:0,
                          opacity: showIntro ? 0 : 1,
                          transition: "opacity 0.3s ease",
                        }}
                      >
                        <span style={{
                          display:"block", width:7, height:28, borderRadius:9999,
                          background: thm.slider.thumbFg,
                          border:`2px solid ${thm.slider.thumbBorder}`,
                          boxShadow: thm.slider.thumbShadow,
                        }} />
                      </SliderPrimitive.Thumb>

                      {/* Right thumb — hidden during intro */}
                      <SliderPrimitive.Thumb
                        className="slider-thumb"
                        onPointerDown={() => setDragThumb(1)}
                        style={{ display:"flex", alignItems:"center", justifyContent:"center",
                          width:22, height:40, background:"transparent",
                          border:"none", outline:"none", cursor:"grab", zIndex:10, flexShrink:0,
                          opacity: showIntro ? 0 : 1,
                          transition: "opacity 0.3s ease",
                        }}
                      >
                        <span style={{
                          display:"block", width:7, height:28, borderRadius:9999,
                          background: thm.slider.thumbFg,
                          border:`2px solid ${thm.slider.thumbBorder}`,
                          boxShadow: thm.slider.thumbShadow,
                        }} />
                      </SliderPrimitive.Thumb>
                    </SliderPrimitive.Root>
                    </div>{/* end slider interior opacity wrapper */}
                  </div>

                  {/* Boundary dates */}
                  <div style={{ display:"flex", justifyContent:"space-between",
                    fontSize:10, fontWeight:400, color: thm.textMuted, marginTop:6,
                    opacity: showIntro ? 0 : 1,
                    transition: "opacity 0.4s ease",
                  }}>
                    <span>{fmtDate(allRouteWeeks[0]?.weekKey)}</span>
                    <span>{lastDataDate ? fmtDate(lastDataDate.toISOString()) : fmtDate(lastDate)}</span>
                  </div>

                  {/* Overlap warning */}
                  {overlapWarning && (
                    <p key={String(overlapWarning)} style={{
                      fontSize:11, color: thm.speedBad, textAlign:"center",
                      marginTop:8, animation:"overlap-warning 3s ease forwards",
                      pointerEvents:"none",
                    }}>
                      Baseline can't overlap with the recent period 🙅
                    </p>
                  )}
                  </>
                  )}
                </div>
          )}

          {!loading && !error && rowCount > 0 && (
            <>

              {/* ── Cards reveal wrapper (hidden during intro) ── */}
              <div style={{
                display: "flex",
                flexDirection: "column",
                gap: "1.5rem",
                opacity: showIntro ? 0 : 1,
                animation: showIntro ? "none" : "cards-reveal 0.4s ease 0.05s both",
              }}>

              {/* ── Verdict ──────────────────────────────────── */}
              <div className="animate-fade-in" style={{
                background: thm.verdictBg(v.bg),
                border: `1px solid ${thm.verdictBorder(v.border)}`,  
                borderRadius:"1.5rem", padding: "1.25rem 1.5rem",
                position: "relative",
              }}>
                {/* Header row: title + toggle + Info icon */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: verdictOpen ? 12 : 0 }}>
                  <button onClick={() => setVerdictOpen(o => !o)} style={{
                    display: "flex", alignItems: "center", gap: 8,
                    background: "none", border: "none", cursor: "pointer", padding: 0,
                  }}>
                    <p style={{ fontFamily: "var(--app-font-display)", fontWeight: 700, fontSize: 17,
                      color: thm.verdictText(v.tc), margin: 0 }}>
                      ✳︎ Verdict
                    </p>
                    <InfoTip thm={thm}>{TOOLTIP_CONTENT.verdict.body}</InfoTip>
                    <span style={{ fontSize: 16, color: thm.verdictText(v.tc), opacity: 0.6, display: "inline-block",
                      transform: verdictOpen ? "rotate(180deg)" : "rotate(0deg)",
                      transition: "transform 0.2s ease" }}>▾</span>
                  </button>
                  {!verdictOpen && (
                    <span style={{ fontSize: 13, color: thm.verdictText(v.tc), opacity: 0.8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "60%", textAlign: "right" }}>
                      {v.msg}
                    </span>
                  )}
                </div>
                {verdictOpen && (
                  <>
                    <div style={{ textAlign:"center" }}>
                      <div className="animate-bounce-in" key={verdictKey}
                        style={{ fontSize:"3.5rem", lineHeight:1, marginBottom:8 }}>
                        {v.face}
                      </div>
                      <p data-testid="verdict-message" style={{ fontFamily:"var(--app-font-display)", fontWeight:700, fontSize:18,
                        color: thm.verdictText(v.tc) }}>
                        {v.msg}
                      </p>
                      {verdictSubtext && (
                        <p style={{ marginTop:6, fontSize:12,
                          color: thm.verdictText(v.tc), opacity:0.85, lineHeight:1.6 }}>
                          {verdictSubtext}
                        </p>
                      )}
                    </div>

                    {(baselineWeeks.length > 0 || recentWeeks.length > 0) && (
                      <div style={{ display:"flex", alignItems:"center", gap:0, marginTop:20, opacity:0.95 }}>
                        {baselineSpeed > 0 && (
                          <div style={{ width:"auto", flexShrink:0, textAlign:"center", paddingRight:6 }}>
                            <p style={{ fontSize:10, fontWeight:700, textTransform:"uppercase",
                              letterSpacing:"0.08em", color: thm.baselineLabel, marginBottom:4 }}>✳Baseline</p>
                            <p style={{ fontFamily:"var(--app-font-display)", fontWeight:800, fontSize:22,
                              color: thm.verdictText(v.tc), lineHeight:1 }}>
                              {baselineSpeed}<span style={{ fontSize:11, fontWeight:600 }}> km/h</span>
                            </p>
                          </div>
                        )}
                        <div style={{ flex:1, position:"relative" }}>
                          <NapkinChart
                            baselineWeeks={baselineWeeks}
                            recentWeeks={recentWeeks}
                            height={132}
                            dateLabels={{
                              bStart: fmtDate(baselineStartDate),
                              bEnd:   fmtDate(baselineEndDate),
                              rStart: fmtDate(recentStartDate),
                              rEnd:   lastDataDate ? fmtDate(lastDataDate.toISOString()) : fmtDate(lastDate),
                            }}
                          />
                        </div>
                        {recentSpeed > 0 && (
                          <div style={{ width:"auto", flexShrink:0, textAlign:"center", paddingLeft:6 }}>
                            <p style={{ fontSize:10, fontWeight:700, textTransform:"uppercase",
                              letterSpacing:"0.08em", color: thm.recentLabel, marginBottom:4 }}>Recent</p>
                            <p style={{ fontFamily:"var(--app-font-display)", fontWeight:800, fontSize:22,
                              color: thm.verdictText(v.tc), lineHeight:1 }}>
                              {recentSpeed}<span style={{ fontSize:11, fontWeight:600 }}> km/h</span>
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* ── KPI cards ─────────────────────────────────── */}
              {selectedStats.count > 0 ? (
                <div style={{ display:"grid",
                  gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))", gap:14 }}>

                  <div style={{ ...kpiCardBase, background: thm.kpiCardBgs[0] }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                      <p style={{ fontFamily: "var(--app-font-display)", fontWeight: 700, fontSize: 17, color: thm.textPrimary, margin: 0 }}>
                        ⚡ Avg Speed
                      </p>
                      <InfoTip thm={thm}>{TOOLTIP_CONTENT.kpiAvgSpeed.body}</InfoTip>
                    </div>
                    <p data-testid="kpi-avg-speed-value" style={kpiValue}>{selectedStats.avgSpeed || "—"}
                      {selectedStats.avgSpeed > 0 && <span style={{ fontSize:14, fontWeight:600 }}> km/h</span>}
                    </p>
                    <p style={kpiSub}>
                      {baselineSpeed > 0 ? `Baseline: ${baselineSpeed} km/h` : "Set baseline above"}
                    </p>
                  </div>

                  <div style={{ ...kpiCardBase, background: thm.kpiCardBgs[1] }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                      <p style={{ fontFamily: "var(--app-font-display)", fontWeight: 700, fontSize: 17, color: thm.textPrimary, margin: 0 }}>
                        🕐 Median Trip
                      </p>
                      <InfoTip thm={thm}>{TOOLTIP_CONTENT.kpiMedianTrip.body}</InfoTip>
                    </div>
                    <p data-testid="kpi-median-trip-value" style={kpiValue}>{fmtDuration(selectedStats.median)}</p>
                    <p style={kpiSub}>Mean: {fmtDuration(selectedStats.mean)}</p>
                  </div>

                  <div style={{ ...kpiCardBase, background: thm.kpiCardBgs[2] }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                      <p style={{ fontFamily: "var(--app-font-display)", fontWeight: 700, fontSize: 17, color: thm.textPrimary, margin: 0 }}>
                        🔥 Bad Day Trip
                      </p>
                      <InfoTip thm={thm}>{fillTemplate(TOOLTIP_CONTENT.kpiBadDay.body, { badDayN, percentile: cfg.percentile.worst_case })}</InfoTip>
                    </div>
                    <p data-testid="kpi-bad-day-value" style={kpiValue}>{fmtDuration(selectedStats.p95)}</p>
                    <p style={kpiSub}>1-in-{badDayN} trips take this long</p>
                  </div>

                  <div style={{ ...kpiCardBase, background: thm.kpiCardBgs[3] }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                      <p style={{ fontFamily: "var(--app-font-display)", fontWeight: 700, fontSize: 17, color: thm.textPrimary, margin: 0 }}>
                        📊 No. of Trips
                      </p>
                      <InfoTip thm={thm}>{TOOLTIP_CONTENT.kpiNumTrips.body}</InfoTip>
                    </div>
                    <p data-testid="kpi-trips-count-value" style={kpiValue}>{selectedStats.count.toLocaleString()}</p>
                    <p style={kpiSub}>{chartDataArr.length} {chartGranularity === 'daily' ? 'days' : 'weeks'} · {periodLabel} window</p>
                  </div>
                </div>
              ) : (
                <div style={{ position: "relative", zIndex: 1, background: thm.sectionBg, border: thm.cardBorder, boxShadow: thm.cardShadow,
                  borderRadius:16, padding:"2.5rem", textAlign:"center" }}>
                  <p style={{ fontSize:36, marginBottom:8 }}>🔍</p>
                  <p style={{ fontWeight:700, color: thm.textPrimary }}>No data for these filters</p>
                  <p style={{ fontSize:13, color: thm.textMuted, marginTop:4 }}>
                    Tap any chip to try a different combination.
                  </p>
                </div>
              )}

              {/* ── Charts ───────────────────────────────────── */}
              {chartDataArr.length > 0 && (
                <>
                  <div style={{ display:"grid", gap:16 }}>
                    {/* Merged Speed / Duration chart with toggle */}
                    <div className="chart-card animate-fade-in"
                      style={thm.key!=="colour" ? { position: "relative", zIndex: 1, background: thm.cardBg, border: thm.cardBorder, boxShadow: thm.cardShadow, padding: "1.25rem 1.5rem" } : { position: "relative", zIndex: 1, padding: "1.25rem 1.5rem" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: chartOpen ? 8 : 0 }}>
                        <button onClick={() => setChartOpen(o => !o)} style={{
                          display: "flex", alignItems: "center", gap: 8,
                          background: "none", border: "none", cursor: "pointer", padding: 0,
                        }}>
                          <span style={{ fontFamily:"var(--app-font-display)", fontWeight:700, fontSize:17,
                            color: thm.textPrimary }}>
                            {chartView === 'speed' ? '✳︎ Speed Over Time' : '✳︎ Trip Duration Over Time'}
                          </span>
                          <InfoTip thm={thm} maxWidth={280}>
                            {chartView === 'speed'
                              ? TOOLTIP_CONTENT.chartSpeed.body
                              : TOOLTIP_CONTENT.chartDuration.body
                            }
                          </InfoTip>
                          <span style={{ fontSize: 16, color: thm.textMuted, display: "inline-block",
                            transform: chartOpen ? "rotate(180deg)" : "rotate(0deg)",
                            transition: "transform 0.2s ease" }}>▾</span>
                        </button>
                        {chartOpen && (
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          {/* Daily / Weekly toggle */}
                          <div style={{ display: "flex", alignItems: "center", gap: 4, background: thm.sectionBg, borderRadius: 8, padding: 2 }}>
                            {(['daily', 'weekly'] as const).map(g => (
                              <button key={g}
                                onClick={() => setChartGranularity(g)}
                                style={{
                                  padding: "10px 10px",
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
                          {/* Speed / Duration toggle */}
                          <div style={{ display: "flex", alignItems: "center", gap: 4, background: thm.sectionBg, borderRadius: 8, padding: 2 }}>
                            <button
                              onClick={() => setChartView('speed')}
                              style={{
                                padding: "10px 12px",
                                borderRadius: 6,
                                border: "none",
                                background: chartView === 'speed' ? thm.cardBg : "transparent",
                                color: chartView === 'speed' ? thm.textPrimary : thm.textMuted,
                                fontSize: 12,
                                fontWeight: chartView === 'speed' ? 600 : 400,
                                cursor: "pointer",
                                boxShadow: chartView === 'speed' ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                              }}
                            >
                              Speed
                            </button>
                            <button
                              onClick={() => setChartView('duration')}
                              style={{
                                padding: "10px 12px",
                                borderRadius: 6,
                                border: "none",
                                background: chartView === 'duration' ? thm.cardBg : "transparent",
                                color: chartView === 'duration' ? thm.textPrimary : thm.textMuted,
                                fontSize: 12,
                                fontWeight: chartView === 'duration' ? 600 : 400,
                                cursor: "pointer",
                                boxShadow: chartView === 'duration' ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                              }}
                            >
                              Duration
                            </button>
                          </div>
                        </div>
                        )}
                      </div>
                      {chartOpen && (
                      <>
                      <p style={{ fontSize:12, color: thm.textMuted, marginBottom:14 }}>
                        {chartView === 'speed'
                          ? `${chartGranularity === 'daily' ? 'Daily' : 'Weekly'} avg km/h vs. best & worst envelope — higher is faster`
                          : `${chartGranularity === 'daily' ? 'Daily' : 'Weekly'} avg and bad-day trips — lower is better`}
                      </p>
                      <ResponsiveContainer width="100%" height={isMobile ? 240 : 280}>
                        {chartView === 'speed' ? (
                          <ComposedChart
                            key={`speed-${chartGranularity}`}
                            data={chartDataArr} margin={chartMargin}>
                            <defs>
                              <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%"  stopColor={colors.line1} stopOpacity={0.25}/>
                                <stop offset="95%" stopColor={colors.line1} stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke={thm.key==="gray"?"#e0e0e0":"hsl(var(--border))"} vertical={false}/>
                            <XAxis
                              dataKey={chartDataKey}
                              tickFormatter={fmtWeek}
                              ticks={xAxisTicks}
                              interval={0}
                              tickMargin={8}
                              tick={{ fontSize: 11, fill: thm.textMuted }}
                              tickLine={false}
                              axisLine={false}
                            />
                            <YAxis
                              width={yAxisWidth}
                              tick={{fontSize:11,fill:thm.textMuted}}
                              tickLine={false}
                              axisLine={false}
                              tickFormatter={(v: number) => Math.round(v).toString()}
                              unit=" km/h"
                              domain={[Math.floor(speedDomain.min), Math.ceil(speedDomain.max)]}
                              allowDecimals={false}
                            />
                            <RCTooltip content={useChartTooltip(thm, 'speed')}/>
                            {/* Actual average trend (rendered first so fill doesn't cover lines) */}
                            <Area type="monotone" dataKey="avgSpeed" name="Avg Speed"
                              stroke={colors.line1}
                              strokeWidth={thm.key==="gray" ? 2 : 2.5}
                              fill="url(#sg)" dot={false} connectNulls/>
                            {/* Per-week best (p95 = fastest) */}
                            <Line type="monotone" dataKey="p95Speed" name="Best"
                              stroke={thm.key === "gray" ? "#444" : "#22c55e"}
                              strokeWidth={1.5} strokeDasharray="5 3"
                              dot={false} connectNulls/>
                            {/* Per-week worst (p05 = slowest) */}
                            <Line type="monotone" dataKey="p05Speed" name="Worst"
                              stroke={thm.key === "gray" ? "#444" : "#ef4444"}
                              strokeWidth={1.5} strokeDasharray="5 3"
                              dot={false} connectNulls/>
                          </ComposedChart>
                        ) : (
                          <ComposedChart
                            key={`duration-${chartGranularity}`}
                            data={chartDataArr} margin={chartMargin}>
                            <defs>
                              <linearGradient id="durAvg" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%"  stopColor={colors.line1} stopOpacity={0.25}/>
                                <stop offset="95%" stopColor={colors.line1} stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke={thm.key==="gray"?"#e0e0e0":"hsl(var(--border))"} vertical={false}/>
                            <XAxis
                              dataKey={chartDataKey}
                              tickFormatter={fmtWeek}
                              ticks={xAxisTicks}
                              interval={0}
                              tickMargin={8}
                              tick={{ fontSize: 11, fill: thm.textMuted }}
                              tickLine={false}
                              axisLine={false}
                            />
                            <YAxis
                              width={yAxisWidth}
                              tick={{fontSize:11,fill:thm.textMuted}}
                              tickLine={false}
                              axisLine={false}
                              tickFormatter={(v: number) => Math.round(v).toString()}
                              unit=" min"
                              domain={[Math.floor(durationDomain.min), Math.ceil(durationDomain.max)]}
                              allowDecimals={false}
                            />
                            <RCTooltip content={useChartTooltip(thm, 'duration')}/>
                            {/* Actual average trend with fill (rendered first so fill doesn't cover line) */}
                            <Area type="monotone" dataKey="avgDuration" name="Avg Duration"
                              stroke={colors.line1}
                              strokeWidth={thm.key==="gray" ? 2 : 2.5}
                              fill="url(#durAvg)" dot={false} connectNulls/>
                            {/* Best (p05 = shortest trips) */}
                            <Line type="monotone" dataKey="p05Duration" name="Best"
                              stroke={thm.key === "gray" ? "#444" : "#22c55e"}
                              strokeWidth={1.5} strokeDasharray="5 3"
                              dot={false} connectNulls/>
                            {/* Worst (p95 = longest trips) */}
                            <Line type="monotone" dataKey="p95Duration" name="Worst"
                              stroke={thm.key === "gray" ? "#444" : "#ef4444"}
                              strokeWidth={1.5} strokeDasharray="5 3"
                              dot={false} connectNulls/>
                          </ComposedChart>
                        )}
                      </ResponsiveContainer>
                      {/* Series legend — Best · Avg · Worst */}
                      {chartView === 'speed' ? (
                        <div style={{
                          display: "flex", flexWrap: "wrap", gap: "12px", marginTop: 8,
                          fontSize: 11, color: thm.textMuted, alignItems: "center",
                          justifyContent: "center",
                        }}>
                          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <span style={{ width: 14, height: 0, borderTop: `2px dashed ${thm.key === "gray" ? "#444" : "#22c55e"}`, display: "inline-block" }}/>
                            Best
                          </span>
                          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <span style={{ width: 14, height: 3, borderRadius: 2, background: colors.line1, display: "inline-block" }}/>
                            Avg Speed
                          </span>
                          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <span style={{ width: 14, height: 0, borderTop: `2px dashed ${thm.key === "gray" ? "#444" : "#ef4444"}`, display: "inline-block" }}/>
                            Worst
                          </span>
                        </div>
                      ) : (
                        <div style={{
                          display: "flex", flexWrap: "wrap", gap: "12px", marginTop: 8,
                          fontSize: 11, color: thm.textMuted, alignItems: "center",
                          justifyContent: "center",
                        }}>
                          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <span style={{ width: 14, height: 0, borderTop: `2px dashed ${thm.key === "gray" ? "#444" : "#22c55e"}`, display: "inline-block" }}/>
                            Best
                          </span>
                          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <span style={{ width: 14, height: 3, borderRadius: 2, background: colors.line1, display: "inline-block" }}/>
                            Avg Duration
                          </span>
                          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <span style={{ width: 14, height: 0, borderTop: `2px dashed ${thm.key === "gray" ? "#444" : "#ef4444"}`, display: "inline-block" }}/>
                            Worst
                          </span>
                        </div>
                      )}
                    </>
                    )}
                    </div>
                  </div>

                  {/* ── Good Days and Bad Days calendar ── */}
                  {
                    <div className="chart-card animate-fade-in"
                      style={{
                        padding:"1.25rem 1.5rem",
                        position: "relative",
                        zIndex: 1,
                        ...(thm.key!=="colour" ? { background: thm.cardBg, border: thm.cardBorder, boxShadow: thm.cardShadow } : {}),
                      }}>
                      {/* Header row: title + toggle + Info icon */}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: calendarCardOpen ? 12 : 0 }}>
                        <button onClick={() => setCalendarCardOpen(o => !o)} style={{
                          display: "flex", alignItems: "center", gap: 8,
                          background: "none", border: "none", cursor: "pointer", padding: 0,
                        }}>
                          <p style={{ fontFamily: "var(--app-font-display)", fontWeight: 700, fontSize: 17, color: thm.textPrimary, margin: 0 }}>
                            ✳︎ Good Days and Bad Days
                          </p>
                          <InfoTip thm={thm}>
                            {selectedRoute === benchmarkRouteLabel
                              ? TOOLTIP_CONTENT.dailyCalendarBenchmark.body
                              : TOOLTIP_CONTENT.dailyCalendar.body
                            }
                          </InfoTip>
                          <span style={{ fontSize: 16, color: thm.textMuted, display: "inline-block",
                            transform: calendarCardOpen ? "rotate(180deg)" : "rotate(0deg)",
                            transition: "transform 0.2s ease" }}>▾</span>
                        </button>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          {widgetCalNavBtn("‹", widgetCalCanBack, widgetCalPrevMo)}
                          <span style={{ fontWeight: 700, fontSize: 14, color: thm.textPrimary, minWidth: 150, textAlign: "center" }}>{widgetCalMonthLabel}</span>
                          {widgetCalNavBtn("›", widgetCalCanFwd, widgetCalNextMo)}
                        </div>
                      </div>
                      {calendarCardOpen && (
                        <>
                          <CalendarWidget
                            dailyStats={calendarDailyStats}
                            allRows={allRows}
                            selectedRoute={selectedRoute}
                            tod={tod}
                            benchmarkDailyStats={benchmarkDailyStats}
                            benchmarkRouteLabel={benchmarkRouteLabel}
                            bandThresholds={bandThresholds}
                            cutoffDate={tt.isActive ? tt.simulatedNow : null}
                            widgetCalYear={widgetCalYear}
                            widgetCalMonth={widgetCalMonth}
                            onDateClick={(dk) => tt.activate(new Date(dk + "T12:00:00"))}
                            isBenchmarkRoute={selectedRoute === benchmarkRouteLabel}
                          />
                          {/* ── R³S² Context Block ── */}
                          {rrsCtx && (
                            <RrsContextBlock ctx={rrsCtx} tod={tod} theme={thm} />
                          )}
                          {/* ── R³S² DEBUG Block ── */}
                          {rrsCtx && (
                            <RrsDebugBlock
                              ctx={rrsCtx}
                              selectedRoute={selectedRoute}
                              tod={tod}
                              widgetCalMonth={widgetCalMonth}
                              widgetCalYear={widgetCalYear}
                              theme={thm}
                            />
                          )}
                        </>
                      )}
                    </div>
                  }

                  {/* ── Weekly Speed Distribution — hidden pending redesign ── */}
                  {false && trafficNowData.length > 0 && (
                    <div data-testid="forecast-bands-card" className="chart-card animate-fade-in"
                      style={thm.key !== "colour"
                        ? { position: "relative", zIndex: 1, overflow: "hidden", backgroundClip: "padding-box", background: thm.cardBg, border: thm.cardBorder, boxShadow: thm.cardShadow, padding: "1.25rem 1.5rem" }
                        : { position: "relative", zIndex: 1, overflow: "hidden", backgroundClip: "padding-box", padding: "1.25rem 1.5rem" }}>
                      {/* Header row: toggle + optional compare badge */}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: tnOpen ? 4 : 0 }}>
                        <button onClick={() => setTnOpen(o => !o)} style={{
                          display: "flex", alignItems: "center", gap: 8,
                          background: "none", border: "none", cursor: "pointer", padding: 0,
                        }}>
                          <p style={{ fontFamily: "var(--app-font-display)", fontWeight: 700, fontSize: 17, color: thm.textPrimary, margin: 0 }}>
                            {tt.isActive ? "⏳" : "✳︎"} Weekly Speed Distribution{tt.isActive && tt.simulatedNow ? ` · as of ${ttFormat(tt.simulatedNow!)}` : ""}
                          </p>
                          <InfoTip thm={thm}>
                            {TOOLTIP_CONTENT.forecastBands.body}
                          </InfoTip>
                          <span style={{ fontSize: 16, color: thm.textMuted, display: "inline-block",
                            transform: tnOpen ? "rotate(180deg)" : "rotate(0deg)",
                            transition: "transform 0.2s ease" }}>▾</span>
                        </button>
                        {trafficNowCompare.length > 0 && tnOpen && (
                          <span style={{
                            fontSize: 10, fontWeight: 600, padding: "2px 8px",
                            borderRadius: 999,
                            background: thm.key === "gray" ? "rgba(0,0,0,0.06)" : "rgba(15,118,110,0.10)",
                            color: thm.key === "gray" ? "#555" : "var(--tn-series,#0f766e)",
                            border: `1px solid ${thm.key === "gray" ? "rgba(0,0,0,0.10)" : "rgba(15,118,110,0.20)"}`,
                          }}>
                            Compare mode
                          </span>
                        )}
                      </div>
                      {tnOpen && (
                        <>
                          <p style={{ fontSize: 12, color: thm.textMuted, marginTop: 2, marginBottom: 4 }}>
                            {tt.isActive ? "Historical snapshot · " : ""}Weekly speed distribution · {routeEndpoints}
                            {trafficNowCompare.length > 0 ? ` — with baseline comparison` : ""}
                          </p>
                          <UncertaintyBandChart
                            data={trafficNowData}
                            compareData={trafficNowCompare.length > 0 ? trafficNowCompare : undefined}
                            mode={trafficNowCompare.length > 0 ? "compare" : tnMode}
                            title={`Weekly speed distribution for ${selectedRoute}`}
                            routeName={selectedRoute}
                            seriesLabel={`Recent: ${todLabel}`}
                            compareLabel={`Baseline: ${fmtDate(baselineStartDate)}–${fmtDate(baselineEndDate)}`}
                            height={280}
                            themeKey={themeKey}
                          />
                        </>
                      )}
                    </div>
                  )}
                </>
              )}

              </div>{/* close cards reveal wrapper */}

            </>
          )}

          </div>{/* close centered content */}

        {/* ── Footer — full width, scrolls with content ─────────── */}
        <footer style={{
          borderTop:`1px solid ${thm.key==="gray"?"#e0e0e0":"hsl(var(--border))"}`,
          padding:"0.3rem 1.5rem",
          display:"flex", alignItems:"baseline", justifyContent:"center",
          flexWrap:"wrap", gap:"0 4px",
          fontSize:11, color: thm.textMuted,
          opacity: showIntro ? 0 : 1,
          transition: "opacity 0.4s ease",
        }}>
          <b style={{ lineHeight:1 }}>Data Source</b>{" "}
          {(() => {
            const trafficUrl = selectedCityConfig.data_source?.traffic_csv ?? "";
            const ghMatch = trafficUrl.match(/raw\.githubusercontent\.com\/([^/]+\/[^/]+)/);
            const cdnMatch = trafficUrl.match(/cdn\.jsdelivr\.net\/gh\/([^/]+\/[^/]+)/);
            const shortGh = ghMatch ? ghMatch[1] : cdnMatch ? cdnMatch[1].replace(/@.*$/, "") : null;
            const shortUrl = shortGh ?? trafficUrl;
            const href = shortGh ? `https://github.com/${shortGh}` : trafficUrl;
            const showLogo = !!shortGh;
            return (
              <a href={href}
                target="_blank" rel="noopener noreferrer"
                style={{ color: thm.chart.line4, display:"inline-flex", alignItems:"baseline", gap:4, lineHeight:1, padding:"14px 2px", minHeight:44, verticalAlign:"baseline" }}>
                {showLogo && <svg height="12" width="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" style={{ flexShrink:0, verticalAlign:"baseline" }}>
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
                </svg>}
                {shortUrl}
              </a>
            );
          })()}
          {" · "}
          {rowCount > 0 && dataTimestamp && (
            tt.isActive && tt.simulatedNow ? (
              <span>{effectiveRowCount.toLocaleString()} of {rowCount.toLocaleString()} rows · as of {ttFormat(tt.simulatedNow)}{effectiveRowCount < 100 && <span style={{ color: themeKey === "colour" ? "#FBBF24" : themeKey === "pastel" ? "#D97706" : "#B45309", fontWeight: 600, marginLeft: 4 }}>⚠ sparse data</span>}</span>
            ) : (
              <span>{rowCount.toLocaleString()} rows updated at {dataTimestamp.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false })}</span>
            )
          )}
          <span style={{ marginLeft:"auto" }}>© 2026 <a href="https://thecontrarian.in/" target="_blank" rel="noopener noreferrer" style={{ color: thm.chart.line4, padding:"14px 0", minHeight:44, display:"inline-flex", alignItems:"baseline" }}>Mahesh Shantaram</a></span>
        </footer>

        </main>

        </div>{/* close Question pane wrapper */}

          {/* ── Route browser pane (desktop) ──────────────────────── */}
          {!isMobile && citySource && (
            <div style={{ opacity: showIntro ? 0 : 1, transition: "opacity 0.4s ease", display:"flex", minHeight:0, zoom: ZOOM_STEPS[zoomIdx] }}>
              <RouteBrowserPane
                cards={allRouteCards}
                selectedRoute={selectedRoute}
                onRouteSelect={handleRouteSelectFromPane}
                dataTimestamp={effectiveDataTimestamp}
                lastUpdated={lastUpdated}
                mobile={false}
                isOpen={paneOpen}
                onToggle={() => setPaneOpen(o => { const next = !o; try { localStorage.setItem("to:paneOpen", next ? "1" : "0"); } catch {} return next; })}
                paneWidth={cfg.route_pane.width}
                ttActive={tt.isActive}
                ttSimulatedNow={tt.simulatedNow}
              />
            </div>
          )}

        </div>{/* close flex row */}

        {/* ── Mobile route browser (overlay) ──────────────────── */}
      {isMobile && citySource && (
        <div style={{ opacity: showIntro ? 0 : 1, transition: "opacity 0.4s ease", zoom: ZOOM_STEPS[zoomIdx] }}>
          <RouteBrowserPane
            cards={allRouteCards}
            selectedRoute={selectedRoute}
            onRouteSelect={handleRouteSelectFromPane}
            dataTimestamp={effectiveDataTimestamp}
            lastUpdated={lastUpdated}
            mobile={true}
            ttActive={tt.isActive}
            ttSimulatedNow={tt.simulatedNow}
          />
        </div>
      )}

      </div>
    </div>
  );
}

/* ── Public export — wraps inner component with ThemeProvider ─── */
export default function Dashboard() {
  return (
    <TimeTravelProvider>
      <ThemeProvider initialTheme={URL_PARAMS.theme as any}>
        <DashboardInner />
      </ThemeProvider>
    </TimeTravelProvider>
  );
}
