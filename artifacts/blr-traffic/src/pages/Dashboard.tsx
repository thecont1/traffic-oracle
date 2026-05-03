import { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import * as SliderPrimitive from "@radix-ui/react-slider";
import {
  AreaChart, Area, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip as RCTooltip, Legend, ResponsiveContainer,
} from "recharts";
import { Sun, Moon, Share2 } from "lucide-react";
import {
  useTrafficData, useFilteredData, useAllRouteWeeks, useDailyStats, useDailyStatsAllDay,
} from "@/lib/useTrafficData";
import type { TimePeriod, TimeOfDay, WeeklyAggregate, DayStats } from "@/lib/useTrafficData";

/* ── Colours ──────────────────────────────────────────────────── */
const LC = { primary:"#2563eb", teal:"#0d9488", purple:"#7c3aed", pink:"#db2777" };
const DC = { primary:"#60a5fa", teal:"#2dd4bf", purple:"#a78bfa", pink:"#f472b6" };

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
type ChipVariant = "route"|"period"|"tod"|"worsened"|"improved"|"city";

function Chip({ children, icon, variant, onClick, animate, inert }: {
  children:React.ReactNode; icon:string; variant:ChipVariant;
  onClick:()=>void; animate?:boolean; inert?:boolean;
}) {
  return (
    <button
      className={`chip chip-${variant} ${animate?"animate-pop":""}`}
      onClick={inert ? undefined : onClick}
      title={inert ? "Multi-city support coming soon" : "Tap to explore differently"}
      style={inert ? { cursor:"default", opacity:0.9 } : undefined}
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

/* ── Napkin chart — baseline (blue) / gap / recent (pink) ─────── */
function NapkinChart({
  baselineWeeks, recentWeeks, dark, height = 120, dateLabels,
}: {
  baselineWeeks: WeeklyAggregate[];
  recentWeeks:   WeeklyAggregate[];
  dark: boolean;
  height?: number;
  dateLabels?: { bStart: string; bEnd: string; rStart: string; rEnd: string };
}) {
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

  const W = 500, H = height;
  const PX = 4, PY = 8;
  const chartW = W - PX * 2;
  const chartH = H - PY * 2;
  const LABEL_H = dateLabels ? 18 : 0;
  const totalH  = H + LABEL_H;

  const hasGap = bLen > 0 && rLen > 0;
  const bFrac = bLen > 0 ? (hasGap ? 0.43 : 1.0) : 0;
  const rFrac = rLen > 0 ? (hasGap ? 0.43 : 1.0) : 0;
  const bXS = PX;
  const bXE = PX + chartW * bFrac;
  const rXS = hasGap ? W - PX - chartW * rFrac : PX;
  const rXE = W - PX;

  const toY = (s: number) => PY + chartH - ((s - minS) / range) * chartH;

  const pts = (weeks: WeeklyAggregate[], xs: number, xe: number) =>
    weeks.length === 1
      ? `${xs},${toY(weeks[0].avgSpeed)} ${xe},${toY(weeks[0].avgSpeed)}`
      : weeks.map((w, i) => {
          const x = xs + (i / (weeks.length - 1)) * (xe - xs);
          return `${x.toFixed(1)},${toY(w.avgSpeed).toFixed(1)}`;
        }).join(" ");

  const muted  = dark ? "#475569" : "#cbd5e1";
  const labelY = H + 13;

  return (
    <svg viewBox={`0 0 ${W} ${totalH}`}
      style={{ width:"100%", height:totalH, display:"block" }}
      preserveAspectRatio="xMidYMid meet">
      {hasGap && (
        <line x1={bXE} y1={toY(baselineWeeks[bLen - 1].avgSpeed)}
          x2={rXS} y2={toY(recentWeeks[0].avgSpeed)}
          stroke={muted} strokeWidth={1.5} strokeDasharray="4 3" />
      )}
      {bLen > 0 && (
        <polyline points={pts(baselineWeeks, bXS, bXE)}
          fill="none" stroke="#60a5fa" strokeWidth={3.5}
          strokeLinejoin="round" strokeLinecap="round" />
      )}
      {rLen > 0 && (
        <polyline points={pts(recentWeeks, rXS, rXE)}
          fill="none" stroke="#f472b6" strokeWidth={3.5}
          strokeLinejoin="round" strokeLinecap="round" />
      )}
      {hasGap && bLen > 0 && (
        <circle cx={bXE} cy={toY(baselineWeeks[bLen - 1].avgSpeed)} r={5} fill="#60a5fa" />
      )}
      {hasGap && rLen > 0 && (
        <circle cx={rXS} cy={toY(recentWeeks[0].avgSpeed)} r={5} fill="#f472b6" />
      )}
      {/* Date markers: dashed verticals + bottom-aligned labels */}
      {dateLabels && bLen > 0 && (<>
        <line x1={bXS} y1={toY(baselineWeeks[0].avgSpeed)} x2={bXS} y2={H}
          stroke="#60a5fa" strokeWidth={1} strokeDasharray="3 3" opacity={0.4} />
        <text x={bXS} y={labelY} fontSize={9} fill="#60a5fa" opacity={0.8}
          textAnchor="start">{dateLabels.bStart}</text>
        <line x1={bXE} y1={toY(baselineWeeks[bLen - 1].avgSpeed)} x2={bXE} y2={H}
          stroke="#60a5fa" strokeWidth={1} strokeDasharray="3 3" opacity={0.4} />
        <text x={bXE} y={labelY} fontSize={9} fill="#60a5fa" opacity={0.8}
          textAnchor="end">{dateLabels.bEnd}</text>
      </>)}
      {dateLabels && rLen > 0 && (<>
        <line x1={rXS} y1={toY(recentWeeks[0].avgSpeed)} x2={rXS} y2={H}
          stroke="#f472b6" strokeWidth={1} strokeDasharray="3 3" opacity={0.4} />
        <text x={rXS} y={labelY} fontSize={9} fill="#f472b6" opacity={0.8}
          textAnchor="start">{dateLabels.rStart}</text>
        <line x1={rXE} y1={toY(recentWeeks[rLen - 1].avgSpeed)} x2={rXE} y2={H}
          stroke="#f472b6" strokeWidth={1} strokeDasharray="3 3" opacity={0.4} />
        <text x={rXE} y={labelY} fontSize={9} fill="#f472b6" opacity={0.8}
          textAnchor="end">{dateLabels.rEnd}</text>
      </>)}
    </svg>
  );
}

/* ── Speed → colour helper — route-relative normalisation ─────── */
function speedColorNorm(kmh: number, minSpd: number, maxSpd: number): string {
  const t  = maxSpd > minSpd ? (kmh - minSpd) / (maxSpd - minSpd) : 0.5;
  const tc = Math.max(0, Math.min(1, t));
  if (tc < 0.5) {
    const s = tc * 2;
    return `rgba(${Math.round(239+(234-239)*s)},${Math.round(68+(179-68)*s)},${Math.round(68+(8-68)*s)},0.92)`;
  }
  const s = (tc - 0.5) * 2;
  return `rgba(${Math.round(234+(52-234)*s)},${Math.round(179+(211-179)*s)},${Math.round(8+(153-8)*s)},0.92)`;
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
const CAL_MUTED = "hsl(var(--muted-foreground))";
const DAY_HDR   = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

function parseYM(s: string) {
  const d = new Date(s + "T12:00:00");
  return { y: d.getFullYear(), m: d.getMonth() };
}

function CalendarWidget({
  dailyStats, dark, fmtDur,
}: {
  dailyStats: Map<string, DayStats>;
  dark: boolean;
  fmtDur: (n: number) => string;
}) {
  const allDates = useMemo(() => Array.from(dailyStats.keys()).sort(), [dailyStats]);
  const lastStr  = allDates[allDates.length - 1] ?? "";
  const firstStr = allDates[0] ?? "";

  const initYM = lastStr ? parseYM(lastStr) : { y: new Date().getFullYear(), m: new Date().getMonth() };
  const [calYear,  setCalYear]  = useState(initYM.y);
  const [calMonth, setCalMonth] = useState(initYM.m);
  const [fadeKey,  setFadeKey]  = useState(0);

  useEffect(() => {
    if (lastStr) { const { y, m } = parseYM(lastStr); setCalYear(y); setCalMonth(m); }
  }, [lastStr]);

  /* Route-relative speed range — recomputed whenever route data changes */
  const { minSpd, maxSpd } = useMemo(() => {
    const speeds = Array.from(dailyStats.values()).map(d => d.avgSpeed).filter(s => s > 0);
    if (!speeds.length) return { minSpd: 15, maxSpd: 50 };
    const mn = Math.min(...speeds);
    const mx = Math.max(...speeds);
    return { minSpd: mn, maxSpd: mx > mn ? mx : mn + 1 };
  }, [dailyStats]);

  /* ── Imperative tooltip — zero grid re-renders on hover ─────── */
  const tooltipRef    = useRef<HTMLDivElement>(null);
  const lastKeyRef    = useRef<string | null>(null);

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

    /* Comic-book callout: dark bubble + triangular tail */
    el.innerHTML =
      `<div style="background:#1e1e2e;border-radius:12px;padding:11px 14px;` +
      `box-shadow:0 8px 32px rgba(0,0,0,0.55);">` +
      `<div style="font-weight:700;font-size:13px;margin-bottom:7px;color:#f1f5f9">${dayStr}</div>` +
      rows + `</div>` +
      `<div id="cal-tip-tail" style="position:absolute;width:0;height:0;pointer-events:none;"></div>`;

    const rect    = cellEl.getBoundingClientRect();
    const TW      = el.offsetWidth  || 200;
    const TH      = el.offsetHeight || 140;
    const TAIL    = 9;
    const GAP     = 6;
    const vw      = window.innerWidth;

    const rawLeft = rect.left + rect.width / 2 - TW / 2;
    const left    = Math.max(8, Math.min(vw - TW - 8, rawLeft));
    const isAbove = rect.top > TH + TAIL + GAP + 40;
    const top     = isAbove ? rect.top - TH - TAIL - GAP : rect.bottom + TAIL + GAP;

    /* Tail — points toward the hovered cell */
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

  /* Event delegation — cells carry no React event handlers */
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
  const firstDay   = new Date(calYear, calMonth, 1).getDay();
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

  /* Memoised cells — only rebuilds on data/month change, not on tooltip */
  const cells = useMemo(() => {
    const blanks = Array.from({ length: firstDay }, (_, i) => <div key={`b${i}`} />);
    const days   = Array.from({ length: daysInMo }, (_, i) => {
      const day     = i + 1;
      const dateKey = `${prefixStr}-${String(day).padStart(2, "0")}`;
      const s       = dailyStats.get(dateKey);
      const bg      = s
        ? speedColorNorm(s.avgSpeed, minSpd, maxSpd)
        : dark ? "rgba(148,163,184,0.15)" : "rgba(100,116,139,0.15)";
      const txtClr  = s ? "#fff" : (dark ? "rgba(148,163,184,0.5)" : "rgba(100,116,139,0.45)");
      return (
        <div
          key={dateKey}
          data-dk={s ? dateKey : undefined}
          style={{ display:"flex", alignItems:"center", justifyContent:"center",
            padding:"5px 0", cursor: s ? "pointer" : "default" }}
        >
          <div style={{ width:CIRCLE_D, height:CIRCLE_D, borderRadius:"50%", background:bg,
            display:"flex", alignItems:"center", justifyContent:"center",
            boxShadow: s ? "0 2px 8px rgba(0,0,0,0.2)" : "none",
            transition:"transform 0.13s, box-shadow 0.13s",
          }}>
            <span style={{ fontSize:13, fontWeight:800, color:txtClr,
              lineHeight:1, userSelect:"none" }}>{day}</span>
          </div>
        </div>
      );
    });
    return [...blanks, ...days];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dailyStats, firstDay, daysInMo, prefixStr, dark, minSpd, maxSpd]);

  const navBtn = (label: string, active: boolean, onClick: () => void) => (
    <button onClick={onClick} disabled={!active}
      style={{ background:"none", border:"1px solid hsl(var(--border))", borderRadius:8,
        padding:"3px 11px", fontSize:18, lineHeight:1,
        cursor: active ? "pointer" : "default", opacity: active ? 1 : 0.3,
        color: dark ? "#f1f5f9" : "#1e293b" }}>
      {label}
    </button>
  );

  return (
    <>
      <div style={{ position:"relative" }}>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
        <p style={{ fontFamily:"var(--app-font-display)", fontWeight:700, fontSize:17,
          color: dark ? "#f1f5f9" : "#1e293b" }}>📅 Daily Speed Calendar</p>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          {navBtn("‹", canBack, prevMo)}
          <span style={{ fontWeight:700, fontSize:14, color: dark ? "#f1f5f9" : "#1e293b",
            minWidth:150, textAlign:"center" }}>{monthLabel}</span>
          {navBtn("›", canFwd, nextMo)}
        </div>
      </div>

      {/* Day-of-week headers */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", marginBottom:2 }}>
        {DAY_HDR.map(d => (
          <div key={d} style={{ textAlign:"center", fontSize:10, fontWeight:700,
            textTransform:"uppercase", letterSpacing:"0.06em",
            color: CAL_MUTED, padding:"4px 0" }}>{d}</div>
        ))}
      </div>

      {/* Date cells — event delegation; cells have no React handlers */}
      <div key={fadeKey}
        onMouseMove={handleGridMove}
        onMouseLeave={hideTip}
        style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)",
          animation:"cal-fade-in 0.2s ease" }}>
        {cells}
      </div>

      {/* Speed legend */}
      <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:12,
        justifyContent:"flex-end", fontSize:11, color: CAL_MUTED }}>
        <span>Slow</span>
        <div style={{ width:88, height:7, borderRadius:4,
          background:"linear-gradient(90deg,rgba(239,68,68,0.88),rgba(234,179,8,0.88),rgba(52,211,153,0.88))" }} />
        <span>Fast (km/h)</span>
      </div>

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

/* ── Dashboard ────────────────────────────────────────────────── */
export default function Dashboard() {
  /* UI state */
  const [dark,         setDark]         = useState(true);
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
  const chipTimer = useRef<ReturnType<typeof setTimeout>>();
  const popChip = useCallback((key:string) => {
    clearTimeout(chipTimer.current);
    setChipAnim(a => ({...a,[key]:true}));
    chipTimer.current = setTimeout(() => setChipAnim(a => ({...a,[key]:false})), 400);
  }, []);

  /* slider */
  const [sliderVals,  setSliderVals]  = useState<[number,number]>([0,0]);
  const [showSparkle, setShowSparkle] = useState(false);
  const sparkleTimer = useRef<ReturnType<typeof setTimeout>>();
  /* thumb drag/hover tracking for date tooltips */
  const [dragThumb,   setDragThumb]   = useState<-1|0|1>(-1);
  const sliderValsRef = useRef(sliderVals);
  sliderValsRef.current = sliderVals;
  /* Measure track width so stripe overlays align with Radix thumb centres.
     useLayoutEffect (no deps) reads the DOM after every render and bails out
     when the value is unchanged — safe even if it fires when Track is hidden. */
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

  /* Restore slider + route from URL params (used exactly once after data loads) */
  const urlParamsRef = useRef<{ bl?: number; br?: number; routeApplied: boolean }>({
    bl: typeof URL_PARAMS.bl === "number" ? URL_PARAMS.bl : undefined,
    br: typeof URL_PARAMS.br === "number" ? URL_PARAMS.br : undefined,
    routeApplied: false,
  });

  /* Share */
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout>>();

  /* data */
  const { routes, allRows, loading, error, rowCount } = useTrafficData();

  const routeOptions = useMemo(() => {
    const labels = Array.from(new Set(allRows.map(r => r.label_short))).sort();
    return labels.length ? labels : ["Old Airport Road"];
  }, [allRows]);

  /* Apply URL-param route once the route list has loaded */
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

  /* route label_full for verdict sentence */
  const selectedRouteInfo = useMemo(
    () => routes.find(r => r.label_short === selectedRoute),
    [routes, selectedRoute],
  );
  const labelFull = selectedRouteInfo?.label_full ?? selectedRoute;
  const arrowIdx  = labelFull.indexOf("→");
  const routeOrigin      = arrowIdx > 0 ? labelFull.slice(0, arrowIdx).trim()      : labelFull;
  const routeDestination = arrowIdx > 0 ? labelFull.slice(arrowIdx + 1).trim() : "";
  const routeEndpoints   = routeDestination
    ? `${routeOrigin} → ${routeDestination}`
    : routeOrigin;

  /* chip actions */
  const nextRoute  = () => { setRouteIdx(i => (i+1)%routeOptions.length); popChip("route"); };
  const nextPeriod = () => { setPeriodIdx(i => (i+1)%PERIOD_LIST.length);  popChip("period"); };
  const nextTod    = () => { setTodIdx(i => (i+1)%TOD_LIST.length);         popChip("tod"); };
  const toggleMode = () => {
    setQuestionMode(m => m === "worsened" ? "improved" : "worsened");
    popChip("mode");
  };

  /* ── Slider — full dataset, independent of period chip ─────── */
  const allRouteWeeks = useAllRouteWeeks(allRows, selectedRoute, tod);

  /* Reset slider when route or tod changes (NOT on period change).
     Snaps to config.json baseline_default_start / baseline_default_end. */
  useEffect(() => {
    if (allRouteWeeks.length === 0) return;
    const maxI = allRouteWeeks.length - 1;
    /* If URL params carry slider positions, restore them once then clear */
    const p = urlParamsRef.current;
    if (p.bl !== undefined && p.br !== undefined) {
      setSliderVals([
        Math.max(0, Math.min(p.bl, maxI)),
        Math.min(maxI, Math.max(p.br, 0)),
      ]);
      urlParamsRef.current = { ...p, bl: undefined, br: undefined };
      return;
    }
    const cfgStart = (appConfig as Record<string,string>).baseline_default_start;
    const cfgEnd   = (appConfig as Record<string,string>).baseline_default_end;
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
  /* Corrected percentages for Track-internal overlays — Radix applies a
     translateX in-bounds offset so the thumb visual centre sits at:
     px = (idx/maxIdx) * (trackW - thumbW) + thumbW/2               */
  const THUMB_W = 22;
  const adjPct = (idx: number) =>
    trackW > 0
      ? ((idx / maxIdx) * (trackW - THUMB_W) + THUMB_W / 2) / trackW * 100
      : (idx / maxIdx) * 100;
  const leftTrackPct  = adjPct(safeLeft);
  const rightTrackPct = adjPct(safeRight);

  /* Baseline = slider selection from full history */
  const baselineWeeks = useMemo(
    () => allRouteWeeks.slice(safeLeft, safeRight + 1),
    [allRouteWeeks, safeLeft, safeRight],
  );

  /* Share — encode current view into a URL and copy to clipboard */
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

  /* Recent = weeks after slider right handle AND within period window
     (period is measured back from the last available data point) */
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

  /* Dates for display */
  const baselineStartDate = allRouteWeeks[safeLeft]?.weekKey;
  const baselineEndDate   = allRouteWeeks[safeRight]?.weekKey;
  const recentStartDate   = recentWeeks[0]?.weekKey;
  const lastDate          = allRouteWeeks[allRouteWeeks.length - 1]?.weekKey;

  /* Slider change handler — also detects which thumb is moving */
  const handleSliderChange = useCallback((vals: number[]) => {
    const [l, r] = vals as [number, number];
    const [prevL, prevR] = sliderValsRef.current;
    if (l !== prevL) setDragThumb(0);
    else if (r !== prevR) setDragThumb(1);
    setSliderVals([l, r]);
    const win = r - l;
    if ((win <= 1 || win >= allRouteWeeks.length * 0.85) && !showSparkle) {
      setShowSparkle(true);
      clearTimeout(sparkleTimer.current);
      sparkleTimer.current = setTimeout(() => setShowSparkle(false), 1600);
    }
  }, [allRouteWeeks.length, showSparkle]);

  /* ── Daily stats for calendar — all-day aggregate, ignores ToD filter ── */
  const dailyStats = useDailyStatsAllDay(allRows, selectedRoute);

  /* ── Period-filtered data for charts & KPI cards ─────────── */
  const { merged, selectedStats } = useFilteredData(
    allRows, selectedRoute, period, tod,
  );

  /* ── Data trend — absolute threshold from config ─────────── */
  const VERDICT_THRESHOLD =
    (appConfig as Record<string, number>).verdict_threshold_kmh ?? 0.5;

  type DataTrend = "improved" | "worsened" | "stable" | "insufficient";
  const dataTrend: DataTrend =
    recentSpeed > 0 && baselineSpeed > 0 && recentWeeks.length >= 1
      ? speedDiff >  VERDICT_THRESHOLD ? "improved"
      : speedDiff < -VERDICT_THRESHOLD ? "worsened"
      : "stable"
      : "insufficient";

  /* ── Verdict: hypothesis (chip) × data result (2-D matrix) ── */
  /* The chip is the USER'S HYPOTHESIS. The data either confirms
     or contradicts it. These are fully independent. */
  type VerdictKey =
    | "confirmed_good"      // asked improved, data improved
    | "confirmed_bad"       // asked worsened, data worsened
    | "contradicted_better" // asked worsened, data improved
    | "contradicted_worse"  // asked improved, data worsened
    | "no_change"           // data stable (either hypothesis)
    | "insufficient";       // not enough data

  const verdictKey: VerdictKey =
    dataTrend === "insufficient" ? "insufficient"
    : dataTrend === "stable"     ? "no_change"
    : questionMode === "improved"
      ? dataTrend === "improved" ? "confirmed_good"      : "contradicted_worse"
      : dataTrend === "worsened" ? "confirmed_bad"       : "contradicted_better";

  const VERDICT: Record<VerdictKey, {face:string; msg:string; border:string; bg:string; tc:string}> = {
    confirmed_good: {
      face: "🤩",
      msg:  "Yes! It's gotten better — speed is up. 🎉",
      border:"#6ee7b7", bg:"#f0fdf4", tc:"#065f46",
    },
    confirmed_bad: {
      face: "🥵",
      msg:  "Yep, it's gotten worse — traffic is heavier.",
      border:"#fca5a5", bg:"#fff1f2", tc:"#991b1b",
    },
    contradicted_better: {
      face: "🤩",
      msg:  "Actually, things have improved! Roads are faster.",
      border:"#6ee7b7", bg:"#f0fdf4", tc:"#065f46",
    },
    contradicted_worse: {
      face: "🥵",
      msg:  "Actually, things have gotten worse — traffic is heavier.",
      border:"#fca5a5", bg:"#fff1f2", tc:"#991b1b",
    },
    no_change: {
      face: "😐",
      msg:  "Not really — no meaningful change either way.",
      border:"#fcd34d", bg:"#fffbeb", tc:"#92400e",
    },
    insufficient: {
      face: "🔍",
      msg:  "Need more data — widen the baseline window.",
      border:"#c4b5fd", bg:"#f5f3ff", tc:"#5b21b6",
    },
  };
  const v      = VERDICT[verdictKey];
  const colors = dark ? DC : LC;

  /* Verdict subtitle — friendly sentence with origin→destination */
  const verdictSubtext = verdictKey !== "insufficient" && baselineStartDate
    ? `Comparing baseline (${fmtShortDate(baselineStartDate)}–${fmtShortDate(baselineEndDate)}) to recent (${fmtShortDate(recentStartDate)}–${fmtShortDate(lastDate)}) · ${routeEndpoints} · ${todLabel}`
    : undefined;

  /* Neutral card style — shared by all 4 KPI cards */
  const kpiCard: React.CSSProperties = {
    background: dark ? "rgba(20,30,55,0.92)" : "rgba(248,250,252,0.96)",
    border: "1px solid hsl(var(--border))",
    borderRadius: 18,
    padding: "16px 18px",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  };
  const kpiLabel: React.CSSProperties = {
    fontSize: 11, fontWeight: 600,
    color: dark ? "#94a3b8" : "#64748b",
    display: "flex", alignItems: "center",
  };
  const kpiValue: React.CSSProperties = {
    fontFamily: "var(--app-font-display)", fontWeight: 800,
    fontSize: 26, lineHeight: 1.1, color: dark ? "#f1f5f9" : "#1e293b",
  };
  const kpiSub: React.CSSProperties = {
    fontSize: 11, color: dark ? "#94a3b8" : "#64748b",
  };

  /* ── Render ─────────────────────────────────────────────────── */
  return (
    <div className={dark ? "dark" : ""}>
      <div className="min-h-screen fun-bg transition-colors">

        {/* ── Header ──────────────────────────────────────────── */}
        <header style={{
          background: dark ? "rgba(15,18,40,0.88)" : "rgba(255,255,255,0.78)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid hsl(var(--border))",
          position: "sticky", top: 0, zIndex: 500,
        }}>
          <div style={{ maxWidth:1320, margin:"0 auto", padding:"0.75rem 1.5rem",
            display:"flex", alignItems:"center", justifyContent:"space-between", gap:12 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <span style={{ fontSize:26 }}>🚦</span>
              <div>
                <div style={{ display:"flex", alignItems:"center", gap:8, lineHeight:1.2 }}>
                  <span style={{
                    fontFamily:"var(--app-font-display)", fontWeight:800, fontSize:16,
                    background:"linear-gradient(90deg,#2563eb,#7c3aed)",
                    WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent",
                  }}>
                    TraffiCoracle
                  </span>
                  <Chip icon="📍" variant="city" onClick={() => {}} inert>Bangalore</Chip>
                </div>
                <p style={{ fontSize:11, color:"hsl(var(--muted-foreground))" }}>
                  Live data · {rowCount > 0 ? `${rowCount.toLocaleString()} records` : "loading…"}
                </p>
              </div>
            </div>

            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              {!loading && rowCount > 0 && (
                <button onClick={handleShare} style={{
                  display:"flex", alignItems:"center", gap:5, fontSize:12,
                  border:"1px solid hsl(var(--border))", borderRadius:9999,
                  padding:"5px 12px",
                  color: copied ? "#34d399" : "hsl(var(--muted-foreground))",
                  background: copied ? "rgba(52,211,153,0.1)" : "transparent",
                  cursor:"pointer", transition:"color 0.2s, background 0.2s",
                }} title="Copy shareable link">
                  <Share2 size={13} />
                  {copied ? "Copied!" : "Share"}
                </button>
              )}
              <button onClick={() => setDark(d => !d)} style={{
                width:34, height:34, borderRadius:"50%",
                border:"1px solid hsl(var(--border))",
                background: dark ? "#1e293b" : "white",
                color:"hsl(var(--muted-foreground))",
                display:"flex", alignItems:"center", justifyContent:"center",
              }} aria-label="Toggle dark mode">
                {dark ? <Sun size={15}/> : <Moon size={15}/>}
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
              color: dark ? "#f1f5f9" : "#1e293b",
              display:"flex", flexWrap:"wrap", alignItems:"center",
              justifyContent:"center", gap:"0.3em",
            }}>
              <span>Has traffic</span>
              <Chip
                icon={questionMode === "worsened" ? "🚦" : "✅"}
                variant={questionMode}
                onClick={toggleMode} animate={!!chipAnim.mode}>
                {questionMode}
              </Chip>
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
            <p style={{ marginTop:"0.25rem", fontSize:12, color:"hsl(var(--muted-foreground))" }}>
              Tap any highlighted word to explore a different question.
            </p>
          </div>

          {/* Loading */}
          {loading && (
            <div style={{ textAlign:"center", padding:"4rem 0" }}>
              <div className="animate-float" style={{ fontSize:56, marginBottom:16 }}>🚗</div>
              <p style={{ color:"hsl(var(--muted-foreground))", fontWeight:600 }}>
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
                  background: dark ? "rgba(20,28,50,0.85)" : "rgba(255,255,255,0.92)",
                  border:"1px solid hsl(var(--border))",
                  borderRadius:"1.5rem", padding:"1.25rem 1.5rem 1rem",
                  position:"relative", overflow:"hidden",
                }}>
                  {showSparkle && <Sparkles />}

                  <p style={{ fontFamily:"var(--app-font-display)", fontWeight:700, fontSize:15,
                    color: dark?"#f1f5f9":"#1e293b", marginBottom:14 }}>
                    Compare with this earlier period ↔
                  </p>

                  {/* Slider — always-visible date labels above thumbs + full-width track */}
                  <div style={{ padding:"28px 0 4px", position:"relative" }}>
                    <SliderPrimitive.Root
                      min={0} max={maxIdx} step={1}
                      value={sliderVals} onValueChange={handleSliderChange}
                      onValueCommit={() => setDragThumb(-1)}
                      style={{ position:"relative", display:"flex",
                        alignItems:"center", height:40, userSelect:"none", touchAction:"none" }}
                    >
                      {/* Left thumb date — always visible, brighter on drag */}
                      {baselineStartDate && (
                        <div style={{
                          position:"absolute", left:`${leftPct}%`, top:-20,
                          transform:"translateX(-50%)",
                          fontSize:10, fontWeight: dragThumb === 0 ? 600 : 400,
                          color: dragThumb === 0
                            ? (dark ? "#e2e8f0" : "#1e293b")
                            : (dark ? "#64748b" : "#94a3b8"),
                          whiteSpace:"nowrap", pointerEvents:"none", zIndex:30,
                          transition:"color 0.12s, font-weight 0.12s",
                        }}>
                          {fmtDate(baselineStartDate)}
                        </div>
                      )}
                      {/* Right thumb date — always visible, brighter on drag */}
                      {baselineEndDate && (
                        <div style={{
                          position:"absolute", left:`${rightPct}%`, top:-20,
                          transform:"translateX(-50%)",
                          fontSize:10, fontWeight: dragThumb === 1 ? 600 : 400,
                          color: dragThumb === 1
                            ? (dark ? "#e2e8f0" : "#1e293b")
                            : (dark ? "#64748b" : "#94a3b8"),
                          whiteSpace:"nowrap", pointerEvents:"none", zIndex:30,
                          transition:"color 0.12s, font-weight 0.12s",
                        }}>
                          {fmtDate(baselineEndDate)}
                        </div>
                      )}

                      {/* Full-width gradient track + stripe overlay clipped to baseline window */}
                      <SliderPrimitive.Track ref={trackRef} style={{
                        position:"relative", flexGrow:1,
                        height:10, borderRadius:9999, overflow:"hidden",
                        background:"linear-gradient(90deg,#34d399,#60a5fa,#a78bfa,#f472b6)",
                      }}>
                        {/* Dim left — thumb-centre-corrected so no stripe leaks left */}
                        <div style={{
                          position:"absolute", top:0, left:0,
                          width:`${leftTrackPct}%`, height:"100%",
                          background:"rgba(0,0,0,0.45)", pointerEvents:"none",
                        }} />
                        {/* Stripe — baseline window only */}
                        <div style={{
                          position:"absolute", top:0,
                          left:`${leftTrackPct}%`,
                          width:`${Math.max(0, rightTrackPct - leftTrackPct)}%`,
                          height:"100%",
                          background:"repeating-linear-gradient(45deg,transparent,transparent 4px,rgba(255,255,255,0.55) 4px,rgba(255,255,255,0.55) 8px)",
                          pointerEvents:"none",
                        }} />
                        {/* Dim right — thumb-centre-corrected */}
                        <div style={{
                          position:"absolute", top:0, left:`${rightTrackPct}%`,
                          width:`${100 - rightTrackPct}%`, height:"100%",
                          background:"rgba(0,0,0,0.45)", pointerEvents:"none",
                        }} />
                        <SliderPrimitive.Range style={{ display:"none" }} />
                      </SliderPrimitive.Track>

                      {/* Left thumb — clean pill lever */}
                      <SliderPrimitive.Thumb
                        className="slider-thumb"
                        onPointerDown={() => setDragThumb(0)}
                        style={{ display:"flex", alignItems:"center", justifyContent:"center",
                          width:22, height:40, background:"transparent",
                          border:"none", outline:"none", cursor:"grab", zIndex:10,
                          flexShrink:0 }}
                      >
                        <span style={{
                          display:"block", width:7, height:28, borderRadius:9999,
                          background: dark ? "#e2e8f0" : "white",
                          border:"2px solid #34d399",
                          boxShadow:"0 2px 8px rgba(52,211,153,0.5), 0 1px 3px rgba(0,0,0,0.2)",
                        }} />
                      </SliderPrimitive.Thumb>

                      {/* Right thumb — clean pill lever */}
                      <SliderPrimitive.Thumb
                        className="slider-thumb"
                        onPointerDown={() => setDragThumb(1)}
                        style={{ display:"flex", alignItems:"center", justifyContent:"center",
                          width:22, height:40, background:"transparent",
                          border:"none", outline:"none", cursor:"grab", zIndex:10,
                          flexShrink:0 }}
                      >
                        <span style={{
                          display:"block", width:7, height:28, borderRadius:9999,
                          background: dark ? "#e2e8f0" : "white",
                          border:"2px solid #a78bfa",
                          boxShadow:"0 2px 8px rgba(167,139,250,0.5), 0 1px 3px rgba(0,0,0,0.2)",
                        }} />
                      </SliderPrimitive.Thumb>
                    </SliderPrimitive.Root>
                  </div>

                  {/* Dataset boundary dates below track */}
                  <div style={{ display:"flex", justifyContent:"space-between",
                    fontSize:10, fontWeight:400,
                    color: dark ? "#64748b" : "#94a3b8", marginTop:6 }}>
                    <span>{fmtDate(allRouteWeeks[0]?.weekKey)}</span>
                    <span>{fmtDate(lastDate)}</span>
                  </div>
                </div>
              )}

              {/* ── Verdict ──────────────────────────────────── */}
              <div className="animate-fade-in" style={{
                background: dark ? "rgba(30,40,60,0.8)" : v.bg,
                border:`2px solid ${v.border}`,
                borderRadius:"1.5rem", padding:"1.5rem 2rem",
              }}>
                {/* Headline */}
                <div style={{ textAlign:"center" }}>
                  <div className="animate-bounce-in" key={verdictKey}
                    style={{ fontSize:"3.5rem", lineHeight:1, marginBottom:8 }}>
                    {v.face}
                  </div>
                  <p style={{ fontFamily:"var(--app-font-display)", fontWeight:700, fontSize:18,
                    color: dark?"#f1f5f9":v.tc }}>
                    {v.msg}
                  </p>
                  {verdictSubtext && (
                    <p style={{ marginTop:6, fontSize:12,
                      color: dark?"#94a3b8":v.tc, opacity:0.85, lineHeight:1.6 }}>
                      {verdictSubtext}
                    </p>
                  )}
                </div>

                {/* Speed chart — baseline | taller chart + delta overlay | recent */}
                {(baselineWeeks.length > 0 || recentWeeks.length > 0) && (
                  <div style={{ display:"flex", alignItems:"center", gap:0, marginTop:20, opacity:0.95 }}>

                    {/* Left: Baseline reading */}
                    {baselineSpeed > 0 && (
                      <div style={{ width:"auto", flexShrink:0, textAlign:"center", paddingRight:6 }}>
                        <p style={{ fontSize:10, fontWeight:700, textTransform:"uppercase",
                          letterSpacing:"0.08em", color:"#60a5fa", marginBottom:4 }}>Baseline</p>
                        <p style={{ fontFamily:"var(--app-font-display)", fontWeight:800, fontSize:22,
                          color: dark ? "#f1f5f9" : v.tc, lineHeight:1 }}>
                          {baselineSpeed}<span style={{ fontSize:11, fontWeight:600 }}> km/h</span>
                        </p>
                      </div>
                    )}

                    {/* Centre: napkin chart with delta floating over the gap */}
                    <div style={{ flex:1, position:"relative" }}>
                      <NapkinChart
                        baselineWeeks={baselineWeeks}
                        recentWeeks={recentWeeks}
                        dark={dark}
                        height={120}
                        dateLabels={{
                          bStart: fmtDate(baselineStartDate),
                          bEnd:   fmtDate(baselineEndDate),
                          rStart: fmtDate(recentStartDate),
                          rEnd:   fmtDate(lastDate),
                        }}
                      />
                      {recentSpeed > 0 && baselineSpeed > 0 && (
                        <div style={{
                          position:"absolute", top:"50%", left:"50%",
                          transform:"translate(-50%,-50%)",
                          display:"flex", flexDirection:"column", alignItems:"center",
                          color: speedDiff > 0 ? "#34d399" : speedDiff < 0 ? "#f87171" : "#94a3b8",
                          fontFamily:"var(--app-font-display)", fontWeight:800,
                          background:"rgba(18,20,40,0.82)", backdropFilter:"blur(4px)",
                          borderRadius:8, padding:"4px 9px", lineHeight:1.2,
                          pointerEvents:"none",
                        }}>
                          <span style={{ fontSize:17 }}>
                            {speedDiff > 0 ? "▲" : speedDiff < 0 ? "▼" : "—"}
                          </span>
                          <span style={{ fontSize:10, marginTop:1 }}>
                            {Math.abs(Math.round(speedDiff * 10) / 10)} km/h
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Right: Recent reading */}
                    {recentSpeed > 0 && (
                      <div style={{ width:"auto", flexShrink:0, textAlign:"center", paddingLeft:6 }}>
                        <p style={{ fontSize:10, fontWeight:700, textTransform:"uppercase",
                          letterSpacing:"0.08em", color:"#f472b6", marginBottom:4 }}>Recent</p>
                        <p style={{ fontFamily:"var(--app-font-display)", fontWeight:800, fontSize:22,
                          color: speedDiff > 0 ? "#34d399" : speedDiff < 0 ? "#f87171"
                            : dark ? "#f1f5f9" : v.tc, lineHeight:1 }}>
                          {recentSpeed}<span style={{ fontSize:11, fontWeight:600 }}> km/h</span>
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* ── KPI cards — unified neutral style ─────────── */}
              {selectedStats.count > 0 ? (
                <div style={{ display:"grid",
                  gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))", gap:14 }}>

                  {/* Avg Speed */}
                  <div style={kpiCard}>
                    <span style={{ fontSize:28 }}>⚡</span>
                    <div style={kpiLabel}>Avg Speed ({periodLabel}) <KpiInfo text="Average speed across all trips in the selected period and time slot, for this route." /></div>
                    <p style={kpiValue}>{selectedStats.avgSpeed || "—"}
                      {selectedStats.avgSpeed > 0 && <span style={{ fontSize:14, fontWeight:600 }}> km/h</span>}
                    </p>
                    <p style={kpiSub}>
                      {baselineSpeed > 0
                        ? `Baseline: ${baselineSpeed} km/h`
                        : "Set baseline above"}
                    </p>
                  </div>

                  {/* Median trip */}
                  <div style={kpiCard}>
                    <span style={{ fontSize:28 }}>🕐</span>
                    <div style={kpiLabel}>Median Trip <KpiInfo text="Half of all trips were faster than this, half were slower. A better everyday estimate than the average." /></div>
                    <p style={kpiValue}>{fmtDuration(selectedStats.median)}</p>
                    <p style={kpiSub}>Mean: {fmtDuration(selectedStats.mean)}</p>
                  </div>

                  {/* Bad day trip (p95) */}
                  <div style={kpiCard}>
                    <span style={{ fontSize:28 }}>🔥</span>
                    <div style={kpiLabel}>Bad day trip <KpiInfo text="On a bad day, your trip could take this long. Specifically, 1 in every 20 trips (the 95th percentile) is at least this slow." /></div>
                    <p style={kpiValue}>{fmtDuration(selectedStats.p95)}</p>
                    <p style={kpiSub}>1-in-20 trips take this long</p>
                  </div>

                  {/* Sample count */}
                  <div style={kpiCard}>
                    <span style={{ fontSize:28 }}>📊</span>
                    <div style={kpiLabel}>Readings <KpiInfo text="Total number of hourly traffic readings used to calculate the above figures." /></div>
                    <p style={kpiValue}>{selectedStats.count.toLocaleString()}</p>
                    <p style={kpiSub}>{merged.length} weeks · {periodLabel} window</p>
                  </div>
                </div>
              ) : (
                <div style={{ background: dark?"rgba(30,40,60,0.8)":"rgba(255,255,255,0.8)",
                  border:"1px solid hsl(var(--border))", borderRadius:16,
                  padding:"2.5rem", textAlign:"center" }}>
                  <p style={{ fontSize:36, marginBottom:8 }}>🔍</p>
                  <p style={{ fontWeight:700, color: dark?"#f1f5f9":"#1e293b" }}>
                    No data for these filters
                  </p>
                  <p style={{ fontSize:13, color:"hsl(var(--muted-foreground))", marginTop:4 }}>
                    Tap any chip to try a different combination.
                  </p>
                </div>
              )}

              {/* ── Charts — speed & duration only ───────────── */}
              {merged.length > 0 && (
                <>
                  <div style={{ display:"grid",
                    gridTemplateColumns:"repeat(auto-fit,minmax(420px,1fr))", gap:16 }}>

                    {/* Speed over time */}
                    <div className="chart-card animate-fade-in">
                      <p style={{ fontFamily:"var(--app-font-display)", fontWeight:700, fontSize:15,
                        color: dark?"#f1f5f9":"#1e293b" }}>⚡ Speed Over Time</p>
                      <p style={{ fontSize:12, color:"hsl(var(--muted-foreground))", marginBottom:14 }}>
                        Weekly avg km/h — higher is better
                      </p>
                      <ResponsiveContainer width="100%" height={220}>
                        <AreaChart data={merged} margin={{top:4,right:8,left:-16,bottom:0}}>
                          <defs>
                            <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor={colors.teal} stopOpacity={0.25}/>
                              <stop offset="95%" stopColor={colors.teal} stopOpacity={0}/>
                            </linearGradient>
                            <linearGradient id="pbg" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor={colors.pink} stopOpacity={0.15}/>
                              <stop offset="95%" stopColor={colors.pink} stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false}/>
                          <XAxis dataKey="weekKey" tickFormatter={fmtWeek}
                            tick={{fontSize:11,fill:"hsl(var(--muted-foreground))"}}
                            tickLine={false} axisLine={false}/>
                          <YAxis tick={{fontSize:11,fill:"hsl(var(--muted-foreground))"}}
                            tickLine={false} axisLine={false} unit=" km/h"/>
                          <RCTooltip content={<ChartTooltip/>}/>
                          <Legend wrapperStyle={{fontSize:12,paddingTop:8}}/>
                          <Area type="monotone" dataKey="avgSpeed" name="Avg Speed"
                            stroke={colors.teal} strokeWidth={2.5} fill="url(#sg)" dot={false} connectNulls/>
                          {merged.some(m => m.baselineSpeed != null) && (
                            <Area type="monotone" dataKey="baselineSpeed" name="Route Baseline"
                              stroke={colors.pink} strokeWidth={1.5} strokeDasharray="5 3"
                              fill="url(#pbg)" dot={false} connectNulls/>
                          )}
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Duration over time */}
                    <div className="chart-card animate-fade-in">
                      <p style={{ fontFamily:"var(--app-font-display)", fontWeight:700, fontSize:15,
                        color: dark?"#f1f5f9":"#1e293b" }}>🐌 Trip Duration Over Time</p>
                      <p style={{ fontSize:12, color:"hsl(var(--muted-foreground))", marginBottom:14 }}>
                        Weekly median + bad-day (p{
                          (appConfig as Record<string,number>).worst_case_percentile
                        }) — lower is better
                      </p>
                      <ResponsiveContainer width="100%" height={220}>
                        <LineChart data={merged} margin={{top:4,right:8,left:-16,bottom:0}}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false}/>
                          <XAxis dataKey="weekKey" tickFormatter={fmtWeek}
                            tick={{fontSize:11,fill:"hsl(var(--muted-foreground))"}}
                            tickLine={false} axisLine={false}/>
                          <YAxis tick={{fontSize:11,fill:"hsl(var(--muted-foreground))"}}
                            tickLine={false} axisLine={false} unit=" min"/>
                          <RCTooltip content={<ChartTooltip/>}/>
                          <Legend wrapperStyle={{fontSize:12,paddingTop:8}}/>
                          <Line type="monotone" dataKey="avgDuration" name="Avg Duration"
                            stroke={colors.purple} strokeWidth={2.5} dot={false} connectNulls/>
                          <Line type="monotone" dataKey="p95Duration" name="Bad Day Trip"
                            stroke={colors.primary} strokeWidth={1.5} strokeDasharray="5 3"
                            dot={false} connectNulls/>
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* ── Daily calendar ────────────────────────── */}
                  <div className="chart-card animate-fade-in" style={{ padding:"1.25rem 1.5rem" }}>
                    <CalendarWidget
                      dailyStats={dailyStats}
                      dark={dark}
                      fmtDur={fmtDuration}
                    />
                  </div>
                </>
              )}
            </>
          )}
        </main>

      </div>
    </div>
  );
}

/* need this import for the config reference in JSX */
import appConfig from "../config.json";
