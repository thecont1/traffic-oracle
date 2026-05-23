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
  useTrafficData, useFilteredData, useAllRouteWeeks, useDailyStats, useDailyStatsAllDay, useWeatherData, buildWeatherMapFromRows,
} from "@/lib/useTrafficData";
import type { TimePeriod, TimeOfDay, WeeklyAggregate, DayStats, TrafficRow, WeatherRow } from "@/lib/useTrafficData";
import { ThemeProvider, useTheme } from "@/lib/ThemeContext";
import { THEME_META, THEME_CYCLE } from "@/lib/theme";
import type { ChipVariant, AppTheme } from "@/lib/theme";
import RouteBrowserPane from "@/components/RouteBrowserPane";
import UncertaintyBandChart from "@/components/UncertaintyBandChart";
import type { IntervalDatum, ViewingMode } from "@/components/UncertaintyBandChart";
import appConfig from "../config.json";
import type { AppConfig } from "../lib/config";

const cfg = appConfig as AppConfig;

/* ── Filter options ───────────────────────────────────────────── */
const PERIOD_LIST: { value: TimePeriod; label: string }[] = [
  { value:"1m",   label:"1 month" },
  { value:"1.5m", label:"1½ months" },
  { value:"2m",   label:"2 months" },
  { value:"3m",   label:"3 months" },
  { value:"6m",   label:"6 months" },
];
const TOD_LIST: { value: TimeOfDay; label: string }[] = [
  { value:"weekday_morning",   label:"weekday mornings (8–12)" },
  { value:"weekday_afternoon", label:"weekday afternoons (12–18)" },
  { value:"weekday_evening",   label:"weekday evenings (18–22)" },
  { value:"weekends",          label:"weekends (all day)" },
  { value:"all",               label:"any time of day" },
];

/* ── Mobile detection ─────────────────────────────────────────── */
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

/* ── URL param helpers ────────────────────────────────────────── */
function readUrlParams() {
  if (typeof window === "undefined") return {} as Record<string, string | number>;
  const p = new URLSearchParams(window.location.search);
  const out: Record<string, string | number> = {};
  if (p.has("city"))   out.city   = p.get("city")!;
  if (p.has("route"))  out.route  = p.get("route")!;
  if (p.has("tod"))    out.tod    = p.get("tod")!;
  if (p.has("period")) out.period = p.get("period")!;
  if (p.has("mode"))   out.mode   = p.get("mode")!;
  if (p.has("theme"))  out.theme  = p.get("theme")!;
  if (p.has("bl"))     out.bl     = Number(p.get("bl"));
  if (p.has("br"))     out.br     = Number(p.get("br"));
  if (p.has("zoom"))   out.zoom   = Number(p.get("zoom"));
  if (p.has("aggregation")) out.aggregation = p.get("aggregation")!;
  if (p.has("metric")) out.metric = p.get("metric")!;
  return out;
}
const URL_PARAMS = readUrlParams();

/* ── Helpers ──────────────────────────────────────────────────── */
function fmtWeek(s: string) {
  try { return new Date(s).toLocaleDateString("en-IN",{day:"numeric",month:"short"}); } catch { return s; }
}
function fmtDate(s?: string) {
  if (!s) return "—";
  try {
    const d = new Date(s);
    const mon = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getMonth()];
    return `${d.getDate()} ${mon} '${String(d.getFullYear()).slice(2)}`;
  } catch { return s; }
}
const fmtSliderDate = fmtDate;
const fmtShortDate  = fmtDate;
function fmtDuration(min: number) {
  if (!min) return "—";
  if (min < 60) return `${min.toFixed(0)} min`;
  const h = Math.floor(min/60), m = Math.round(min%60);
  return m ? `${h}h ${m}m` : `${h}h`;
}
function weeklyAvg(weeks: {avgSpeed:number}[], key:"avgSpeed") : number;
function weeklyAvg(weeks: {avgDuration:number}[], key:"avgDuration") : number;
function weeklyAvg(weeks: Record<string,number>[], key: string): number {
  if (!weeks.length) return 0;
  return Math.round((weeks.reduce((a,b) => a + (b[key] as number), 0) / weeks.length) * 10) / 10;
}

/* ── Recharts tooltip ─────────────────────────────────────────── */
function useChartTooltip(thm: { textPrimary:string; textSecondary:string; textMuted:string; cardBg:string; cardBorder:string }, view: 'speed' | 'duration' = 'speed') {
  // Desired order: Best → Avg → Worst
  const SPEED_ORDER = ["Best", "Avg Speed", "Worst"];
  const DURATION_ORDER = ["Best", "Avg Duration", "Worst"];
  const order = view === 'speed' ? SPEED_ORDER : DURATION_ORDER;

  // Technical labels for the tooltip
  const techLabel: Record<string, string> = {
    "Best": view === 'speed' ? "Best" : "Best",
    "Worst": view === 'speed' ? "Worst" : "Worst",
    "Avg Speed": "Avg Speed",
    "Avg Duration": "Avg Duration",
  };

  return (props: any) => {
    const { active, payload, label } = props ?? {};
    if (!active || !payload?.length) return null;
    // Tooltip always has white/light background, so use dark text colors
    const tp = "#2B2924"; // dark primary
    const ts = "#6E675B"; // dark secondary

    // Format weekKey (ISO date string) as "20 May 2026"
    let dateLabel = label;
    try {
      const d = new Date(label);
      if (!isNaN(d.getTime())) {
        dateLabel = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
      }
    } catch { /* keep original */ }

    // Sort payload by desired order
    const sorted = [...payload].sort((a: any, b: any) => {
      const ai = order.indexOf(a.name);
      const bi = order.indexOf(b.name);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });

    const unit = view === 'speed' ? 'km/h' : 'min';
    return (
      <div style={{ background:"rgba(255,255,255,0.97)", border:`1px solid ${thm?.cardBorder ?? "hsl(var(--border))"}`,
        borderRadius:12, padding:"10px 14px", fontSize:13, boxShadow:"0 8px 24px rgba(0,0,0,0.12)" }}>
        <p style={{ fontWeight:700, marginBottom:6, color:tp }}>{dateLabel}</p>
        {sorted.map((p: any) => (
          <div key={p.name} style={{ display:"flex", alignItems:"center", gap:6, marginBottom:2 }}>
            <span style={{ width:8, height:8, borderRadius:"50%", background:p.color, flexShrink:0 }} />
            <span style={{ color:ts }}>{techLabel[p.name] ?? p.name}:</span>
            <span style={{ fontWeight:600, color:tp }}>
              {view === 'speed' ? `${p.value} ${unit}` : fmtDuration(p.value)}
            </span>
          </div>
        ))}
      </div>
    );
  };
}

/* ── Chips ─────────────────────────────────────────────────────── */
function Chip({ children, icon, variant, onClick, animate, inert }: {
  children:React.ReactNode; icon:string; variant:ChipVariant;
  onClick:()=>void; animate?:boolean; inert?:boolean;
}) {
  const { theme: thm } = useTheme();
  const tok = thm.chips[variant];
  const styleOverride: React.CSSProperties | undefined = thm.key !== "colour" ? {
    background: tok.bg,
    color:      tok.color,
    border:     `1.5px solid ${tok.border}`,
    boxShadow:  tok.shadow,
  } : undefined;

  return (
    <button
      className={`chip chip-${variant} ${animate?"animate-pop":""}`}
      onClick={inert ? undefined : onClick}
      title={inert ? "Multi-city support coming soon" : "Tap to explore differently"}
      style={inert ? { cursor:"default", opacity:0.9, display:"flex", alignItems:"center", gap:6, padding:"6px 44px", ...styleOverride } : { display:"flex", alignItems:"center", gap:6, padding:"4px 34px", ...styleOverride }}
    >
      <span>{icon}</span>{children}
    </button>
  );
}

/* ── Location Dropdown ─────────────────────────────────────────── */
const CITIES = cfg.cities;

function LocationDropdown({ thm, selectedCity, onCityChange }: { thm: AppTheme; selectedCity: string; onCityChange: (name: string) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
    return undefined;
  }, [isOpen]);
  
  const tok = thm.chips.city;
  const styleOverride: React.CSSProperties = thm.key !== "colour" ? {
    background: tok.bg,
    color: tok.color,
    border: `1.5px solid ${tok.border}`,
    boxShadow: tok.shadow,
  } : {
    background: "rgba(255,255,255,0.15)",
    color: thm.textPrimary,
    border: "1.5px solid rgba(255,255,255,0.3)",
  };
  
  return (
    <div ref={dropdownRef} style={{ position: "relative" }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        style={{
          height: 44,
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "0 12px",
          borderRadius: 9999,
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 600,
          fontFamily: "var(--app-font-display)",
          ...styleOverride,
        }}
      >
        <span>📍</span>
        <span>{selectedCity}</span>
        <span style={{ 
          marginLeft: 2, 
          fontSize: 10,
          transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
          transition: "transform 0.2s",
        }}>▼</span>
      </button>
      
      {isOpen && (
        <div style={{
          position: "absolute",
          top: "calc(100% + 4px)",
          left: 0,
          minWidth: 140,
          background: thm.sectionBg,
          border: `1px solid ${thm.key === "gray" ? "#e0e0e0" : "hsl(var(--border))"}`,
          borderRadius: 8,
          boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          padding: "4px 0",
          zIndex: 1000,
        }}>
          {CITIES.map((city) => {
            const hasData = !!city.data_source;
            return (
              <button
                key={city.name}
                onClick={() => { onCityChange(city.name); setIsOpen(false); }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  width: "100%",
                  padding: "8px 12px",
                  minHeight: 44,
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: city.name === selectedCity ? 700 : 400,
                  color: hasData ? thm.textPrimary : thm.textMuted,
                  opacity: hasData ? 1 : 0.55,
                  textAlign: "left",
                }}
              >
                <span style={{ fontSize: 10 }}>
                  {city.name === selectedCity ? "●" : hasData ? "○" : "◌"}
                </span>
                <span>{city.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

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

/* ── Napkin chart — baseline / gap / recent ───────────────────── */
function NapkinChart({
  baselineWeeks, recentWeeks, height = 120, dateLabels,
}: {
  baselineWeeks: WeeklyAggregate[];
  recentWeeks:   WeeklyAggregate[];
  height?: number;
  dateLabels?: { bStart: string; bEnd: string; rStart: string; rEnd: string };
}) {
  const { theme: thm } = useTheme();

  /* measure actual rendered width so coordinates scale to fit exactly */
  const svgRef = useRef<SVGSVGElement>(null);
  const [W, setW] = useState(500);
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const obs = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setW(Math.round(w));
    });
    obs.observe(el);
    const init = el.getBoundingClientRect().width;
    if (init > 0) setW(Math.round(init));
    return () => obs.disconnect();
  }, []);

  const bLen = baselineWeeks.length;
  const rLen = recentWeeks.length;
  if (bLen + rLen < 2) return null;

  const allSpeeds = [
    ...baselineWeeks.map(w => w.avgSpeed),
    ...recentWeeks.map(w => w.avgSpeed),
  ].filter(s => s > 0);
  if (allSpeeds.length < 2) return null;

  const minS = Math.min(...allSpeeds);
  const maxS = Math.max(...allSpeeds);
  const range = maxS - minS || 1;

  const H = height;
  const PX = 0, PY = 8;
  const chartW = W - PX * 2;
  const chartH = H - PY * 2;
  const LABEL_H = dateLabels ? 18 : 0;
  const totalH  = H + LABEL_H;

  const hasGap = bLen > 0 && rLen > 0;

  const allWeeks = [...baselineWeeks, ...recentWeeks];
  const t0 = new Date(allWeeks[0].weekKey).getTime();
  const t1 = new Date(allWeeks[allWeeks.length - 1].weekKey).getTime();
  const tSpan = t1 - t0 || 1;
  const toX = (wk: string) => PX + ((new Date(wk).getTime() - t0) / tSpan) * chartW;

  const bXS = toX(baselineWeeks[0].weekKey);
  const bXE = toX(baselineWeeks[bLen - 1].weekKey);
  const rXS = hasGap ? toX(recentWeeks[0].weekKey) : PX;
  const rXE = W - PX;

  const toY = (s: number) => PY + chartH - ((s - minS) / range) * chartH;

  // Calculate averages for horizontal reference lines
  const baselineAvg = bLen > 0
    ? baselineWeeks.reduce((sum, w) => sum + w.avgSpeed, 0) / bLen
    : 0;
  const recentAvg = rLen > 0
    ? recentWeeks.reduce((sum, w) => sum + w.avgSpeed, 0) / rLen
    : 0;

  const pts = (weeks: WeeklyAggregate[]) =>
    weeks.length === 1
      ? `${toX(weeks[0].weekKey).toFixed(1)},${toY(weeks[0].avgSpeed).toFixed(1)} ${toX(weeks[0].weekKey).toFixed(1)},${toY(weeks[0].avgSpeed).toFixed(1)}`
      : weeks.map(w => `${toX(w.weekKey).toFixed(1)},${toY(w.avgSpeed).toFixed(1)}`).join(" ");

  const { baseline: BL, recent: RC, gap: GAP } = thm.napkin;
  const labelY = H + 13;

  /* stroke weight: gray theme uses weight to distinguish avg vs baseline */
  const baselineW = thm.key === "gray" ? 2 : 3.5;
  const recentW   = thm.key === "gray" ? 3.5 : 3.5;

  return (
    <svg ref={svgRef}
      role="img"
      viewBox={`0 0 ${W} ${totalH}`}
      style={{ width:"100%", height:totalH, display:"block", overflow: "visible" }}
      overflow="visible"
      preserveAspectRatio="xMidYMid meet">
      <title>Traffic speed trend chart</title>
      <desc>Line chart comparing baseline period speeds with recent speeds for the selected route.</desc>
      {bLen > 0 && (
        <polyline points={pts(baselineWeeks)}
          fill="none" stroke={BL} strokeWidth={baselineW}
          strokeLinejoin="round" strokeLinecap="round" />
      )}
      {rLen > 0 && (
        <polyline points={pts(recentWeeks)}
          fill="none" stroke={RC} strokeWidth={recentW}
          strokeLinejoin="round" strokeLinecap="round" />
      )}
      {hasGap && bLen > 0 && (
        <circle cx={bXE} cy={toY(baselineWeeks[bLen - 1].avgSpeed)} r={5} fill={BL} />
      )}
      {hasGap && rLen > 0 && (
        <circle cx={rXS} cy={toY(recentWeeks[0].avgSpeed)} r={5} fill={RC} />
      )}
      {dateLabels && bLen > 0 && (<>
        <line x1={bXS} y1={toY(baselineWeeks[0].avgSpeed)} x2={bXS} y2={H}
          stroke={BL} strokeWidth={1} strokeDasharray="3 3" opacity={0.4} />
        <text x={bXS} y={labelY} fontSize={9} fill={BL} opacity={0.8}
          textAnchor="start">{dateLabels.bStart}</text>
        <line x1={bXE} y1={toY(baselineWeeks[bLen - 1].avgSpeed)} x2={bXE} y2={H}
          stroke={BL} strokeWidth={1} strokeDasharray="3 3" opacity={0.4} />
        <text x={bXE} y={labelY} fontSize={9} fill={BL} opacity={0.8}
          textAnchor="end">{dateLabels.bEnd}</text>
      </>)}
      {dateLabels && rLen > 0 && (<>
        <line x1={rXS} y1={toY(recentWeeks[0].avgSpeed)} x2={rXS} y2={H}
          stroke={RC} strokeWidth={1} strokeDasharray="3 3" opacity={0.4} />
        <text x={rXS} y={labelY} fontSize={9} fill={RC} opacity={0.8}
          textAnchor="start">{dateLabels.rStart}</text>
        <line x1={rXE} y1={toY(recentWeeks[rLen - 1].avgSpeed)} x2={rXE} y2={H}
          stroke={RC} strokeWidth={1} strokeDasharray="3 3" opacity={0.4} />
        <text x={rXE} y={labelY} fontSize={9} fill={RC} opacity={0.8}
          textAnchor="end">{dateLabels.rEnd}</text>
      </>)}

      {/* Horizontal average reference lines */}
      {bLen > 0 && baselineAvg > 0 && (
        <line x1={bXS} y1={toY(baselineAvg)} x2={bXE} y2={toY(baselineAvg)}
          stroke={BL} strokeWidth={1.5} strokeDasharray="6 4" opacity={0.7} />
      )}
      {rLen > 0 && recentAvg > 0 && (
        <line x1={rXS} y1={toY(recentAvg)} x2={rXE} y2={toY(recentAvg)}
          stroke={RC} strokeWidth={1.5} strokeDasharray="6 4" opacity={0.7} />
      )}
      {/* Connector between average lines */}
      {hasGap && bLen > 0 && rLen > 0 && baselineAvg > 0 && recentAvg > 0 && (
        <line x1={bXE} y1={toY(baselineAvg)} x2={rXS} y2={toY(recentAvg)}
          stroke={GAP} strokeWidth={2} strokeDasharray="6 4" />
      )}
    </svg>
  );
}

/* ── Calendar widget ──────────────────────────────────────────── */
const CIRCLE_D = 38;
const DAY_HDR  = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

function parseYM(s: string) {
  const d = new Date(s + "T12:00:00");
  return { y: d.getFullYear(), m: d.getMonth() };
}

function CalendarWidget({
  dailyStats, fmtDur,
}: {
  dailyStats: Map<string, DayStats>;
  fmtDur: (n: number) => string;
}) {
  const { theme: thm } = useTheme();

  const allDates = useMemo(() => Array.from(dailyStats.keys()).sort(), [dailyStats]);
  const lastStr  = allDates[allDates.length - 1] ?? "";
  const firstStr = allDates[0] ?? "";

  const initYM = (() => {
    const base = lastStr ? parseYM(lastStr) : { y: new Date().getFullYear(), m: new Date().getMonth() };
    /* if today is before the 10th, default to the month before the most-recent data month */
    if (new Date().getDate() < 10) {
      if (base.m === 0) return { y: base.y - 1, m: 11 };
      return { y: base.y, m: base.m - 1 };
    }
    return base;
  })();
  const [calYear,  setCalYear]  = useState(initYM.y);
  const [calMonth, setCalMonth] = useState(initYM.m);
  const [fadeKey,  setFadeKey]  = useState(0);
  const [calOpen,  setCalOpen]  = useState(false);

  useEffect(() => {
    if (!lastStr) return;
    const base = parseYM(lastStr);
    if (new Date().getDate() < 10) {
      if (base.m === 0) { setCalYear(base.y - 1); setCalMonth(11); }
      else              { setCalYear(base.y);      setCalMonth(base.m - 1); }
    } else {
      setCalYear(base.y); setCalMonth(base.m);
    }
  }, [lastStr]);

  /* p10/p90 of full route dataset — gives visible colour spread across any month */
  const { p10, p90 } = useMemo(() => {
    const speeds = Array.from(dailyStats.values())
      .map(d => d.avgSpeed).filter(s => s > 0).sort((a, b) => a - b);
    if (speeds.length < 2) return { p10: 15, p90: 50 };
    const at = (pct: number) => {
      const idx = (pct / 100) * (speeds.length - 1);
      const lo  = Math.floor(idx), hi = Math.ceil(idx);
      return speeds[lo] + (speeds[hi] - speeds[lo]) * (idx - lo);
    };
    return { p10: at(10), p90: at(90) };
  }, [dailyStats]);

  /* ── Imperative tooltip ─────────────────────────────────────── */
  const tooltipRef  = useRef<HTMLDivElement>(null);
  const lastKeyRef  = useRef<string | null>(null);

  const hideTip = useCallback(() => {
    if (tooltipRef.current) tooltipRef.current.style.opacity = "0";
    lastKeyRef.current = null;
  }, []);

  const showTip = useCallback((dateKey: string, cellEl: HTMLElement) => {
    const el = tooltipRef.current;
    if (!el) return;
    const s = dailyStats.get(dateKey);
    if (!s) { hideTip(); return; }

    const date   = new Date(dateKey + "T12:00:00");
    const dayStr = date.toLocaleDateString("en-IN", { weekday:"short", day:"numeric", month:"short", year:"2-digit" });
    const rows   = ([
      ["⚡ Avg Speed",    `${s.avgSpeed} km/h`],
      ["🕐 Median Trip",  fmtDur(s.medianDuration)],
      ["🔥 Bad Day Trip", fmtDur(s.p95Duration)],
      ["📊 Trips",        String(s.count)],
    ] as [string,string][]).map(([lbl, val]) =>
      `<div style="display:flex;justify-content:space-between;gap:16px;font-size:11.5px;margin-bottom:3px">` +
      `<span style="color:#94A3B8">${lbl}</span>` +
      `<span style="font-weight:600;color:#F0F4F8">${val}</span></div>`
    ).join("");

    el.innerHTML =
      `<div style="background:#141A24;border-radius:12px;padding:11px 14px;` +
      `box-shadow:0 8px 32px rgba(0,0,0,0.55);">` +
      `<div style="font-weight:700;font-size:13px;margin-bottom:7px;color:#F0F4F8">${dayStr}</div>` +
      rows + `</div>` +
      `<div id="cal-tip-tail" style="position:absolute;width:0;height:0;pointer-events:none;"></div>`;

    const rect   = cellEl.getBoundingClientRect();
    const TW     = el.offsetWidth  || 200;
    const TH     = el.offsetHeight || 140;
    const TAIL   = 9;
    const GAP    = 8;
    const vw     = window.innerWidth;

    const rawLeft  = rect.left + rect.width / 2 - TW / 2;
    const left     = rawLeft + TW > vw - 8 ? Math.max(8, rect.right - TW) : Math.max(8, rawLeft);
    const wouldTop = rect.top - TH - TAIL - GAP;
    const isAbove  = wouldTop >= 0;
    const top      = isAbove ? wouldTop : rect.bottom + TAIL + GAP;

    const tailLeft = Math.max(14, Math.min(TW - 14, rect.left + rect.width / 2 - left));
    const tail = el.querySelector("#cal-tip-tail") as HTMLElement | null;
    if (tail) {
      tail.style.left      = tailLeft + "px";
      tail.style.transform = "translateX(-50%)";
      if (isAbove) {
        tail.style.bottom       = -TAIL + "px";
        tail.style.top          = "";
        tail.style.borderLeft   = "9px solid transparent";
        tail.style.borderRight  = "9px solid transparent";
        tail.style.borderTop    = `${TAIL}px solid #141A24`;
        tail.style.borderBottom = "";
      } else {
        tail.style.top          = -TAIL + "px";
        tail.style.bottom       = "";
        tail.style.borderLeft   = "9px solid transparent";
        tail.style.borderRight  = "9px solid transparent";
        tail.style.borderBottom = `${TAIL}px solid #141A24`;
        tail.style.borderTop    = "";
      }
    }

    el.style.left    = left + "px";
    el.style.top     = top  + "px";
    el.style.opacity = "1";
  }, [dailyStats, fmtDur, hideTip]);

  const handleGridMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const cell = (e.target as HTMLElement).closest<HTMLElement>("[data-dk]");
    if (!cell) { hideTip(); return; }
    const dk = cell.dataset.dk!;
    if (dk === lastKeyRef.current) return;
    lastKeyRef.current = dk;
    showTip(dk, cell);
  }, [showTip, hideTip]);

  /* ── Calendar math ──────────────────────────────────────────── */
  const prefixStr  = `${calYear}-${String(calMonth + 1).padStart(2, "0")}`;
  const firstDay   = (new Date(calYear, calMonth, 1).getDay() + 6) % 7; // Monday = 0
  const daysInMo   = new Date(calYear, calMonth + 1, 0).getDate();
  const monthLabel = new Date(calYear, calMonth, 1).toLocaleDateString("en-IN", { month:"long", year:"numeric" });

  const minMonthStr = firstStr ? firstStr.slice(0, 7) : prefixStr;
  const { y: ly, m: lm } = lastStr ? parseYM(lastStr) : { y: calYear, m: calMonth };
  const maxMonthStr = `${ly}-${String(lm + 1).padStart(2, "0")}`;
  const canBack = prefixStr > minMonthStr;
  const canFwd  = prefixStr < maxMonthStr;

  const prevMo = () => {
    setFadeKey(k => k + 1);
    if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11); }
    else setCalMonth(m => m - 1);
  };
  const nextMo = () => {
    setFadeKey(k => k + 1);
    if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0); }
    else setCalMonth(m => m + 1);
  };

  /* Memoised cells — always 42 cells (6 rows × 7 cols), no height jumping */
  const cells = useMemo(() => {
    const todayD   = new Date();
    const todayStr = `${todayD.getFullYear()}-${String(todayD.getMonth()+1).padStart(2,"0")}-${String(todayD.getDate()).padStart(2,"0")}`;
    const isCurrentMo = calYear === todayD.getFullYear() && calMonth === todayD.getMonth();

    /* reduce rgba/rgb color to 0.5 alpha for the stripe overlay */
    const fadeColor = (c: string) =>
      c.startsWith("rgba") ? c.replace(/,\s*[\d.]+\)$/, ", 0.5)")
      : c.startsWith("rgb(") ? c.replace("rgb(", "rgba(").replace(")", ", 0.5)")
      : c;

    const stripePattern = "repeating-linear-gradient(45deg,transparent,transparent 4px,rgba(255,255,255,0.4) 4px,rgba(255,255,255,0.4) 8px)";

    return Array.from({ length: 42 }, (_, i) => {
      const dayNum = i - firstDay + 1;

      /* outside the month — blank spacer cell, same height as a day cell */
      if (dayNum < 1 || dayNum > daysInMo) {
        return (
          <div key={`e${i}`} style={{ display:"flex", alignItems:"center",
            justifyContent:"center", padding:"5px 0" }}>
            <div style={{ width:CIRCLE_D, height:CIRCLE_D }} />
          </div>
        );
      }

      const dateKey  = `${prefixStr}-${String(dayNum).padStart(2,"0")}`;
      const s        = dailyStats.get(dateKey);
      const isFuture = isCurrentMo && dateKey > todayStr;
      const isPast   = isCurrentMo && dateKey <= todayStr;

      let circleStyle: React.CSSProperties;
      let txtClr: string;

      if (isCurrentMo) {
        if (isFuture) {
          /* future date — dashed outline, no fill */
          circleStyle = { border:`2px dashed ${thm.textMuted}`, background:"transparent" };
          txtClr = thm.textMuted;
        } else if (isPast && s) {
          /* past date with data — diagonal stripes over faded speed colour */
          const t = p90 > p10 ? Math.max(0, Math.min(1, (s.avgSpeed - p10) / (p90 - p10))) : 0.5;
          circleStyle = { background:`${stripePattern}, ${fadeColor(thm.calColor(s.avgSpeed, p10, p90))}` };
          txtClr = thm.calTextColor(t);
        } else {
          /* past date with no data — dashed grey outline */
          circleStyle = { border:`2px dashed ${thm.textMuted}`, background:"transparent" };
          txtClr = thm.textMuted;
        }
      } else {
        /* any other month — existing solid behaviour */
        if (s) {
          const t = p90 > p10 ? Math.max(0, Math.min(1, (s.avgSpeed - p10) / (p90 - p10))) : 0.5;
          circleStyle = { background: thm.calColor(s.avgSpeed, p10, p90), boxShadow:"0 2px 8px rgba(0,0,0,0.15)" };
          txtClr = thm.calTextColor(t);
        } else {
          circleStyle = { background: thm.emptyCalCircle };
          txtClr = thm.textMuted;
        }
      }

      return (
        <div
          key={dateKey}
          data-dk={s && !isFuture ? dateKey : undefined}
          style={{ display:"flex", alignItems:"center", justifyContent:"center",
            padding:"5px 0", cursor:(s && !isFuture) ? "pointer" : "default" }}
        >
          <div style={{ width:CIRCLE_D, height:CIRCLE_D, borderRadius:"50%",
            display:"flex", alignItems:"center", justifyContent:"center",
            transition:"transform 0.13s, box-shadow 0.13s",
            ...circleStyle,
          }}>
            <span style={{ fontSize:13, fontWeight:800, color:txtClr,
              lineHeight:1, userSelect:"none", opacity: isFuture ? 0.4 : 1 }}>
              {dayNum}
            </span>
          </div>
        </div>
      );
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dailyStats, firstDay, daysInMo, prefixStr, thm.key, p10, p90, calYear, calMonth]);

  const navBtn = (label: string, active: boolean, onClick: () => void) => (
    <button onClick={onClick} disabled={!active}
      style={{ background:"none", border:`1px solid ${thm.cardBorder}`,
        borderRadius:8, padding:"3px 11px", fontSize:18, lineHeight:1,
        cursor: active ? "pointer" : "default", opacity: active ? 1 : 0.3,
        color: thm.textPrimary }}>
      {label}
    </button>
  );

  const CAL_MUTED = thm.textMuted;

  return (
    <>
      <div style={{ position:"relative" }}>
        {/* ── Header row: title + chevron + (when open) month nav ── */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
          marginBottom: calOpen ? 14 : 0 }}>
          <button onClick={() => setCalOpen(o => !o)} style={{
            display:"flex", alignItems:"center", gap:8,
            background:"none", border:"none", cursor:"pointer", padding:0,
          }}>
            <p style={{ fontFamily:"var(--app-font-display)", fontWeight:700, fontSize:17,
              color: thm.textPrimary, margin:0 }}>📅 Daily Speeds by Month</p>
            <span style={{ fontSize:16, color: thm.textMuted, display:"inline-block",
              transform: calOpen ? "rotate(180deg)" : "rotate(0deg)",
              transition:"transform 0.2s ease" }}>▾</span>
          </button>
          {calOpen && (
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              {navBtn("‹", canBack, prevMo)}
              <span style={{ fontWeight:700, fontSize:14, color: thm.textPrimary,
                minWidth:150, textAlign:"center" }}>{monthLabel}</span>
              {navBtn("›", canFwd, nextMo)}
            </div>
          )}
        </div>

        {calOpen && (
          <>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", marginBottom:2 }}>
              {DAY_HDR.map(d => (
                <div key={d} style={{ textAlign:"center", fontSize:10, fontWeight:700,
                  textTransform:"uppercase", letterSpacing:"0.06em",
                  color: CAL_MUTED, padding:"4px 0" }}>{d}</div>
              ))}
            </div>

            <div key={fadeKey}
              onMouseMove={handleGridMove}
              onMouseLeave={hideTip}
              style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)",
                animation:"cal-fade-in 0.2s ease" }}>
              {cells}
            </div>

            <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:12,
              justifyContent:"flex-end", fontSize:11, color: CAL_MUTED }}>
              <span>Slow</span>
              <div style={{ width:88, height:7, borderRadius:4,
                background: thm.key === "gray"
                  ? "linear-gradient(90deg,#222,#888,#f0f0f0)"
                  : thm.key === "pastel"
                  ? "linear-gradient(90deg,rgba(224,106,62,0.9),rgba(246,231,200,0.9),rgba(111,174,99,0.9))"
                  : "linear-gradient(90deg,rgba(240,138,93,0.88),rgba(246,200,160,0.88),rgba(139,203,126,0.88))"
              }} />
              <span>Fast (km/h)</span>
            </div>
          </>
        )}
      </div>
      {createPortal(
        <div ref={tooltipRef} style={{
          position:"fixed", pointerEvents:"none",
          opacity:0, transition:"opacity 0.15s ease",
          zIndex:9999, overflow:"visible",
          fontFamily:"var(--app-font)", fontSize:12,
          top:0, left:0,
        }} />,
        document.body
      )}
    </>
  );
}

/* ── Traffic NOW! live overview panel ──────────────────────────── */
type LiveStatus = 'unusually-fast' | 'faster' | 'as-expected' | 'slower' | 'unusually-slower' | 'no-data';

// Statistics for a route's typical behavior at a given time-of-day
// Uses percentiles (industry standard) instead of std dev because traffic data is skewed
interface RouteTODStats {
  p05: number;
  p10: number;
  p15: number;
  p50: number;
  p85: number;
  p90: number;
  p95: number;
  count: number;
}

interface RouteCardData {
  label: string;
  origin: string;
  destination: string;
  // Live current reading
  liveSpeed: number | null;
  prevSpeed: number | null; // Second-most-recent reading, for trend animation
  liveTimestamp: Date | null;
  // Typical stats for this time-of-day (±90 min window over 90 days)
  typical: RouteTODStats | null;
  // Where this route falls on the city-wide range (for positioning)
  cityMin: number; // Slowest route in the city right now
  cityMax: number; // Fastest route in the city right now
  // Verdict
  status: LiveStatus;
  statusText: string; // "much faster", "faster", "as expected", "slower", "much slower", "no data"
  // Stable sorting
  sortKey: string;
  // Weather snapshot
  weather?: WeatherRow;
}

/** Compute live status based on percentiles - industry standard for traffic */
function computeLiveStatus(liveSpeed: number | null, typical: RouteTODStats | null): { status: LiveStatus; statusText: string } {
  if (liveSpeed === null || typical === null) {
    return { status: 'no-data', statusText: 'no data' };
  }
  if (liveSpeed >= typical.p95) return { status: 'unusually-fast', statusText: 'unusually fast' };
  if (liveSpeed >= typical.p85) return { status: 'faster', statusText: 'faster than typical' };
  if (liveSpeed > typical.p15)  return { status: 'as-expected', statusText: 'typical' };
  if (liveSpeed >= typical.p05) return { status: 'slower', statusText: 'slower than typical' };
  return { status: 'unusually-slower', statusText: 'unusually slow' };
}

/** Compute TOD statistics from historical data within ±90 min window over 90 days */
function computeTODStats(
  routeRows: TrafficRow[],
  referenceTime: Date,
  daysBack: number = 90,
  windowMinutes: number = 90,
): RouteTODStats | null {
  const cutoff = new Date(referenceTime.getTime() - daysBack * 24 * 60 * 60 * 1000);
  const refHour = referenceTime.getHours();
  const refMin = referenceTime.getMinutes();
  const refTimeVal = refHour * 60 + refMin;
  
  // Filter to rows within ±windowMinutes of the reference time
  const relevantRows = routeRows.filter(r => {
    if (r.timestamp < cutoff) return false;
    const rowHour = r.timestamp.getHours();
    const rowMin = r.timestamp.getMinutes();
    const rowTimeVal = rowHour * 60 + rowMin;
    // Handle wraparound at midnight
    let diff = Math.abs(rowTimeVal - refTimeVal);
    if (diff > 720) diff = 1440 - diff; // Adjust for crossing midnight
    return diff <= windowMinutes;
  });
  
  if (relevantRows.length < 3) return null;
  
  // Sort speeds for percentile calculation
  const speeds = relevantRows.map(r => r.speed_kmh).sort((a, b) => a - b);
  const n = speeds.length;
  
  // Percentile calculation using linear interpolation
  const percentile = (p: number) => {
    const idx = (p / 100) * (n - 1);
    const lower = Math.floor(idx);
    const upper = Math.ceil(idx);
    const weight = idx - lower;
    if (upper >= n) return speeds[n - 1];
    return speeds[lower] * (1 - weight) + speeds[upper] * weight;
  };
  
  return {
    p05: percentile(5),
    p10: percentile(10),
    p15: percentile(15),
    p50: percentile(50),  // Median
    p85: percentile(85),
    p90: percentile(90),
    p95: percentile(95),
    count: n,
  };
}

function computeAllRouteCards(
  allRows: TrafficRow[],
  routeOptions: string[],
  routes: { label_short: string; label_full: string; route_code?: string }[],
  weatherMap?: Map<string, WeatherRow>,
): RouteCardData[] {
  // Find the most recent data timestamp across all routes
  const lastTs = allRows.reduce((mx, r) => Math.max(mx, r.timestamp.getTime()), 0);
  const lastDataDate = lastTs ? new Date(lastTs) : new Date();
  const ninetyDaysAgo = new Date(lastDataDate.getTime() - 90 * 24 * 60 * 60 * 1000);
  
  // First pass: compute all route data
  const preliminaryCards = routeOptions.map((label) => {
    const routeRows = allRows.filter(r => r.label_short === label);
    
    // Extract origin/destination
    const labelFull = routes.find(r => r.label_short === label)?.label_full ?? label;
    const arrowIdx = labelFull.indexOf("→");
    const origin = arrowIdx > 0 ? labelFull.slice(0, arrowIdx).trim() : label;
    const destination = arrowIdx > 0 ? labelFull.slice(arrowIdx + 1).trim() : "";
    
    // Get most recent reading (live speed) and the one before it (for trend)
    const recentRows = routeRows.filter(r => r.timestamp >= ninetyDaysAgo);
    const sorted = recentRows.slice().sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    const mostRecent = sorted[0] ?? null;
    const prevReading = sorted[1] ?? null;
    const liveSpeed = mostRecent ? mostRecent.speed_kmh : null;
    const prevSpeed = prevReading ? prevReading.speed_kmh : null;
    const liveTimestamp = mostRecent ? mostRecent.timestamp : null;
    
    // Compute typical stats for this TOD (±90 min over 90 days)
    const typical = computeTODStats(routeRows, lastDataDate, 90, 90);
    
    return {
      label, origin, destination,
      liveSpeed, prevSpeed, liveTimestamp, typical,
      sortKey: label.toLowerCase(),
    };
  });
  
  // Second pass: compute city-wide min/max from live speeds AND typical ranges
  const liveSpeeds = preliminaryCards
    .map(c => c.liveSpeed)
    .filter((s): s is number => s !== null);
  const cityMin = liveSpeeds.length > 0 ? Math.min(...liveSpeeds) : 0;
  const cityMax = liveSpeeds.length > 0 ? Math.max(...liveSpeeds) : 80;
  
  // Also consider p05/p95 from all routes' typical data so bars never overflow
  const allP05 = preliminaryCards.map(c => c.typical?.p05).filter((v): v is number => v != null);
  const allP95 = preliminaryCards.map(c => c.typical?.p95).filter((v): v is number => v != null);
  const typicalMin = allP05.length > 0 ? Math.min(...allP05) : cityMin;
  const typicalMax = allP95.length > 0 ? Math.max(...allP95) : cityMax;
  
  // Scale encompasses live speeds + typical ranges, with 1 km/h padding
  const effectiveMin = Math.min(cityMin, typicalMin) - 1;
  const effectiveMax = Math.max(cityMax, typicalMax) + 1;
  
  // Final pass: compute status and build final cards
  const cards: RouteCardData[] = preliminaryCards.map(card => {
    const { status, statusText } = computeLiveStatus(card.liveSpeed, card.typical);
    const routeObj = routes.find(r => r.label_short === card.label);
    const weather = routeObj?.route_code ? weatherMap?.get(routeObj.route_code) : undefined;
    
    return {
      label: card.label,
      origin: card.origin,
      destination: card.destination,
      liveSpeed: card.liveSpeed,
      prevSpeed: card.prevSpeed,
      liveTimestamp: card.liveTimestamp,
      typical: card.typical,
      cityMin: effectiveMin,
      cityMax: effectiveMax,
      status,
      statusText,
      sortKey: card.sortKey,
      weather,
    };
  });
  
  return cards;
}

/* ── Main dashboard (inner — consumes ThemeContext) ───────────── */
function DashboardInner() {
  const { theme: thm, themeKey, nextThemeKey, cycleTheme } = useTheme();
  const isMobile = useIsMobile();
  const liveRef = useRef<HTMLDivElement>(null);

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
  const [sliderVals,  setSliderVals]  = useState<[number,number]>([0,0]);
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
  useEffect(() => {
    setShowIntro(true);
    setShowCar(true);
    const t1 = setTimeout(() => setShowIntro(false), 2500);      /* reveal cards */
    const t2 = setTimeout(() => setShowCar(false),   2500 + 650); /* then remove car */
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [selectedCity]);  /* re-run on every city switch */

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

  /* ── Time Travel ──────────────────────────────────────────────── */
  const [timeTravelDate, setTimeTravelDate] = useState<Date | null>(null);
  const [timeTravelOpen, setTimeTravelOpen] = useState(false);

  /* data */
  const { routes, allRows, loading, error, rowCount, lastUpdated, dataTimestamp, refresh } =
    useTrafficData(citySource ?? null, timeTravelDate);
  const liveWeatherMap = useWeatherData();

  /* When time-travelling, derive a synthetic weather map from the historical rows;
     otherwise use the live snapshot. */
  const displayRows = useMemo(
    () => timeTravelDate
      ? allRows.filter(r => r.timestamp <= timeTravelDate)
      : allRows,
    [allRows, timeTravelDate],
  );
  const weatherMap = useMemo(
    () => timeTravelDate
      ? buildWeatherMapFromRows(displayRows)
      : liveWeatherMap,
    [timeTravelDate, displayRows, liveWeatherMap],
  );

  /* Reset time travel when switching cities */
  useEffect(() => { setTimeTravelDate(null); }, [selectedCity]);

  /* Close time-travel popover on Escape or click-outside */
  useEffect(() => {
    if (!timeTravelOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setTimeTravelOpen(false); };
    const onClick = (e: MouseEvent) => {
      const target = e.target as Element;
      if (!target.closest("[data-tt-popover]")) setTimeTravelOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [timeTravelOpen]);

  // Announce data state changes to screen readers
  useEffect(() => {
    if (loading) announce("Loading traffic data…");
    else if (error) announce("Error loading traffic data: " + error);
    else if (rowCount > 0) announce("Traffic data loaded for " + selectedCity + ". " + rowCount.toLocaleString() + " rows.");
  }, [loading, error, rowCount, selectedCity, announce]);

  const routeOptions = useMemo(() => {
    const labels = Array.from(new Set(allRows.map(r => r.label_short))).sort();
    return labels.length ? labels : ["Old Airport Road"];
  }, [allRows]);

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
  const allRouteWeeks = useAllRouteWeeks(displayRows, selectedRoute, tod);

  useEffect(() => {
    if (allRouteWeeks.length === 0) return;
    // If user has manually set the slider, don't reset it on tod/period changes
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
    const cfgStart = cfg.defaults.baseline_start;
    const cfgEnd   = cfg.defaults.baseline_end;
    let leftIdx  = 0;
    let rightIdx = Math.max(0, Math.floor(maxI * 0.5));
    if (cfgStart) {
      const idx = allRouteWeeks.findIndex(w => w.weekKey >= cfgStart);
      if (idx >= 0) leftIdx = idx;
    }
    if (cfgEnd) {
      let idx = -1;
      for (let i = allRouteWeeks.length - 1; i >= 0; i--) {
        if (allRouteWeeks[i].weekKey <= cfgEnd) { idx = i; break; }
      }
      if (idx >= 0) rightIdx = idx;
    }
    setSliderVals([Math.min(leftIdx, rightIdx), Math.max(leftIdx, rightIdx)]);
  }, [tod, allRouteWeeks.length, sliderManuallySet]);

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
    const url = `${window.location.origin}${window.location.pathname}?${p.toString()}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2000);
    });
  }, [selectedCity, selectedRoute, tod, period, questionMode, themeKey, safeLeft, safeRight, zoomIdx, chartGranularity, chartView]);

  const lastDataMs = useMemo(
    () => allRows.reduce((max, r) => Math.max(max, r.timestamp.getTime()), 0),
    [allRows],
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
  const prevBaselineKeyForPane = useRef("");

  useEffect(() => {
    if (displayRows.length === 0) return;
    const key = `${baselineStartDate}|${baselineEndDate}|${timeTravelDate?.toISOString() ?? ""}`;
    if (allRouteCardsRef.current && key === prevBaselineKeyForPane.current && weatherMap.size === 0) return;
    const computed = computeAllRouteCards(displayRows, routeOptions, routes, weatherMap);
    allRouteCardsRef.current = computed;
    setAllRouteCards(computed);
    prevBaselineKeyForPane.current = key;
  }, [displayRows, routeOptions, baselineStartDate, baselineEndDate, weatherMap, timeTravelDate]);

  /* ── Route cycling in pane order ───────────────────────────────── */
  const routeOrder = useMemo(() => {
    if (allRouteCards && allRouteCards.length > 0) return allRouteCards.map(c => c.label);
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

  const dailyStats = useDailyStatsAllDay(displayRows, selectedRoute);
  const { merged, dailyData, selectedStats } = useFilteredData(displayRows, selectedRoute, period, tod);

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
    const { percentile: pctFn } = (() => {
      function pct(sorted: number[], p: number): number {
        if (!sorted.length) return 0;
        const idx = (p / 100) * (sorted.length - 1);
        const lo = Math.floor(idx), hi = Math.ceil(idx);
        return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
      }
      return { percentile: pct };
    })();

    const routeRows = allRows.filter(r => r.label_short === selectedRoute);

    // Helper: build IntervalDatum[] from a slice of WeeklyAggregates
    function buildBands(weeks: WeeklyAggregate[]): IntervalDatum[] {
      return weeks.map(w => {
        const wStart = new Date(w.weekKey);
        const wEnd   = new Date(wStart.getTime() + 7 * 86400000);
        const wRows  = routeRows.filter(r => r.timestamp >= wStart && r.timestamp < wEnd);
        const speeds = wRows.map(r => r.speed_kmh).sort((a, b) => a - b);
        if (speeds.length < 3) {
          // Fallback: use avgSpeed as a flat band ±5%
          const s = w.avgSpeed || 0;
          return { x: w.weekKey, p05: s * 0.9, p15: s * 0.95, p50: s, p85: s * 1.05, p95: s * 1.1 };
        }
        return {
          x: w.weekKey,
          p05: Math.round(pctFn(speeds, 5)  * 10) / 10,
          p15: Math.round(pctFn(speeds, 15) * 10) / 10,
          p50: Math.round(pctFn(speeds, 50) * 10) / 10,
          p85: Math.round(pctFn(speeds, 85) * 10) / 10,
          p95: Math.round(pctFn(speeds, 95) * 10) / 10,
        };
      });
    }

    // Recent window data (the primary "now" view)
    const recentData = buildBands(recentWeeks.length > 0 ? recentWeeks : allRouteWeeks.slice(-12));
    // Baseline data for compare mode
    const baselineData = buildBands(baselineWeeks.length > 0 ? baselineWeeks : []);

    return { trafficNowData: recentData, trafficNowCompare: baselineData };
  }, [allRows, selectedRoute, recentWeeks, baselineWeeks, allRouteWeeks]);

  // Map app theme to UncertaintyBandChart ViewingMode
  const tnMode: ViewingMode = themeKey === "gray" ? "grayscale" : "default";
  const [tnOpen, setTnOpen] = useState(false);

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
    border: thm.cardBorder,
    boxShadow: thm.cardShadow,
    borderRadius:18,
    padding:"16px 18px",
    display:"flex", flexDirection:"column", gap:4,
  };

  /* ── Theme toggle button style ──────────────────────────────── */
  const nextMeta = THEME_META[nextThemeKey];
  const curMeta  = THEME_META[themeKey];

  /* ── Render ─────────────────────────────────────────────────── */
  return (
    <div className={thm.isDark ? "dark" : ""}>
      <div aria-live="polite" aria-atomic="true" ref={liveRef} className="sr-only" />
      <div className="transition-colors" style={{ background: thm.bodyBg, display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>

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
            {/* Left: Logo + Location */}
            <div style={{ display:"flex", alignItems:"center", gap:10, flexShrink:0 }}>
              <img
                src="/trafficoracle-light.png"
                alt="TraffiCOracle"
                width={120}
                height={32}
                style={{ height:32, width:"auto", flexShrink:0 }}
              />
              <LocationDropdown thm={thm} selectedCity={selectedCity} onCityChange={setSelectedCity} />
            </div>

            {/* Right: Share + Refresh + Theme */}
            <div style={{ display:"flex", alignItems:"center", gap:8, flexShrink:0 }}>
              {/* ── Time Travel pill ──────────────────────────── */}
              {!loading && rowCount > 0 && (() => {
                const minDateStr = allRows[0]
                  ? allRows[0].timestamp.toISOString().slice(0, 10)
                  : "";
                const maxDateStr = allRows[allRows.length - 1]
                  ? allRows[allRows.length - 1].timestamp.toISOString().slice(0, 10)
                  : "";
                const ttDateStr = timeTravelDate
                  ? timeTravelDate.toISOString().slice(0, 10)
                  : "";
                const isActive = timeTravelDate !== null;
                return (
                  <div style={{ position: "relative" }} key="time-travel" data-tt-popover>
                    <button
                      onClick={() => setTimeTravelOpen(o => !o)}
                      className={isActive ? "time-travel-glow" : ""}
                      title={isActive ? `Time travelling to ${ttDateStr}` : "Time Travel"}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                        height: 44, borderRadius: 9999, padding: "0 14px",
                        border: `1px solid ${isActive ? "transparent" : thm.key === "gray" ? "#e0e0e0" : "hsl(var(--border))"}`,
                        background: isActive
                          ? "linear-gradient(135deg,#6366f1,#a855f7,#ec4899)"
                          : thm.key === "colour" ? "#141A24" : "transparent",
                        color: isActive ? "#fff" : thm.textMuted,
                        cursor: "pointer",
                        fontFamily: "var(--app-font-display)",
                        fontSize: 11, fontWeight: 600,
                        transition: "background 0.3s, color 0.3s",
                      }}
                    >
                      <span>⏪</span>
                      <span>{isActive ? ttDateStr : "Time Travel"}</span>
                    </button>
                    {timeTravelOpen && (
                      <div style={{
                        position: "absolute", top: "calc(100% + 8px)", right: 0,
                        zIndex: 600,
                        background: thm.paneBg,
                        border: `1px solid ${thm.key === "gray" ? "#e0e0e0" : "hsl(var(--border))"}`,
                        borderRadius: "1rem",
                        padding: "1rem",
                        boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
                        minWidth: 240,
                      }}>
                        <p style={{ margin: "0 0 0.6rem", fontSize: 11, fontWeight: 700,
                          color: thm.textMuted, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                          Travel back in time
                        </p>
                        <input
                          type="date"
                          min={minDateStr}
                          max={maxDateStr}
                          value={ttDateStr}
                          onChange={e => {
                            const v = e.target.value;
                            if (v) {
                              /* End of the selected day */
                              const d = new Date(`${v}T23:59:59`);
                              setTimeTravelDate(d);
                            }
                          }}
                          style={{
                            width: "100%", padding: "0.5rem 0.75rem",
                            borderRadius: "0.5rem",
                            border: `1px solid ${thm.key === "gray" ? "#e0e0e0" : "hsl(var(--border))"}`,
                            background: thm.sectionBg, color: thm.textPrimary,
                            fontSize: 13, fontFamily: "var(--app-font-display)",
                            cursor: "pointer",
                          }}
                        />
                        <div style={{ display: "flex", gap: 8, marginTop: "0.75rem" }}>
                          {isActive && (
                            <button
                              onClick={() => { setTimeTravelDate(null); setTimeTravelOpen(false); }}
                              style={{
                                flex: 1, padding: "0.4rem 0",
                                borderRadius: "0.5rem",
                                border: `1px solid ${thm.key === "gray" ? "#e0e0e0" : "hsl(var(--border))"}`,
                                background: "transparent", color: thm.textMuted,
                                fontSize: 11, fontWeight: 600, cursor: "pointer",
                              }}
                            >
                              Return to now
                            </button>
                          )}
                          <button
                            onClick={() => setTimeTravelOpen(false)}
                            style={{
                              flex: 1, padding: "0.4rem 0",
                              borderRadius: "0.5rem",
                              border: "none",
                              background: "linear-gradient(135deg,#6366f1,#a855f7)",
                              color: "#fff",
                              fontSize: 11, fontWeight: 600, cursor: "pointer",
                            }}
                          >
                            {isActive ? "Done" : "Close"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
              {!loading && rowCount > 0 && (
                <button onClick={handleShare} style={{
                  display:"flex", alignItems:"center", justifyContent:"center", gap:5,
                  border:`1px solid ${thm.key==="gray"?"#e0e0e0":"hsl(var(--border))"}`,
                  borderRadius:9999, height:44, padding:"0 14px",
                  color: copied ? thm.speedGood : thm.textMuted,
                  background: copied ? "rgba(111,174,99,0.1)" : thm.key==="colour" ? "#141A24" : "transparent",
                  cursor:"pointer", transition:"color 0.2s, background 0.2s",
                }} title="Copy shareable link">
                  <Share2 size={13} />
                  <span style={{ fontFamily:"var(--app-font-display)", fontSize:11, fontWeight:600, lineHeight:1 }}>
                    {copied ? "Copied!" : "Share"}
                  </span>
                </button>
              )}
              {/* Size +/- */}
              <div style={{
                display:"flex", alignItems:"center",
                border:`1px solid ${thm.key==="gray"?"#e0e0e0":"hsl(var(--border))"}`,
                borderRadius:9999, height:44, overflow:"hidden",
                background: thm.key==="colour" ? "#141A24" : "transparent",
              }}>
                <button onClick={zoomOut} disabled={zoomIdx === 0}
                  title="Decrease size"
                  style={{
                    display:"flex", alignItems:"center", justifyContent:"center",
                    width:32, height:44, border:"none", background:"transparent",
                    color: thm.textMuted, cursor: zoomIdx === 0 ? "default" : "pointer",
                    opacity: zoomIdx === 0 ? 0.3 : 1,
                  }}>
                  <Minus size={13} />
                </button>
                <span style={{
                  fontFamily:"var(--app-font-display)", fontSize:11, fontWeight:600,
                  color: thm.textSecondary, lineHeight:1, minWidth:32, textAlign:"center",
                  userSelect:"none",
                }}>
                  {Math.round(ZOOM_STEPS[zoomIdx] * 100)}%
                </span>
                <button onClick={zoomIn} disabled={zoomIdx === ZOOM_STEPS.length - 1}
                  title="Increase size"
                  style={{
                    display:"flex", alignItems:"center", justifyContent:"center",
                    width:32, height:44, border:"none", background:"transparent",
                    color: thm.textMuted, cursor: zoomIdx === ZOOM_STEPS.length - 1 ? "default" : "pointer",
                    opacity: zoomIdx === ZOOM_STEPS.length - 1 ? 0.3 : 1,
                  }}>
                  <Plus size={13} />
                </button>
              </div>
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
                <span style={{ fontFamily:"var(--app-font-display)", fontSize:11, fontWeight:600,
                  color: thm.textSecondary, lineHeight:1, whiteSpace:"nowrap" }}>
                  {curMeta.label}
                </span>
              </button>
            </div>
          </div>
        </header>

        {/* ── Below-header area: main content + route pane ─────────── */}
        <div style={{ display: "flex", flex: 1, minHeight: 0 }}>

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

          {/* ── City 404 overlay — shown only after animation finishes ── */}
          {!citySource && !showCar && (
            <div style={{
              position: "absolute", inset: 0, zIndex: 100,
              display: "flex", alignItems: "center", justifyContent: "center",
              padding: "2rem",
              background: thm.paneBg,
            }}>
              <div style={{
                maxWidth: 480,
                textAlign: "center",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "1.25rem",
              }}>
                {/* Route logo */}
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"
                  style={{ width: 224, height: 224, fill: thm.textMuted, flexShrink: 0 }}>
                  <path d="M 263.93798449612405 3.9689922480620154 Q 256 0 248.06201550387595 3.9689922480620154 L 227.2248062015504 16.868217054263567 L 227.2248062015504 16.868217054263567 Q 202.41860465116278 30.75968992248062 175.62790697674419 31.751937984496124 Q 147.84496124031008 33.736434108527135 123.03875968992249 20.837209302325583 Q 109.14728682170542 13.891472868217054 95.25581395348837 17.86046511627907 Q 81.36434108527132 20.837209302325583 72.43410852713178 32.74418604651163 L 48.62015503875969 64.49612403100775 L 48.62015503875969 64.49612403100775 Q 31.751937984496124 88.31007751937985 45.64341085271318 113.11627906976744 Q 65.48837209302326 148.8372093023256 65.48837209302326 190.51162790697674 L 65.48837209302326 203.4108527131783 L 65.48837209302326 203.4108527131783 Q 65.48837209302326 237.14728682170542 52.58914728682171 267.90697674418607 L 41.674418604651166 296.6821705426357 L 41.674418604651166 296.6821705426357 Q 33.736434108527135 316.52713178294573 33.736434108527135 338.3565891472868 Q 33.736434108527135 371.1007751937984 51.5968992248062 397.8914728682171 Q 68.46511627906976 424.6821705426357 98.23255813953489 438.5736434108527 L 249.05426356589146 509.0232558139535 L 249.05426356589146 509.0232558139535 Q 256 512 262.94573643410854 509.0232558139535 L 413.7674418604651 438.5736434108527 L 413.7674418604651 438.5736434108527 Q 443.5348837209302 424.6821705426357 460.4031007751938 397.8914728682171 Q 478.26356589147287 371.1007751937984 478.26356589147287 338.3565891472868 Q 478.26356589147287 316.52713178294573 470.3255813953488 296.6821705426357 L 459.4108527131783 267.90697674418607 L 459.4108527131783 267.90697674418607 Q 446.51162790697674 237.14728682170542 446.51162790697674 203.4108527131783 L 446.51162790697674 190.51162790697674 L 446.51162790697674 190.51162790697674 Q 446.51162790697674 148.8372093023256 467.3488372093023 113.11627906976744 Q 480.2480620155039 88.31007751937985 464.3720930232558 64.49612403100775 L 439.5658914728682 32.74418604651163 L 439.5658914728682 32.74418604651163 Q 430.6356589147287 20.837209302325583 416.74418604651163 17.86046511627907 Q 402.85271317829455 13.891472868217054 388.9612403100775 20.837209302325583 Q 364.15503875968994 33.736434108527135 336.3720930232558 31.751937984496124 Q 309.5813953488372 30.75968992248062 284.7751937984496 16.868217054263567 L 263.93798449612405 3.9689922480620154 L 263.93798449612405 3.9689922480620154 Z M 243.10077519379846 43.65891472868217 L 256 36.713178294573645 L 243.10077519379846 43.65891472868217 L 256 36.713178294573645 L 268.8992248062016 43.65891472868217 L 268.8992248062016 43.65891472868217 Q 300.6511627906977 62.51162790697674 335.37984496124034 63.50387596899225 Q 371.1007751937984 65.48837209302326 403.84496124031006 49.6124031007752 Q 409.7984496124031 46.63565891472868 414.7596899224806 51.5968992248062 L 438.5736434108527 84.34108527131782 L 438.5736434108527 84.34108527131782 Q 442.5426356589147 90.29457364341086 439.5658914728682 97.24031007751938 Q 422.69767441860466 127.0077519379845 416.74418604651163 160.74418604651163 L 95.25581395348837 160.74418604651163 L 95.25581395348837 160.74418604651163 Q 89.30232558139535 127.0077519379845 72.43410852713178 97.24031007751938 Q 68.46511627906976 90.29457364341086 73.42635658914729 84.34108527131782 L 97.24031007751938 51.5968992248062 L 97.24031007751938 51.5968992248062 Q 102.2015503875969 46.63565891472868 109.14728682170542 49.6124031007752 Q 140.89922480620154 65.48837209302326 176.6201550387597 64.49612403100775 Q 211.34883720930233 62.51162790697674 243.10077519379846 44.651162790697676 L 243.10077519379846 43.65891472868217 Z M 97.24031007751938 192.49612403100775 L 414.7596899224806 192.49612403100775 L 97.24031007751938 192.49612403100775 L 414.7596899224806 192.49612403100775 L 414.7596899224806 203.4108527131783 L 414.7596899224806 203.4108527131783 Q 414.7596899224806 243.10077519379846 429.6434108527132 279.8139534883721 L 440.5581395348837 308.5891472868217 L 440.5581395348837 308.5891472868217 Q 446.51162790697674 322.48062015503876 446.51162790697674 338.3565891472868 Q 446.51162790697674 361.1782945736434 433.61240310077517 381.0232558139535 Q 421.70542635658916 399.8759689922481 400.86821705426354 409.7984496124031 L 256 476.27906976744185 L 256 476.27906976744185 L 112.12403100775194 409.7984496124031 L 112.12403100775194 409.7984496124031 Q 90.29457364341086 399.8759689922481 78.3875968992248 381.0232558139535 Q 65.48837209302326 361.1782945736434 65.48837209302326 338.3565891472868 Q 65.48837209302326 322.48062015503876 71.44186046511628 308.5891472868217 L 82.35658914728683 279.8139534883721 L 82.35658914728683 279.8139534883721 Q 97.24031007751938 243.10077519379846 97.24031007751938 203.4108527131783 L 97.24031007751938 192.49612403100775 L 97.24031007751938 192.49612403100775 Z" />
                </svg>
                {/* Title */}
                <p style={{
                  fontFamily: "var(--app-font-display)",
                  fontWeight: 900,
                  fontSize: "clamp(1.6rem, 5vw, 2.4rem)",
                  lineHeight: 1.1,
                  color: thm.textPrimary,
                  margin: 0,
                  letterSpacing: "-0.02em",
                }}>Route 404</p>
                {/* Message */}
                <p style={{
                  fontSize: 14,
                  lineHeight: 1.8,
                  color: thm.textSecondary,
                  margin: 0,
                  maxWidth: 400,
                }}>
                  Sorry, this city page isn't ready yet. A good city view needs thoughtful route
                  selection and reliable on-ground data. If you're a pro at being stuck in{" "}
                  <strong style={{ color: thm.textPrimary }}>{selectedCity}</strong>{" "}
                  traffic, perhaps we could collaborate on building the dashboard together.
                </p>
                {/* CTA button */}
                <a
                  href="https://thecontrarian.in/#contact"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    marginTop: 4,
                    padding: "10px 22px",
                    borderRadius: 9999,
                    fontSize: 12,
                    fontWeight: 700,
                    fontFamily: "var(--app-font-display)",
                    background: thm.key === "colour" ? "rgba(255,255,255,0.12)" : thm.sectionBg,
                    color: thm.textPrimary,
                    border: `1.5px solid ${thm.key === "gray" ? "#d0d0d0" : "hsl(var(--border))"}`,
                    textDecoration: "none",
                    transition: "opacity 0.15s",
                  }}
                >
                  Get in touch →
                </a>
              </div>
            </div>
          )}

          <div style={{
            maxWidth: isMobile ? "100%" : 1320,
            margin: "0 auto",
            padding: isMobile ? "1.5rem 1rem 2rem" : "1.5rem 1.5rem 2rem",
            display: "flex",
            flexDirection: "column",
            gap: "1.5rem",
            visibility: citySource ? "visible" : "hidden",
          }}>

          {/* ── Hero question ────────────────────────────────── */}
          <div className="animate-bounce-in" style={{ textAlign:"center", padding:"1.5rem 1rem 0.25rem",
            opacity: showIntro ? 0 : 1,
            animation: showIntro ? "none" : "cards-reveal 0.5s ease both",
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

          {!loading && !error && rowCount > 0 && (
            <>
              {/* ── Baseline slider ──────────────────────────── */}
              {allRouteWeeks.length > 1 && (
                <div className="animate-fade-in" style={{
                  background: showIntro ? "transparent" : thm.sectionBg,
                  border: showIntro ? "none" : thm.cardBorder,
                  boxShadow: showIntro ? "none" : thm.cardShadow,
                  borderRadius:"1.5rem",
                  padding: "1.25rem 1.5rem 1rem",
                  position:"relative", overflow:"hidden",
                }}>
                  {showSparkle && <Sparkles />}

                  <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 14,
                    opacity: showIntro ? 0 : 1,
                  }}>
                    <p style={{ fontFamily:"var(--app-font-display)", fontWeight:700, fontSize:15,
                      color: thm.textPrimary, margin: 0 }}>
                      Compare with this earlier period 
                    </p>
                    <InfoTip thm={thm}>{TOOLTIP_CONTENT.baselineSlider.body}</InfoTip>
                  </div>

                  <div style={{ padding:"28px 0 4px", position:"relative" }}>
                    {/* ── Intro car races along the slider track ── */}
                    {showCar && trackW > 0 && (
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
                          /* Wrapper is 28px top-pad + 40px slider + 4px bottom = 72px.
                             Track centreline is at 48px. Float car just above it. */
                          top: "-20px",
                          zIndex: 50,
                          pointerEvents: "none",
                          /* Start: right edge of left thumb (thumb=22px, centre at leftPct%) */
                          "--car-from": `calc(${leftPct}% + 11px + 4px)`,
                          /* Stop: left edge of right thumb minus car width and gap */
                          "--car-to": `calc(${rightPct}% - 11px - 72px - 0px)`,
                          animation: "track-run 2.5s ease-in-out forwards",
                        } as React.CSSProperties}
                      >
                        <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" />
                        <circle cx="7" cy="17" r="2" />
                        <path d="M9 17h6" />
                        <circle cx="17" cy="17" r="2" />
                      </svg>
                    )}
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
                        {/* Selected baseline window */}
                        <div style={{
                          position:"absolute", top:0,
                          left:`${leftTrackPct}%`,
                          width:`${Math.max(0, rightTrackPct - leftTrackPct)}%`,
                          height:"100%",
                          background: thm.slider.track,
                          pointerEvents:"none",
                        }} />
                        {/* Right unselected segment */}
                        <div style={{
                          position:"absolute", top:0, left:`${rightTrackPct}%`,
                          width:`${100 - rightTrackPct}%`, height:"100%",
                          background: thm.slider.rail, pointerEvents:"none",
                        }} />
                        <SliderPrimitive.Range style={{ display:"none" }} />
                      </SliderPrimitive.Track>

                      {/* Left thumb */}
                      <SliderPrimitive.Thumb
                        className="slider-thumb"
                        onPointerDown={() => setDragThumb(0)}
                        style={{ display:"flex", alignItems:"center", justifyContent:"center",
                          width:22, height:40, background:"transparent",
                          border:"none", outline:"none", cursor:"grab", zIndex:10, flexShrink:0 }}
                      >
                        <span style={{
                          display:"block", width:7, height:28, borderRadius:9999,
                          background: thm.slider.thumbFg,
                          border:`2px solid ${thm.slider.thumbBorder}`,
                          boxShadow: thm.slider.thumbShadow,
                        }} />
                      </SliderPrimitive.Thumb>

                      {/* Right thumb */}
                      <SliderPrimitive.Thumb
                        className="slider-thumb"
                        onPointerDown={() => setDragThumb(1)}
                        style={{ display:"flex", alignItems:"center", justifyContent:"center",
                          width:22, height:40, background:"transparent",
                          border:"none", outline:"none", cursor:"grab", zIndex:10, flexShrink:0 }}
                      >
                        <span style={{
                          display:"block", width:7, height:28, borderRadius:9999,
                          background: thm.slider.thumbFg,
                          border:`2px solid ${thm.slider.thumbBorder}`,
                          boxShadow: thm.slider.thumbShadow,
                        }} />
                      </SliderPrimitive.Thumb>
                    </SliderPrimitive.Root>
                  </div>

                  {/* Boundary dates */}
                  <div style={{ display:"flex", justifyContent:"space-between",
                    fontSize:10, fontWeight:400, color: thm.textMuted, marginTop:6,
                    opacity: showIntro ? 0 : 1,
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
                </div>
              )}

              {/* ── Cards reveal wrapper (hidden during intro) ── */}
              <div style={{
                display: "flex",
                flexDirection: "column",
                gap: "1.5rem",
                opacity: showIntro ? 0 : 1,
                animation: showIntro ? "none" : "cards-reveal 0.55s ease 0.05s both",
              }}>

              {/* ── Verdict ──────────────────────────────────── */}
              <div className="animate-fade-in" style={{
                background: thm.verdictBg(v.bg),
                border: `2px solid ${thm.verdictBorder(v.border)}`,
                borderRadius:"1.5rem", padding:"1.5rem 2rem",
                position: "relative",
              }}>
                {/* Info icon — top-right corner */}
                <div style={{ position: "absolute", top: 12, right: 16, zIndex: 2 }}>
                  <InfoTip thm={thm}>{TOOLTIP_CONTENT.verdict.body}</InfoTip>
                </div>
                <div style={{ textAlign:"center" }}>
                  <div className="animate-bounce-in" key={verdictKey}
                    style={{ fontSize:"3.5rem", lineHeight:1, marginBottom:8 }}>
                    {v.face}
                  </div>
                  <p style={{ fontFamily:"var(--app-font-display)", fontWeight:700, fontSize:18,
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
                          letterSpacing:"0.08em", color: thm.baselineLabel, marginBottom:4 }}>Baseline</p>
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
              </div>

              {/* ── KPI cards ─────────────────────────────────── */}
              {selectedStats.count > 0 ? (
                <div style={{ display:"grid",
                  gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))", gap:14 }}>

                  <div style={{ ...kpiCardBase, background: thm.kpiCardBgs[0] }}>
                    {/*<span style={{ fontSize:28 }}>⚡</span>*/}
                    <div style={kpiLabel}>Avg Speed ({periodLabel}) <InfoTip thm={thm}>{TOOLTIP_CONTENT.kpiAvgSpeed.body}</InfoTip></div>
                    <p style={kpiValue}>{selectedStats.avgSpeed || "—"}
                      {selectedStats.avgSpeed > 0 && <span style={{ fontSize:14, fontWeight:600 }}> km/h</span>}
                    </p>
                    <p style={kpiSub}>
                      {baselineSpeed > 0 ? `Baseline: ${baselineSpeed} km/h` : "Set baseline above"}
                    </p>
                  </div>

                  <div style={{ ...kpiCardBase, background: thm.kpiCardBgs[1] }}>
                    {/*<span style={{ fontSize:28 }}>🕐</span>*/}
                    <div style={kpiLabel}>Median Trip <InfoTip thm={thm}>{TOOLTIP_CONTENT.kpiMedianTrip.body}</InfoTip></div>
                    <p style={kpiValue}>{fmtDuration(selectedStats.median)}</p>
                    <p style={kpiSub}>Mean: {fmtDuration(selectedStats.mean)}</p>
                  </div>

                  <div style={{ ...kpiCardBase, background: thm.kpiCardBgs[2] }}>
                    {/*<span style={{ fontSize:28 }}>🔥</span>*/}
                    <div style={kpiLabel}>Bad Day Trip <InfoTip thm={thm}>{fillTemplate(TOOLTIP_CONTENT.kpiBadDay.body, { badDayN, percentile: cfg.percentile.worst_case })}</InfoTip></div>
                    <p style={kpiValue}>{fmtDuration(selectedStats.p95)}</p>
                    <p style={kpiSub}>1-in-{badDayN} trips take this long</p>
                  </div>

                  <div style={{ ...kpiCardBase, background: thm.kpiCardBgs[3] }}>
                    {/*<span style={{ fontSize:28 }}>📊</span>*/}
                    <div style={kpiLabel}>No. of Trips <InfoTip thm={thm}>{TOOLTIP_CONTENT.kpiNumTrips.body}</InfoTip></div>
                    <p style={kpiValue}>{selectedStats.count.toLocaleString()}</p>
                    <p style={kpiSub}>{chartDataArr.length} {chartGranularity === 'daily' ? 'days' : 'weeks'} · {periodLabel} window</p>
                  </div>
                </div>
              ) : (
                <div style={{ background: thm.sectionBg, border: thm.cardBorder, boxShadow: thm.cardShadow,
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
                      style={thm.key!=="colour" ? { background: thm.cardBg, border: thm.cardBorder, boxShadow: thm.cardShadow } : {}}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <p style={{ fontFamily:"var(--app-font-display)", fontWeight:700, fontSize:15,
                            color: thm.textPrimary, margin: 0 }}>
                            {chartView === 'speed' ? '⚡ Speed Over Time' : '🐌 Trip Duration Over Time'}
                          </p>
                          <InfoTip thm={thm} maxWidth={280}>
                            {chartView === 'speed'
                              ? TOOLTIP_CONTENT.chartSpeed.body
                              : TOOLTIP_CONTENT.chartDuration.body
                            }
                          </InfoTip>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          {/* Daily / Weekly toggle */}
                          <div style={{ display: "flex", alignItems: "center", gap: 4, background: thm.sectionBg, borderRadius: 8, padding: 2 }}>
                            {(['daily', 'weekly'] as const).map(g => (
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
                          {/* Speed / Duration toggle */}
                          <div style={{ display: "flex", alignItems: "center", gap: 4, background: thm.sectionBg, borderRadius: 8, padding: 2 }}>
                            <button
                              onClick={() => setChartView('speed')}
                              style={{
                                padding: "4px 12px",
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
                                padding: "4px 12px",
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
                      </div>
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
                    </div>
                  </div>

                  {/* ── TrafficNOW! uncertainty band chart ───────── */}
                  {trafficNowData.length > 0 && (
                    <div className="chart-card animate-fade-in"
                      style={thm.key !== "colour"
                        ? { background: thm.cardBg, border: thm.cardBorder, boxShadow: thm.cardShadow, padding: "1.25rem 1.5rem" }
                        : { padding: "1.25rem 1.5rem" }}>
                      {/* Header row: toggle + optional compare badge */}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: tnOpen ? 4 : 0 }}>
                        <button onClick={() => setTnOpen(o => !o)} style={{
                          display: "flex", alignItems: "center", gap: 8,
                          background: "none", border: "none", cursor: "pointer", padding: 0,
                        }}>
                          <p style={{ fontFamily: "var(--app-font-display)", fontWeight: 700, fontSize: 17, color: thm.textPrimary, margin: 0 }}>
                            📡 TrafficNOW! — Speed Forecast Bands
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
                            Weekly speed distribution · {routeEndpoints}
                            {trafficNowCompare.length > 0 ? ` — with baseline comparison` : ""}
                          </p>
                          <UncertaintyBandChart
                            data={trafficNowData}
                            compareData={trafficNowCompare.length > 0 ? trafficNowCompare : undefined}
                            mode={trafficNowCompare.length > 0 ? "compare" : tnMode}
                            title={`TrafficNOW! forecast bands for ${selectedRoute}`}
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

                  {/* ── Daily calendar ────────────────────────── */}
                  <div className="chart-card animate-fade-in"
                    style={{
                      padding:"1.25rem 1.5rem",
                      position: "relative",
                      ...(thm.key!=="colour" ? { background: thm.cardBg, border: thm.cardBorder, boxShadow: thm.cardShadow } : {}),
                    }}>
                    {/* Info icon — top-right corner */}
                    <div style={{ position: "absolute", top: 12, right: 16, zIndex: 2 }}>
                      <InfoTip thm={thm}>
                        {TOOLTIP_CONTENT.dailyCalendar.body}
                      </InfoTip>
                    </div>
                    <CalendarWidget
                      dailyStats={dailyStats}
                      fmtDur={fmtDuration}
                    />
                  </div>
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
                style={{ color: thm.chart.line4, display:"inline-flex", alignItems:"baseline", gap:4, lineHeight:1, padding:"0 2px", verticalAlign:"baseline" }}>
                {showLogo && <svg height="12" width="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" style={{ flexShrink:0, verticalAlign:"baseline" }}>
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
                </svg>}
                {shortUrl}
              </a>
            );
          })()}
          {" · "}
          {rowCount > 0 && dataTimestamp && (
            <span>{rowCount.toLocaleString()} rows updated at {dataTimestamp.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false })}</span>
          )}
          <span style={{ marginLeft:"auto" }}>© 2026 <a href="https://thecontrarian.in/" target="_blank" rel="noopener noreferrer" style={{ color: thm.chart.line4 }}>Mahesh Shantaram</a></span>
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
              dataTimestamp={dataTimestamp}
              lastUpdated={lastUpdated}
              mobile={false}
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
            dataTimestamp={dataTimestamp}
            lastUpdated={lastUpdated}
            mobile={true}
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
    <ThemeProvider initialTheme={URL_PARAMS.theme as any}>
      <DashboardInner />
    </ThemeProvider>
  );
}
