import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import {
  AreaChart, Area, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip as RCTooltip, Legend, ResponsiveContainer,
} from "recharts";
import { CSVLink } from "react-csv";
import { Sun, Moon, Download } from "lucide-react";
import {
  useTrafficData, useFilteredData, useAllRouteWeeks, useDailyStats,
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
  baselineWeeks, recentWeeks, dark,
}: {
  baselineWeeks: WeeklyAggregate[];
  recentWeeks:   WeeklyAggregate[];
  dark: boolean;
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

  const W = 500, H = 76;
  const PX = 14, PY = 10;
  const chartW = W - PX * 2;
  const chartH = H - PY * 2 - 14; /* leave 14px for date labels */

  const hasGap = bLen > 0 && rLen > 0;
  /* allocate x-space: 43% baseline / 14% gap / 43% recent (or 100% if only one) */
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

  const muted = dark ? "#475569" : "#cbd5e1";
  const labelColor = dark ? "#64748b" : "#94a3b8";
  const fmtLabel = (s: string) => fmtDate(s);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width:"100%", height:76, display:"block" }}
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Gap connector — dashed */}
      {hasGap && (
        <line
          x1={bXE} y1={toY(baselineWeeks[bLen - 1].avgSpeed)}
          x2={rXS} y2={toY(recentWeeks[0].avgSpeed)}
          stroke={muted} strokeWidth={1.5} strokeDasharray="4 3"
        />
      )}
      {/* Baseline polyline — blue */}
      {bLen > 0 && (
        <polyline points={pts(baselineWeeks, bXS, bXE)}
          fill="none" stroke="#60a5fa" strokeWidth={3.5}
          strokeLinejoin="round" strokeLinecap="round" />
      )}
      {/* Recent polyline — pink */}
      {rLen > 0 && (
        <polyline points={pts(recentWeeks, rXS, rXE)}
          fill="none" stroke="#f472b6" strokeWidth={3.5}
          strokeLinejoin="round" strokeLinecap="round" />
      )}
      {/* Junction dots */}
      {hasGap && bLen > 0 && (
        <circle cx={bXE} cy={toY(baselineWeeks[bLen - 1].avgSpeed)} r={5} fill="#60a5fa" />
      )}
      {hasGap && rLen > 0 && (
        <circle cx={rXS} cy={toY(recentWeeks[0].avgSpeed)} r={5} fill="#f472b6" />
      )}
      {/* Date labels — start / end */}
      {bLen > 0 && (
        <text x={bXS} y={H - 1} fontSize={10} fill={labelColor} textAnchor="start">
          {fmtLabel(baselineWeeks[0].weekKey)}
        </text>
      )}
      {rLen > 0 && (
        <text x={rXE} y={H - 1} fontSize={10} fill={labelColor} textAnchor="end">
          {fmtLabel(recentWeeks[rLen - 1].weekKey)}
        </text>
      )}
    </svg>
  );
}

/* ── Speed → colour helper (15 km/h=red … 50 km/h=green) ─────── */
function speedColor(kmh: number): string {
  const t = Math.max(0, Math.min(1, (kmh - 15) / 35));
  if (t < 0.5) {
    const s = t * 2;
    return `rgba(${Math.round(239+(234-239)*s)},${Math.round(68+(179-68)*s)},${Math.round(68+(8-68)*s)},0.88)`;
  }
  const s = (t - 0.5) * 2;
  return `rgba(${Math.round(234+(52-234)*s)},${Math.round(179+(211-179)*s)},${Math.round(8+(153-8)*s)},0.88)`;
}

/* ── Calendar widget ──────────────────────────────────────────── */
function CalendarWidget({
  dailyStats, dark, fmtDur,
}: {
  dailyStats: Map<string, DayStats>;
  dark: boolean;
  fmtDur: (n: number) => string;
}) {
  const allDates  = useMemo(() => Array.from(dailyStats.keys()).sort(), [dailyStats]);
  const lastStr   = allDates[allDates.length - 1] ?? "";
  const firstStr  = allDates[0] ?? "";

  const parseYM   = (s: string) => {
    const d = new Date(s + "T12:00:00");
    return { y: d.getFullYear(), m: d.getMonth() };
  };

  const initYM = lastStr ? parseYM(lastStr) : { y: new Date().getFullYear(), m: new Date().getMonth() };
  const [calYear,  setCalYear]  = useState(initYM.y);
  const [calMonth, setCalMonth] = useState(initYM.m);

  useEffect(() => {
    if (lastStr) {
      const { y, m } = parseYM(lastStr);
      setCalYear(y); setCalMonth(m);
    }
  }, [lastStr]);

  const [tooltip, setTooltip] = useState<{ dateKey: string; x: number; y: number } | null>(null);
  const tipData = tooltip ? dailyStats.get(tooltip.dateKey) : null;

  const prefixStr  = `${calYear}-${String(calMonth + 1).padStart(2, "0")}`;
  const firstDay   = new Date(calYear, calMonth, 1).getDay();
  const daysInMo   = new Date(calYear, calMonth + 1, 0).getDate();
  const monthLabel = new Date(calYear, calMonth, 1).toLocaleDateString("en-IN", { month:"long", year:"numeric" });

  const minMonthStr = firstStr ? firstStr.slice(0, 7) : prefixStr;
  const { y: ly, m: lm } = lastStr ? parseYM(lastStr) : { y: calYear, m: calMonth };
  const maxMonthStr = `${ly}-${String(lm + 1).padStart(2, "0")}`;
  const canBack    = prefixStr > minMonthStr;
  const canFwd     = prefixStr < maxMonthStr;

  const prevMo = () => {
    if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11); }
    else setCalMonth(m => m - 1);
  };
  const nextMo = () => {
    if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0); }
    else setCalMonth(m => m + 1);
  };

  const DAY_HDR = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const muted   = "hsl(var(--muted-foreground))";
  const cellBg  = dark ? "#0f172a" : "#f8fafc";

  return (
    <div style={{ position:"relative" }}>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
        <p style={{ fontFamily:"var(--app-font-display)", fontWeight:700, fontSize:17,
          color: dark?"#f1f5f9":"#1e293b" }}>📅 Daily Speed Calendar</p>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          {(["‹","›"] as const).map((arrow, ai) => {
            const active = ai === 0 ? canBack : canFwd;
            return (
              <button key={arrow} onClick={ai === 0 ? prevMo : nextMo} disabled={!active}
                style={{ background:"none", border:"1px solid hsl(var(--border))", borderRadius:8,
                  padding:"3px 12px", fontSize:18, lineHeight:1,
                  cursor: active ? "pointer" : "default", opacity: active ? 1 : 0.3,
                  color: dark?"#f1f5f9":"#1e293b" }}>
                {arrow}
              </button>
            );
          })}
          <span style={{ fontWeight:700, fontSize:14, color:dark?"#f1f5f9":"#1e293b",
            minWidth:150, textAlign:"center" }}>
            {monthLabel}
          </span>
        </div>
      </div>

      {/* Day-of-week headers */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:4, marginBottom:4 }}>
        {DAY_HDR.map(d => (
          <div key={d} style={{ textAlign:"center", fontSize:10, fontWeight:700,
            textTransform:"uppercase", letterSpacing:"0.06em", color:muted, padding:"4px 0" }}>
            {d}
          </div>
        ))}
      </div>

      {/* Date cells */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:4 }}>
        {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: daysInMo }).map((_, i) => {
          const day     = i + 1;
          const dateKey = `${prefixStr}-${String(day).padStart(2, "0")}`;
          const s       = dailyStats.get(dateKey);
          const bg      = s ? speedColor(s.avgSpeed) : cellBg;
          const textClr = s ? "#1a2535" : muted;

          return (
            <div key={dateKey}
              onMouseEnter={e => { if (s) setTooltip({ dateKey, x:e.clientX, y:e.clientY }); }}
              onMouseLeave={() => setTooltip(null)}
              onMouseMove={e  => { if (s) setTooltip(t => t ? {...t, x:e.clientX, y:e.clientY} : null); }}
              style={{ background:bg, borderRadius:10, padding:"6px 2px",
                minHeight:56, display:"flex", flexDirection:"column",
                alignItems:"center", justifyContent:"center",
                cursor: s ? "pointer" : "default",
                opacity: s ? 1 : (dark ? 0.25 : 0.4),
                boxShadow: s ? "0 1px 4px rgba(0,0,0,0.14)" : "none",
                transition:"transform 0.1s",
              }}
            >
              <span style={{ fontSize:12, fontWeight:700, color:textClr }}>{day}</span>
              {s
                ? <span style={{ fontSize:10, fontWeight:600, color:"#1a2535", marginTop:2 }}>{s.avgSpeed}</span>
                : <span style={{ fontSize:10, color:muted }}>–</span>
              }
            </div>
          );
        })}
      </div>

      {/* Speed legend */}
      <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:12,
        justifyContent:"flex-end", fontSize:11, color:muted }}>
        <span>Slow</span>
        <div style={{ width:88, height:7, borderRadius:4,
          background:"linear-gradient(90deg,rgba(239,68,68,0.88),rgba(234,179,8,0.88),rgba(52,211,153,0.88))" }} />
        <span>Fast (km/h)</span>
      </div>

      {/* Hover tooltip */}
      {tooltip && tipData && (
        <div style={{ position:"fixed", left:tooltip.x+14, top:tooltip.y-8,
          background: dark?"#1e293b":"white",
          border:"1px solid hsl(var(--border))",
          borderRadius:12, padding:"10px 14px",
          boxShadow:"0 8px 24px rgba(0,0,0,0.22)",
          zIndex:1000, pointerEvents:"none", minWidth:168 }}>
          <p style={{ fontWeight:700, fontSize:13, color:dark?"#f1f5f9":"#1e293b", marginBottom:8 }}>
            {new Date(tooltip.dateKey + "T12:00:00")
              .toLocaleDateString("en-IN", { day:"numeric", month:"short", year:"numeric" })}
          </p>
          {([
            ["⚡ Avg Speed",    `${tipData.avgSpeed} km/h`],
            ["🕐 Median Trip",  fmtDur(tipData.medianDuration)],
            ["🔥 Bad Day Trip", fmtDur(tipData.p95Duration)],
            ["📊 Trips",        String(tipData.count)],
          ] as [string,string][]).map(([lbl, val]) => (
            <div key={lbl} style={{ display:"flex", justifyContent:"space-between",
              gap:16, fontSize:12, marginBottom:3 }}>
              <span style={{ color:muted }}>{lbl}</span>
              <span style={{ fontWeight:600, color:dark?"#f1f5f9":"#1e293b" }}>{val}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Dashboard ────────────────────────────────────────────────── */
export default function Dashboard() {
  /* UI state */
  const [dark,         setDark]         = useState(true);
  const [periodIdx,    setPeriodIdx]    = useState(2);    // 6m
  const [todIdx,       setTodIdx]       = useState(1);    // weekday afternoon
  const [routeIdx,     setRouteIdx]     = useState(0);
  const [questionMode, setQuestionMode] = useState<"worsened"|"improved">("worsened");

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
  useEffect(() => {
    const up = () => setDragThumb(-1);
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, []);

  /* data */
  const { routes, allRows, loading, error, rowCount } = useTrafficData();

  const routeOptions = useMemo(() => {
    const labels = Array.from(new Set(allRows.map(r => r.label_short))).sort();
    return labels.length ? labels : ["Old Airport Road"];
  }, [allRows]);

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
    const cfgStart = (appConfig as Record<string,string>).baseline_default_start;
    const cfgEnd   = (appConfig as Record<string,string>).baseline_default_end;
    let leftIdx  = 0;
    let rightIdx = Math.max(0, Math.floor((allRouteWeeks.length - 1) * 0.5));
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

  /* Baseline = slider selection from full history */
  const baselineWeeks = useMemo(
    () => allRouteWeeks.slice(safeLeft, safeRight + 1),
    [allRouteWeeks, safeLeft, safeRight],
  );

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

  /* ── Daily stats for calendar widget ────────────────────────── */
  const dailyStats = useDailyStats(allRows, selectedRoute, tod);

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

  /* CSV export */
  const csvHeaders = [
    {label:"Week",            key:"weekKey"},
    {label:"Avg Speed km/h",  key:"avgSpeed"},
    {label:"Avg Duration min",key:"avgDuration"},
    {label:"Median min",      key:"medianDuration"},
    {label:"p95 min",         key:"p95Duration"},
    {label:"Samples",         key:"count"},
  ];

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
    fontSize: 11, fontWeight: 700, textTransform: "uppercase",
    letterSpacing: "0.08em", color: dark ? "#94a3b8" : "#64748b",
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
              {!loading && merged.length > 0 && (
                <CSVLink
                  data={merged} headers={csvHeaders}
                  filename={`traffi-${selectedRoute.replace(/\s+/g,"-")}-${period}.csv`}
                  style={{ display:"flex", alignItems:"center", gap:5, fontSize:12,
                    border:"1px solid hsl(var(--border))", borderRadius:9999,
                    padding:"5px 12px", color:"hsl(var(--muted-foreground))",
                    background:"transparent", textDecoration:"none" }}>
                  <Download size={13} /> Export CSV
                </CSVLink>
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
              Tap any highlighted word to explore differently.
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
                      {/* Left thumb date — on drag, friendly light style */}
                      {dragThumb === 0 && baselineStartDate && (
                        <div style={{
                          position:"absolute", left:`${leftPct}%`, top:-20,
                          transform:"translateX(-50%)",
                          fontSize:10, fontWeight:400,
                          color: dark ? "#94a3b8" : "#64748b",
                          whiteSpace:"nowrap", pointerEvents:"none", zIndex:30,
                        }}>
                          {fmtDate(baselineStartDate)}
                        </div>
                      )}
                      {/* Right thumb date — on drag, friendly light style */}
                      {dragThumb === 1 && baselineEndDate && (
                        <div style={{
                          position:"absolute", left:`${rightPct}%`, top:-20,
                          transform:"translateX(-50%)",
                          fontSize:10, fontWeight:400,
                          color: dark ? "#94a3b8" : "#64748b",
                          whiteSpace:"nowrap", pointerEvents:"none", zIndex:30,
                        }}>
                          {fmtDate(baselineEndDate)}
                        </div>
                      )}

                      {/* Full-width gradient track + stripe overlay clipped to baseline window */}
                      <SliderPrimitive.Track style={{
                        position:"relative", flexGrow:1,
                        height:10, borderRadius:9999, overflow:"hidden",
                        background:"linear-gradient(90deg,#34d399,#60a5fa,#a78bfa,#f472b6)",
                      }}>
                        {/* Stripe overlay — baseline window only, sits above gradient */}
                        <div style={{
                          position:"absolute", top:0,
                          left:`${leftPct}%`,
                          width:`${Math.max(0, rightPct - leftPct)}%`,
                          height:"100%",
                          background:"repeating-linear-gradient(45deg,transparent,transparent 4px,rgba(255,255,255,0.25) 4px,rgba(255,255,255,0.25) 8px)",
                          pointerEvents:"none",
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

                {/* Speed numbers — baseline vs recent */}
                {baselineSpeed > 0 && (
                  <div style={{ display:"flex", justifyContent:"center", alignItems:"center",
                    gap:16, marginTop:18, flexWrap:"wrap" }}>
                    <div style={{ textAlign:"center" }}>
                      <p style={{ fontSize:10, fontWeight:700, textTransform:"uppercase",
                        letterSpacing:"0.08em", color:"#60a5fa", marginBottom:4 }}>
                        Baseline
                      </p>
                      <p style={{ fontFamily:"var(--app-font-display)", fontWeight:800, fontSize:30,
                        color: dark?"#f1f5f9":v.tc, lineHeight:1 }}>
                        {baselineSpeed}
                        <span style={{ fontSize:14, fontWeight:600 }}> km/h</span>
                      </p>
                      <p style={{ fontSize:10, color: dark?"#475569":"#94a3b8", marginTop:3 }}>
                        {fmtShortDate(baselineStartDate)}–{fmtShortDate(baselineEndDate)}
                      </p>
                    </div>

                    {recentSpeed > 0 && (
                      <>
                        <div style={{ display:"flex", flexDirection:"column", alignItems:"center",
                          color: speedDiff > 0 ? "#34d399" : speedDiff < 0 ? "#f87171" : "#94a3b8",
                          fontFamily:"var(--app-font-display)", fontWeight:800 }}>
                          <span style={{ fontSize:22 }}>
                            {speedDiff > 0 ? "▲" : speedDiff < 0 ? "▼" : "—"}
                          </span>
                          <span style={{ fontSize:12, marginTop:2 }}>
                            {Math.abs(Math.round(speedDiff * 10) / 10)} km/h
                          </span>
                        </div>

                        <div style={{ textAlign:"center" }}>
                          <p style={{ fontSize:10, fontWeight:700, textTransform:"uppercase",
                            letterSpacing:"0.08em", color:"#f472b6", marginBottom:4 }}>
                            Recent
                          </p>
                          <p style={{ fontFamily:"var(--app-font-display)", fontWeight:800, fontSize:30,
                            color: speedDiff > 0 ? "#34d399" : speedDiff < 0 ? "#f87171"
                              : dark?"#f1f5f9":v.tc, lineHeight:1 }}>
                            {recentSpeed}
                            <span style={{ fontSize:14, fontWeight:600 }}> km/h</span>
                          </p>
                          <p style={{ fontSize:10, color: dark?"#475569":"#94a3b8", marginTop:3 }}>
                            {fmtShortDate(recentStartDate)}–{fmtShortDate(lastDate)}
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Napkin chart */}
                {(baselineWeeks.length > 0 || recentWeeks.length > 0) && (
                  <div style={{ marginTop:16, opacity:0.9 }}>
                    <NapkinChart
                      baselineWeeks={baselineWeeks}
                      recentWeeks={recentWeeks}
                      dark={dark}
                    />
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
                    <p style={kpiLabel}>Avg Speed ({periodLabel})</p>
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
                    <p style={kpiLabel}>Median Trip</p>
                    <p style={kpiValue}>{fmtDuration(selectedStats.median)}</p>
                    <p style={kpiSub}>Mean: {fmtDuration(selectedStats.mean)}</p>
                  </div>

                  {/* Bad day trip (p95) */}
                  <div style={kpiCard} title="1-in-20 trips take this long">
                    <span style={{ fontSize:28 }}>🔥</span>
                    <p style={kpiLabel}>Bad day trip ⓘ</p>
                    <p style={kpiValue}>{fmtDuration(selectedStats.p95)}</p>
                    <p style={kpiSub}>1-in-20 trips take this long</p>
                  </div>

                  {/* Sample count */}
                  <div style={kpiCard}>
                    <span style={{ fontSize:28 }}>📊</span>
                    <p style={kpiLabel}>Data Points</p>
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

        <footer style={{ borderTop:"1px solid hsl(var(--border))", marginTop:"2rem",
          padding:"1rem 1.5rem", textAlign:"center", fontSize:12,
          color:"hsl(var(--muted-foreground))" }}>
          Data:{" "}
          <a href="https://github.com/thecont1/blr-traffic-monitor"
            target="_blank" rel="noopener noreferrer"
            style={{ color:colors.primary }}>thecont1/blr-traffic-monitor</a>
          {" "} · No backend needed 🌐
        </footer>
      </div>
    </div>
  );
}

/* need this import for the config reference in JSX */
import appConfig from "../config.json";
