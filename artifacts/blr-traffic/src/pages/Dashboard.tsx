import { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import * as SliderPrimitive from "@radix-ui/react-slider";
import {
  AreaChart, Area, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip as RCTooltip, Legend, ResponsiveContainer,
} from "recharts";
import { Share2, RefreshCw } from "lucide-react";
import {
  useTrafficData, useFilteredData, useAllRouteWeeks, useDailyStats, useDailyStatsAllDay,
} from "@/lib/useTrafficData";
import type { TimePeriod, TimeOfDay, WeeklyAggregate, DayStats, TrafficRow } from "@/lib/useTrafficData";
import { ThemeProvider, useTheme } from "@/lib/ThemeContext";
import { THEME_META, THEME_CYCLE } from "@/lib/theme";
import type { ChipVariant } from "@/lib/theme";

/* ── Filter options ───────────────────────────────────────────── */
const PERIOD_LIST: { value: TimePeriod; label: string }[] = [
  { value:"1m", label:"1 month" },
  { value:"3m", label:"3 months" },
  { value:"6m", label:"6 months" },
  { value:"1y", label:"1 year" },
];
const TOD_LIST: { value: TimeOfDay; label: string }[] = [
  { value:"weekday_morning",   label:"weekday mornings (8–12)" },
  { value:"weekday_afternoon", label:"weekday afternoons (12–18)" },
  { value:"weekday_evening",   label:"weekday evenings (18–22)" },
  { value:"weekends",          label:"weekends (all day)" },
  { value:"all",               label:"any time of day" },
];

/* ── URL param helpers ────────────────────────────────────────── */
function readUrlParams() {
  if (typeof window === "undefined") return {} as Record<string, string | number>;
  const p = new URLSearchParams(window.location.search);
  const out: Record<string, string | number> = {};
  if (p.has("route"))  out.route  = p.get("route")!;
  if (p.has("tod"))    out.tod    = p.get("tod")!;
  if (p.has("period")) out.period = p.get("period")!;
  if (p.has("mode"))   out.mode   = p.get("mode")!;
  if (p.has("bl"))     out.bl     = Number(p.get("bl"));
  if (p.has("br"))     out.br     = Number(p.get("br"));
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
function ChartTooltip({ active, payload, label }: {
  active?:boolean; payload?:Array<{name:string;value:number;color:string}>; label?:string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:"rgba(255,255,255,0.97)", border:"1px solid #e2e8f0",
      borderRadius:12, padding:"10px 14px", fontSize:13, boxShadow:"0 8px 24px rgba(0,0,0,0.12)" }}>
      <p style={{ fontWeight:700, marginBottom:6, color:"#1e293b" }}>{label}</p>
      {payload.map(p => (
        <div key={p.name} style={{ display:"flex", alignItems:"center", gap:6, marginBottom:2 }}>
          <span style={{ width:8, height:8, borderRadius:"50%", background:p.color, flexShrink:0 }} />
          <span style={{ color:"#64748b" }}>{p.name}:</span>
          <span style={{ fontWeight:600, color:"#1e293b" }}>
            {p.name.toLowerCase().includes("speed") ? `${p.value} km/h` : fmtDuration(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
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
      style={inert ? { cursor:"default", opacity:0.9, ...styleOverride } : styleOverride}
    >
      <span>{icon}</span>{children}
    </button>
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
      viewBox={`0 0 ${W} ${totalH}`}
      style={{ width:"100%", height:totalH, display:"block", overflow:"visible" }}
      overflow="visible"
      preserveAspectRatio="xMidYMid meet">
      {hasGap && (
        <line x1={bXE} y1={toY(baselineWeeks[bLen - 1].avgSpeed)}
          x2={rXS} y2={toY(recentWeeks[0].avgSpeed)}
          stroke={GAP} strokeWidth={1.5} strokeDasharray="4 3" />
      )}
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
    </svg>
  );
}

/* ── KPI info icon + tooltip ──────────────────────────────────── */
function KpiInfo({ text }: { text: string }) {
  const tipRef = useRef<HTMLDivElement>(null);
  const show = (e: React.MouseEvent<HTMLSpanElement>) => {
    const el = tipRef.current;
    if (!el) return;
    const r  = e.currentTarget.getBoundingClientRect();
    const TW = el.offsetWidth  || 240;
    const TH = el.offsetHeight || 64;
    const vw = window.innerWidth;
    const left = Math.max(8, Math.min(vw - TW - 8, r.left + r.width / 2 - TW / 2));
    el.style.left = left + "px";
    el.style.top  = (r.top > TH + 20 ? r.top - TH - 10 : r.bottom + 10) + "px";
    el.style.opacity = "1";
  };
  const hide = () => { if (tipRef.current) tipRef.current.style.opacity = "0"; };
  return (
    <>
      <span onMouseEnter={show} onMouseLeave={hide}
        style={{ display:"inline-flex", alignItems:"center", justifyContent:"center",
          width:14, height:14, borderRadius:"50%",
          border:"1.5px solid hsl(var(--muted-foreground))",
          fontSize:8, fontWeight:900, cursor:"help",
          color:"hsl(var(--muted-foreground))",
          marginLeft:5, userSelect:"none",
          textTransform:"none", letterSpacing:"normal",
          lineHeight:1, flexShrink:0 }}>
        i
      </span>
      <div ref={tipRef} style={{
        position:"fixed", pointerEvents:"none",
        opacity:0, transition:"opacity 0.15s ease",
        background:"#1e1e2e",
        borderRadius:10, padding:"9px 12px",
        boxShadow:"0 6px 28px rgba(0,0,0,0.45)",
        zIndex:2000, maxWidth:240,
        fontSize:12, lineHeight:1.5, color:"#e2e8f0",
        fontFamily:"var(--app-font)",
        top:0, left:0,
      }}>
        {text}
      </div>
    </>
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
  const [calOpen,  setCalOpen]  = useState(true);

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
      `<span style="color:#94a3b8">${lbl}</span>` +
      `<span style="font-weight:600;color:#f1f5f9">${val}</span></div>`
    ).join("");

    el.innerHTML =
      `<div style="background:#1e1e2e;border-radius:12px;padding:11px 14px;` +
      `box-shadow:0 8px 32px rgba(0,0,0,0.55);">` +
      `<div style="font-weight:700;font-size:13px;margin-bottom:7px;color:#f1f5f9">${dayStr}</div>` +
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
        tail.style.borderTop    = `${TAIL}px solid #1e1e2e`;
        tail.style.borderBottom = "";
      } else {
        tail.style.top          = -TAIL + "px";
        tail.style.bottom       = "";
        tail.style.borderLeft   = "9px solid transparent";
        tail.style.borderRight  = "9px solid transparent";
        tail.style.borderBottom = `${TAIL}px solid #1e1e2e`;
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
      style={{ background:"none", border:`1px solid ${thm.key==="gray"?"#e0e0e0":"hsl(var(--border))"}`,
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
                  ? "linear-gradient(90deg,rgba(248,187,208,0.9),rgba(254,215,170,0.9),rgba(187,247,208,0.9))"
                  : "linear-gradient(90deg,rgba(239,68,68,0.88),rgba(245,158,11,0.88),rgba(34,197,94,0.88))"
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

/* ── All-roads overview panel ──────────────────────────────────── */
interface RouteCardData {
  label: string;
  sparkPoints: number[];
  delta: number | null;
  isBaseline: boolean;
  isTop3Worst: boolean;
}

function computeAllRouteCards(
  allRows: TrafficRow[],
  routeOptions: string[],
  baselineStartDate: string | undefined,
  baselineEndDate: string | undefined,
): RouteCardData[] {
  const lastTs = allRows.reduce((mx, r) => Math.max(mx, r.timestamp.getTime()), 0);
  const lastDataDate = lastTs ? new Date(lastTs) : new Date();
  const fourWkAgo = new Date(lastDataDate.getTime() - 28 * 24 * 60 * 60 * 1000);
  const sixMoAgo  = new Date(lastDataDate);
  sixMoAgo.setMonth(sixMoAgo.getMonth() - 6);

  const cards = routeOptions.map((label): RouteCardData => {
    const routeRows = allRows.filter(r => r.label_short === label);

    /* sparkline: weekly avg speeds over last 6 months */
    const byWeek = new Map<string, number[]>();
    for (const r of routeRows) {
      if (r.timestamp < sixMoAgo) continue;
      const arr = byWeek.get(r.weekKey) ?? [];
      arr.push(r.speed_kmh);
      byWeek.set(r.weekKey, arr);
    }
    const sparkPoints = Array.from(byWeek.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, speeds]) => speeds.reduce((s, v) => s + v, 0) / speeds.length);

    /* baseline avg speed (slider window) */
    let baselineAvg = 0;
    if (baselineStartDate && baselineEndDate) {
      const bRows = routeRows.filter(
        r => r.weekKey >= baselineStartDate && r.weekKey <= baselineEndDate,
      );
      if (bRows.length > 0)
        baselineAvg = bRows.reduce((s, r) => s + r.speed_kmh, 0) / bRows.length;
    }

    /* recent 4-week avg speed */
    const recentRows = routeRows.filter(r => r.timestamp >= fourWkAgo);
    const recentAvg  = recentRows.length > 0
      ? recentRows.reduce((s, r) => s + r.speed_kmh, 0) / recentRows.length
      : 0;

    const delta = baselineAvg > 0 && recentAvg > 0
      ? Math.round((recentAvg - baselineAvg) * 10) / 10
      : null;

    const isBaseline = label.toLowerCase().includes("airport expy");
    return { label, sparkPoints, delta, isBaseline, isTop3Worst: false };
  });

  /* sort: worst delta first; null after; baseline always last */
  cards.sort((a, b) => {
    if (a.isBaseline) return 1;
    if (b.isBaseline) return -1;
    if (a.delta === null && b.delta === null) return 0;
    if (a.delta === null) return 1;
    if (b.delta === null) return -1;
    return a.delta - b.delta;
  });

  /* mark top 3 genuinely worsened cards */
  let worstCount = 0;
  for (const c of cards) {
    if (c.isBaseline || c.delta === null || c.delta >= -0.5) continue;
    if (worstCount < 3) { c.isTop3Worst = true; worstCount++; }
  }
  return cards;
}

function MiniSparkline({ points, color }: { points: number[]; color: string }) {
  if (points.length < 2) return <div style={{ width: 60, height: 28, flexShrink: 0 }} />;
  const W = 60, H = 28, PY = 3;
  const minV  = Math.min(...points), maxV = Math.max(...points);
  const range = maxV - minV || 1;
  const toX = (i: number) => (i / (points.length - 1)) * W;
  const toY = (v: number) => PY + (H - PY * 2) * (1 - (v - minV) / range);
  const pts  = points.map((v, i) => `${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(" ");
  return (
    <svg width={W} height={H} style={{ display: "block", overflow: "visible", flexShrink: 0 }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={2.5}
        strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function AllRoadsPanel({
  allRows, routeOptions, baselineStartDate, baselineEndDate, selectedRoute, setRouteIdx,
}: {
  allRows: TrafficRow[];
  routeOptions: string[];
  baselineStartDate: string | undefined;
  baselineEndDate: string | undefined;
  selectedRoute: string;
  setRouteIdx: (i: number) => void;
}) {
  const { theme: thm } = useTheme();
  const [expanded, setExpanded]   = useState(true);
  const cardsRef                  = useRef<RouteCardData[] | null>(null);
  const [cards, setCards]         = useState<RouteCardData[] | null>(null);
  const prevBaselineKey           = useRef("");

  const toggle = useCallback(() => setExpanded(e => !e), []);

  /* compute on mount (expanded by default) + recompute when baseline changes */
  useEffect(() => {
    if (!expanded || allRows.length === 0) return;
    const key = `${baselineStartDate}|${baselineEndDate}`;
    if (cardsRef.current && key === prevBaselineKey.current) return;
    const computed = computeAllRouteCards(allRows, routeOptions, baselineStartDate, baselineEndDate);
    cardsRef.current = computed;
    setCards(computed);
    prevBaselineKey.current = key;
  }, [expanded, allRows, routeOptions, baselineStartDate, baselineEndDate]);

  const handleCardClick = useCallback((label: string) => {
    const idx = routeOptions.indexOf(label);
    if (idx >= 0) setRouteIdx(idx);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [routeOptions, setRouteIdx]);

  const THRESHOLD = 0.5;

  return (
    <div style={{
      background: thm.sectionBg,
      border: thm.cardBorder,
      boxShadow: thm.cardShadow,
      borderRadius: "1.5rem",
      overflow: "hidden",
    }}>
      {/* ── Collapse/expand header ── */}
      <button onClick={toggle} style={{
        width: "100%", display: "flex", alignItems: "center",
        justifyContent: "space-between", padding: "1.25rem 1.5rem",
        background: "none", border: "none", cursor: "pointer", textAlign: "left",
      }}>
        <span style={{ fontFamily: "var(--app-font-display)", fontWeight: 700, fontSize: 17,
          color: thm.textPrimary }}>
          🗺️ Speed Snapshot by Route
        </span>
        <span style={{ fontSize: 16, color: thm.textMuted, display: "inline-block",
          transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
          transition: "transform 0.2s ease" }}>▾</span>
      </button>

      {expanded && (
        <div style={{ padding: "0 1.5rem 1.5rem" }}>
          {!cards ? (
            <p style={{ color: thm.textMuted, fontSize: 13, padding: "0.5rem 0" }}>
              Computing route summaries…
            </p>
          ) : (
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(195px, 1fr))",
              gap: 12,
            }}>
              {cards.map(card => {
                const dir = card.delta !== null && !card.isBaseline
                  ? card.delta >  THRESHOLD ? "up"
                  : card.delta < -THRESHOLD ? "down"
                  : "flat"
                  : "flat";
                const sparkColor = card.isBaseline
                  ? (thm.key === "colour" ? "#60a5fa" : "#888888")
                  : dir === "up"   ? "#34d399"
                  : dir === "down" ? "#f87171"
                  : "#94a3b8";

                let cardBg: string = thm.key === "colour" ? "rgba(20,30,55,0.92)" : (thm.cardBg as string);
                if (card.isTop3Worst) {
                  cardBg = thm.key === "colour" ? "rgba(239,68,68,0.09)"
                         : thm.key === "gray"   ? "rgba(0,0,0,0.04)"
                         : "rgba(239,100,68,0.07)";
                }
                const cardBorder = card.isBaseline
                  ? "1.5px solid #f59e0b"
                  : card.label === selectedRoute
                  ? `1px solid ${thm.chart.line4}`
                  : thm.cardBorder as string;

                return (
                  <div key={card.label}
                    onClick={() => handleCardClick(card.label)}
                    title={card.isBaseline
                      ? "The fastest road in Bangalore — sets the upper bound for what's achievable without breaking traffic laws."
                      : undefined}
                    style={{
                      background: cardBg, border: cardBorder,
                      boxShadow: thm.cardShadow as string,
                      borderRadius: 14, padding: "12px 14px",
                      cursor: "pointer", display: "flex", flexDirection: "column", gap: 8,
                      transition: "transform 0.12s, box-shadow 0.12s",
                    }}
                    onMouseEnter={e => {
                      const el = e.currentTarget as HTMLDivElement;
                      el.style.transform = "translateY(-2px)";
                      el.style.boxShadow = "0 6px 20px rgba(0,0,0,0.22)";
                    }}
                    onMouseLeave={e => {
                      const el = e.currentTarget as HTMLDivElement;
                      el.style.transform = "";
                      el.style.boxShadow = thm.cardShadow as string;
                    }}
                  >
                    <p style={{ fontSize: 13, fontWeight: 700, color: thm.textPrimary,
                      lineHeight: 1.3, margin: 0 }}>
                      {card.label}
                    </p>
                    <div style={{ display: "flex", alignItems: "center",
                      justifyContent: "space-between", gap: 8 }}>
                      <MiniSparkline points={card.sparkPoints} color={sparkColor} />
                      {card.isBaseline ? (
                        <span style={{ fontSize: 11, fontWeight: 700,
                          color: "#f59e0b", whiteSpace: "nowrap" }}>
                          ⚡ Speed benchmark
                        </span>
                      ) : card.delta === null ? (
                        <span style={{ fontSize: 11, color: thm.textMuted }}>— no data</span>
                      ) : Math.abs(card.delta) < THRESHOLD ? (
                        <span style={{ fontSize: 11, color: thm.textMuted }}>— steady</span>
                      ) : (
                        <span style={{ fontSize: 12, fontWeight: 700,
                          color: card.delta > 0 ? "#34d399" : "#f87171",
                          whiteSpace: "nowrap" }}>
                          {card.delta > 0 ? "▲" : "▼"} {Math.abs(card.delta).toFixed(1)} km/h
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Main dashboard (inner — consumes ThemeContext) ───────────── */
function DashboardInner() {
  const { theme: thm, themeKey, nextThemeKey, cycleTheme } = useTheme();

  /* UI state */
  const [periodIdx,    setPeriodIdx]    = useState(() => {
    const i = PERIOD_LIST.findIndex(p => p.value === URL_PARAMS.period);
    return i >= 0 ? i : 2;
  });
  const [todIdx,       setTodIdx]       = useState(() => {
    const i = TOD_LIST.findIndex(t => t.value === URL_PARAMS.tod);
    return i >= 0 ? i : 1;
  });
  const [routeIdx,     setRouteIdx]     = useState(0);
  const [questionMode, setQuestionMode] = useState<"worsened"|"improved">(
    URL_PARAMS.mode === "improved" ? "improved" : "worsened"
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

  /* data */
  const { routes, allRows, loading, error, rowCount, lastUpdated, refresh } =
    useTrafficData();

  const routeOptions = useMemo(() => {
    const labels = Array.from(new Set(allRows.map(r => r.label_short))).sort();
    return labels.length ? labels : ["Old Airport Road"];
  }, [allRows]);

  useEffect(() => {
    if (routeOptions.length === 0 || urlParamsRef.current.routeApplied) return;
    if (URL_PARAMS.route) {
      const idx = routeOptions.indexOf(URL_PARAMS.route as string);
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

  const nextRoute  = () => { setRouteIdx(i => (i+1)%routeOptions.length); popChip("route"); };
  const nextPeriod = () => { setPeriodIdx(i => (i+1)%PERIOD_LIST.length);  popChip("period"); };
  const nextTod    = () => { setTodIdx(i => (i+1)%TOD_LIST.length);         popChip("tod"); };
  const toggleMode = () => {
    setQuestionMode(m => m === "worsened" ? "improved" : "worsened");
    popChip("mode");
  };

  /* ── Slider ─────────────────────────────────────────────────── */
  const allRouteWeeks = useAllRouteWeeks(allRows, selectedRoute, tod);

  useEffect(() => {
    if (allRouteWeeks.length === 0) return;
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
    const cfgStart = appConfig.baseline_default_start;
    const cfgEnd   = appConfig.baseline_default_end;
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
  }, [selectedRoute, tod, allRouteWeeks.length]);

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
      route:  selectedRoute,
      tod,
      period,
      mode:   questionMode,
      bl:     String(safeLeft),
      br:     String(safeRight),
    });
    const url = `${window.location.origin}${window.location.pathname}?${p.toString()}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2000);
    });
  }, [selectedRoute, tod, period, questionMode, safeLeft, safeRight]);

  const lastDataMs = useMemo(
    () => allRows.reduce((max, r) => Math.max(max, r.timestamp.getTime()), 0),
    [allRows],
  );
  const periodCutoffDate = useMemo(() => {
    const d = new Date(lastDataMs || Date.now());
    if      (period === "1m") d.setMonth(d.getMonth() - 1);
    else if (period === "3m") d.setMonth(d.getMonth() - 3);
    else if (period === "6m") d.setMonth(d.getMonth() - 6);
    else                       d.setFullYear(d.getFullYear() - 1);
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
    const win = r - l;
    if ((win <= 1 || win >= allRouteWeeks.length * 0.85) && !showSparkle) {
      setShowSparkle(true);
      clearTimeout(sparkleTimer.current);
      sparkleTimer.current = setTimeout(() => setShowSparkle(false), 1600);
    }
  }, [allRouteWeeks.length, showSparkle, recentWindowStartIdx, maxIdx]);

  const dailyStats = useDailyStatsAllDay(allRows, selectedRoute);
  const { merged, selectedStats } = useFilteredData(allRows, selectedRoute, period, tod);

  /* ── Data trend ─────────────────────────────────────────────── */
  const VERDICT_THRESHOLD =
    (appConfig as AppConfig).verdict_threshold_kmh ?? 0.5;

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
    confirmed_good:      { face:"🤩", msg:"Yes! It's gotten better — speed is up. 🎉",          border:"#6ee7b7", bg:"#f0fdf4", tc:"#065f46" },
    confirmed_bad:       { face:"🥵", msg:"Yep, it's gotten worse — traffic is heavier.",         border:"#fca5a5", bg:"#fff1f2", tc:"#991b1b" },
    contradicted_better: { face:"🤩", msg:"Actually, things have improved! Roads are faster.",    border:"#6ee7b7", bg:"#f0fdf4", tc:"#065f46" },
    contradicted_worse:  { face:"🥵", msg:"Actually, things have gotten worse — traffic is heavier.", border:"#fca5a5", bg:"#fff1f2", tc:"#991b1b" },
    no_change:           { face:"😐", msg:"Not really — no meaningful change either way.",         border:"#fcd34d", bg:"#fffbeb", tc:"#92400e" },
    insufficient:        { face:"🔍", msg:"Need more data — widen the baseline window.",           border:"#c4b5fd", bg:"#f5f3ff", tc:"#5b21b6" },
  };
  const v      = VERDICT[verdictKey];
  const colors = thm.chart;

  const verdictSubtext = verdictKey !== "insufficient" && baselineStartDate
    ? `Comparing baseline (${fmtShortDate(baselineStartDate)}–${fmtShortDate(baselineEndDate)}) to recent (${fmtShortDate(recentStartDate)}–${fmtShortDate(lastDate)}) · ${routeEndpoints} · ${todLabel}`
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
      <div className="min-h-screen transition-colors" style={{ background: thm.bodyBg }}>

        {/* ── Header ──────────────────────────────────────────── */}
        <header style={{
          background: thm.headerBg,
          backdropFilter: "blur(12px)",
          borderBottom: `1px solid ${thm.key==="gray"?"#e0e0e0":"hsl(var(--border))"}`,
          position:"sticky", top:0, zIndex:500,
        }}>
          <div style={{ maxWidth:1320, margin:"0 auto", padding:"0.75rem 1.5rem",
            display:"flex", alignItems:"center", justifyContent:"space-between", gap:12 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <img
                src="/trafficoracle-light.png"
                alt="TraffiCOracle"
                style={{ height:32, width:"auto", flexShrink:0 }}
              />
              <div>
                <div style={{ display:"flex", alignItems:"center", gap:8, lineHeight:1.2 }}>
                  <Chip icon="📍" variant="city" onClick={() => {}} inert>Bangalore</Chip>
                </div>
              </div>
            </div>

            {lastUpdated && (
              <div style={{
                textAlign: "right",
                display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1,
              }}>
                <div style={{
                  fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
                  color: thm.textSecondary, textTransform: "uppercase",
                }}>
                  {lastUpdated.toLocaleDateString("en-IN", {
                    weekday: "short", day: "2-digit", month: "short", year: "numeric",
                  }).toUpperCase()}
                </div>
                <div style={{
                  fontSize: 13, fontWeight: 800, color: thm.textPrimary,
                  letterSpacing: 0.3,
                }}>
                  {lastUpdated.toLocaleTimeString("en-IN", {
                    hour: "2-digit", minute: "2-digit", second: "2-digit",
                  })}
                </div>
              </div>
            )}

            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              {!loading && rowCount > 0 && (
                <button onClick={handleShare} style={{
                  display:"flex", alignItems:"center", gap:5, fontSize:12,
                  border:`1px solid ${thm.key==="gray"?"#e0e0e0":"hsl(var(--border))"}`,
                  borderRadius:9999, padding:"5px 12px",
                  color: copied ? "#34d399" : thm.textMuted,
                  background: copied ? "rgba(52,211,153,0.1)" : "transparent",
                  cursor:"pointer", transition:"color 0.2s, background 0.2s",
                }} title="Copy shareable link">
                  <Share2 size={13} />
                  {copied ? "Copied!" : "Share"}
                </button>
              )}
              {/* Three-way theme toggle */}
              <button onClick={refresh} disabled={loading} style={{
                display:"flex", alignItems:"center", gap:5, fontSize:12,
                border:`1px solid ${thm.key==="gray"?"#e0e0e0":"hsl(var(--border))"}`,
                borderRadius:9999, padding:"5px 12px",
                color: thm.textMuted,
                background: "transparent",
                cursor: loading ? "default" : "pointer",
                transition:"color 0.2s, background 0.2s",
                opacity: loading ? 0.4 : 1,
              }} title="Refresh data from GitHub">
                <RefreshCw size={13} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
                <span style={{ fontSize:12, fontWeight:600 }}>{loading ? "Fetching…" : "Refresh"}</span>
              </button>
              <button
                onClick={cycleTheme}
                title={`Switch to ${nextMeta.label}`}
                style={{
                  display:"flex", alignItems:"center", gap:6,
                  height:34, borderRadius:9999, padding:"0 12px",
                  border:`1px solid ${thm.key==="gray"?"#e0e0e0":"hsl(var(--border))"}`,
                  background: thm.key==="colour" ? "#1e293b" : thm.key==="gray" ? "#f5f5f5" : "#fce7f3",
                  cursor:"pointer",
                  transition:"background 0.2s",
                }}
                aria-label="Cycle theme"
              >
                <span style={{ fontSize:15 }}>{curMeta.icon}</span>
                <span style={{ fontSize:10, fontWeight:600, color: thm.textSecondary,
                  whiteSpace:"nowrap", maxWidth:120, overflow:"hidden", textOverflow:"ellipsis" }}>
                  {curMeta.label}
                </span>
              </button>
            </div>
          </div>
        </header>

        <main style={{ maxWidth:1320, margin:"0 auto", padding:"1.5rem 1.5rem 2rem",
          display:"flex", flexDirection:"column", gap:"1.5rem" }}>

          {/* ── Hero question ────────────────────────────────── */}
          <div className="animate-bounce-in" style={{ textAlign:"center", padding:"1.5rem 1rem 0.25rem" }}>
            <h1 style={{
              fontFamily:"var(--app-font-display)", fontWeight:900,
              fontSize:"clamp(1.3rem,3.2vw,2rem)", lineHeight:1.7,
              color: thm.textPrimary,
              display:"flex", flexWrap:"wrap", alignItems:"center",
              justifyContent:"center", gap:"0.3em",
            }}>
              <span>Has traffic</span>
              <Chip icon={questionMode==="worsened"?"🚦":"✅"} variant={questionMode}
                onClick={toggleMode} animate={!!chipAnim.mode}>{questionMode}</Chip>
              <span>on</span>
              <Chip icon="🛣️" variant="route"
                onClick={nextRoute} animate={!!chipAnim.route}>{selectedRoute}</Chip>
              <span>during</span>
              <Chip icon="⏰" variant="tod"
                onClick={nextTod} animate={!!chipAnim.tod}>{todLabel}</Chip>
              <span>over the past</span>
              <Chip icon="📅" variant="period"
                onClick={nextPeriod} animate={!!chipAnim.period}>{periodLabel}</Chip>
              <span>?</span>
            </h1>
            <p style={{ marginTop:"0.25rem", fontSize:12, color: thm.textMuted }}>
              Tap any highlighted word to explore a different question.
            </p>
          </div>

          {/* Loading */}
          {loading && (
            <div style={{ textAlign:"center", padding:"4rem 0" }}>
              <div className="animate-float" style={{ fontSize:56, marginBottom:16 }}>🚗</div>
              <p style={{ color: thm.textMuted, fontWeight:600 }}>
                Fetching 60k traffic records from GitHub…
              </p>
            </div>
          )}

          {/* Error */}
          {!loading && error && (
            <div style={{ background:"#fff1f2", border:"1px solid #fca5a5",
              borderRadius:16, padding:"1.5rem", color:"#991b1b" }}>
              <p style={{ fontWeight:700, marginBottom:4 }}>😬 Couldn't load data</p>
              <p style={{ fontSize:13 }}>{error}</p>
            </div>
          )}

          {!loading && !error && rowCount > 0 && (
            <>
              {/* ── Baseline slider ──────────────────────────── */}
              {allRouteWeeks.length > 1 && (
                <div className="animate-fade-in" style={{
                  background: thm.sectionBg,
                  border: thm.cardBorder,
                  boxShadow: thm.cardShadow,
                  borderRadius:"1.5rem", padding:"1.25rem 1.5rem 1rem",
                  position:"relative", overflow:"hidden",
                }}>
                  {showSparkle && <Sparkles />}

                  <p style={{ fontFamily:"var(--app-font-display)", fontWeight:700, fontSize:15,
                    color: thm.textPrimary, marginBottom:14 }}>
                    Compare with this earlier period ↔
                  </p>

                  <div style={{ padding:"28px 0 4px", position:"relative" }}>
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
                        background: thm.slider.track,
                      }}>
                        <div style={{
                          position:"absolute", top:0, left:0,
                          width:`${leftTrackPct}%`, height:"100%",
                          background: thm.slider.dim, pointerEvents:"none",
                        }} />
                        <div style={{
                          position:"absolute", top:0,
                          left:`${leftTrackPct}%`,
                          width:`${Math.max(0, rightTrackPct - leftTrackPct)}%`,
                          height:"100%",
                          background: thm.slider.stripe,
                          pointerEvents:"none",
                        }} />
                        <div style={{
                          position:"absolute", top:0, left:`${rightTrackPct}%`,
                          width:`${100 - rightTrackPct}%`, height:"100%",
                          background: thm.slider.dim, pointerEvents:"none",
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
                          border:`2px solid ${thm.slider.thumbLeftBorder}`,
                          boxShadow: thm.slider.thumbLeftShadow,
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
                          border:`2px solid ${thm.slider.thumbRightBorder}`,
                          boxShadow: thm.slider.thumbRightShadow,
                        }} />
                      </SliderPrimitive.Thumb>
                    </SliderPrimitive.Root>
                  </div>

                  {/* Boundary dates */}
                  <div style={{ display:"flex", justifyContent:"space-between",
                    fontSize:10, fontWeight:400, color: thm.textMuted, marginTop:6 }}>
                    <span>{fmtDate(allRouteWeeks[0]?.weekKey)}</span>
                    <span>{fmtDate(lastDate)}</span>
                  </div>

                  {/* Overlap warning */}
                  {overlapWarning && (
                    <p key={String(overlapWarning)} style={{
                      fontSize:11, color:"#f87171", textAlign:"center",
                      marginTop:8, animation:"overlap-warning 3s ease forwards",
                      pointerEvents:"none",
                    }}>
                      Baseline can't overlap with the recent period 🙅
                    </p>
                  )}
                </div>
              )}

              {/* ── Verdict ──────────────────────────────────── */}
              <div className="animate-fade-in" style={{
                background: thm.verdictBg(v.bg),
                border: `2px solid ${thm.verdictBorder(v.border)}`,
                borderRadius:"1.5rem", padding:"1.5rem 2rem",
              }}>
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
                        height={120}
                        dateLabels={{
                          bStart: fmtDate(baselineStartDate),
                          bEnd:   fmtDate(baselineEndDate),
                          rStart: fmtDate(recentStartDate),
                          rEnd:   fmtDate(lastDate),
                        }}
                      />
                    </div>
                    {recentSpeed > 0 && (
                      <div style={{ width:"auto", flexShrink:0, textAlign:"center", paddingLeft:6 }}>
                        <p style={{ fontSize:10, fontWeight:700, textTransform:"uppercase",
                          letterSpacing:"0.08em", color: thm.recentLabel, marginBottom:4 }}>Recent</p>
                        <p style={{ fontFamily:"var(--app-font-display)", fontWeight:800, fontSize:22,
                          color: speedDiff > 0 ? thm.speedGood : speedDiff < 0 ? thm.speedBad
                            : thm.verdictText(v.tc), lineHeight:1 }}>
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
                    <span style={{ fontSize:28 }}>⚡</span>
                    <div style={kpiLabel}>Avg Speed ({periodLabel}) <KpiInfo text="Average speed across all trips in the selected period and time slot, for this route." /></div>
                    <p style={kpiValue}>{selectedStats.avgSpeed || "—"}
                      {selectedStats.avgSpeed > 0 && <span style={{ fontSize:14, fontWeight:600 }}> km/h</span>}
                    </p>
                    <p style={kpiSub}>
                      {baselineSpeed > 0 ? `Baseline: ${baselineSpeed} km/h` : "Set baseline above"}
                    </p>
                  </div>

                  <div style={{ ...kpiCardBase, background: thm.kpiCardBgs[1] }}>
                    <span style={{ fontSize:28 }}>🕐</span>
                    <div style={kpiLabel}>Median Trip <KpiInfo text="Half of all trips were faster than this, half were slower. A better everyday estimate than the average." /></div>
                    <p style={kpiValue}>{fmtDuration(selectedStats.median)}</p>
                    <p style={kpiSub}>Mean: {fmtDuration(selectedStats.mean)}</p>
                  </div>

                  <div style={{ ...kpiCardBase, background: thm.kpiCardBgs[2] }}>
                    <span style={{ fontSize:28 }}>🔥</span>
                    <div style={kpiLabel}>Bad day trip <KpiInfo text="On a bad day, your trip could take this long. Specifically, 1 in every 20 trips (the 95th percentile) is at least this slow." /></div>
                    <p style={kpiValue}>{fmtDuration(selectedStats.p95)}</p>
                    <p style={kpiSub}>1-in-20 trips take this long</p>
                  </div>

                  <div style={{ ...kpiCardBase, background: thm.kpiCardBgs[3] }}>
                    <span style={{ fontSize:28 }}>📊</span>
                    <div style={kpiLabel}>Readings <KpiInfo text="Total number of hourly traffic readings used to calculate the above figures." /></div>
                    <p style={kpiValue}>{selectedStats.count.toLocaleString()}</p>
                    <p style={kpiSub}>{merged.length} weeks · {periodLabel} window</p>
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
              {merged.length > 0 && (
                <>
                  <div style={{ display:"grid",
                    gridTemplateColumns:"repeat(auto-fit,minmax(420px,1fr))", gap:16 }}>

                    {/* Speed over time */}
                    <div className="chart-card animate-fade-in"
                      style={thm.key!=="colour" ? { background: thm.cardBg, border: thm.cardBorder, boxShadow: thm.cardShadow } : {}}>
                      <p style={{ fontFamily:"var(--app-font-display)", fontWeight:700, fontSize:15,
                        color: thm.textPrimary }}>⚡ Speed Over Time</p>
                      <p style={{ fontSize:12, color: thm.textMuted, marginBottom:14 }}>
                        Weekly avg km/h — higher is better
                      </p>
                      <ResponsiveContainer width="100%" height={220}>
                        <AreaChart data={merged} margin={{top:4,right:8,left:-16,bottom:0}}>
                          <defs>
                            <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%"  stopColor={colors.line1} stopOpacity={0.25}/>
                              <stop offset="95%" stopColor={colors.line1} stopOpacity={0}/>
                            </linearGradient>
                            <linearGradient id="pbg" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%"  stopColor={colors.line2} stopOpacity={0.15}/>
                              <stop offset="95%" stopColor={colors.line2} stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke={thm.key==="gray"?"#e0e0e0":"hsl(var(--border))"} vertical={false}/>
                          <XAxis dataKey="weekKey" tickFormatter={fmtWeek}
                            tick={{fontSize:11,fill:thm.textMuted}}
                            tickLine={false} axisLine={false}/>
                          <YAxis tick={{fontSize:11,fill:thm.textMuted}}
                            tickLine={false} axisLine={false} unit=" km/h"/>
                          <RCTooltip content={<ChartTooltip/>}/>
                          <Legend wrapperStyle={{fontSize:12,paddingTop:8}}/>
                          <Area type="monotone" dataKey="avgSpeed" name="Avg Speed"
                            stroke={colors.line1}
                            strokeWidth={thm.key==="gray" ? 2 : 2.5}
                            fill="url(#sg)" dot={false} connectNulls/>
                          {merged.some(m => m.baselineSpeed != null) && (
                            <Area type="monotone" dataKey="baselineSpeed" name="Route Baseline"
                              stroke={colors.line2}
                              strokeWidth={thm.key==="gray" ? 1 : 1.5}
                              strokeDasharray="5 3"
                              fill="url(#pbg)" dot={false} connectNulls/>
                          )}
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Duration over time */}
                    <div className="chart-card animate-fade-in"
                      style={thm.key!=="colour" ? { background: thm.cardBg, border: thm.cardBorder, boxShadow: thm.cardShadow } : {}}>
                      <p style={{ fontFamily:"var(--app-font-display)", fontWeight:700, fontSize:15,
                        color: thm.textPrimary }}>🐌 Trip Duration Over Time</p>
                      <p style={{ fontSize:12, color: thm.textMuted, marginBottom:14 }}>
                        Weekly median + bad-day (p{
                          (appConfig as AppConfig).worst_case_percentile
                        }) — lower is better
                      </p>
                      <ResponsiveContainer width="100%" height={220}>
                        <LineChart data={merged} margin={{top:4,right:8,left:-16,bottom:0}}>
                          <CartesianGrid strokeDasharray="3 3" stroke={thm.key==="gray"?"#e0e0e0":"hsl(var(--border))"} vertical={false}/>
                          <XAxis dataKey="weekKey" tickFormatter={fmtWeek}
                            tick={{fontSize:11,fill:thm.textMuted}}
                            tickLine={false} axisLine={false}/>
                          <YAxis tick={{fontSize:11,fill:thm.textMuted}}
                            tickLine={false} axisLine={false} unit=" min"/>
                          <RCTooltip content={<ChartTooltip/>}/>
                          <Legend wrapperStyle={{fontSize:12,paddingTop:8}}/>
                          <Line type="monotone" dataKey="avgDuration" name="Avg Duration"
                            stroke={colors.line3}
                            strokeWidth={thm.key==="gray" ? 2 : 2.5}
                            dot={false} connectNulls/>
                          <Line type="monotone" dataKey="p95Duration" name="Bad Day Trip"
                            stroke={colors.line4}
                            strokeWidth={thm.key==="gray" ? 1 : 1.5}
                            strokeDasharray="5 3"
                            dot={false} connectNulls/>
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* ── Daily calendar ────────────────────────── */}
                  <div className="chart-card animate-fade-in"
                    style={{
                      padding:"1.25rem 1.5rem",
                      ...(thm.key!=="colour" ? { background: thm.cardBg, border: thm.cardBorder, boxShadow: thm.cardShadow } : {}),
                    }}>
                    <CalendarWidget
                      dailyStats={dailyStats}
                      fmtDur={fmtDuration}
                    />
                  </div>
                </>
              )}

              {/* ── All-roads overview panel ───────────────── */}
              <AllRoadsPanel
                allRows={allRows}
                routeOptions={routeOptions}
                baselineStartDate={baselineStartDate}
                baselineEndDate={baselineEndDate}
                selectedRoute={selectedRoute}
                setRouteIdx={setRouteIdx}
              />
            </>
          )}
        </main>

        <footer style={{
          borderTop:`1px solid ${thm.key==="gray"?"#e0e0e0":"hsl(var(--border))"}`,
          marginTop:"2rem", padding:"1rem 1.5rem",
          textAlign:"center", fontSize:12, color: thm.textMuted,
        }}>
          Source:{" "}
          <a href="https://github.com/thecont1/blr-traffic-monitor"
            target="_blank" rel="noopener noreferrer"
            style={{ color: thm.chart.line4, display:"inline-flex", alignItems:"center", gap:4, verticalAlign:"middle" }}>
            <svg height="14" width="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" style={{ flexShrink:0 }}>
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
            </svg>
            thecont1/blr-traffic-monitor
          </a>
          {" "} · Live data{rowCount > 0 ? ` · ${rowCount.toLocaleString()} rows` : ""}. Refresh page for latest data.
        </footer>

      </div>
    </div>
  );
}

/* ── Public export — wraps inner component with ThemeProvider ─── */
export default function Dashboard() {
  return (
    <ThemeProvider>
      <DashboardInner />
    </ThemeProvider>
  );
}

/* need this import for the config reference in JSX */
import appConfig from "../config.json";
import type { AppConfig } from "../lib/config";
