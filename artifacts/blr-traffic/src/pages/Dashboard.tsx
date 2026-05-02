import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import {
  AreaChart, Area, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip as RCTooltip, Legend, ResponsiveContainer,
} from "recharts";
import { CSVLink } from "react-csv";
import { Sun, Moon, Download } from "lucide-react";
import {
  useTrafficData, useFilteredData, useAllRouteWeeks,
} from "@/lib/useTrafficData";
import type { TimePeriod, TimeOfDay } from "@/lib/useTrafficData";

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
function fmtSliderDate(s?: string) {
  if (!s) return "—";
  try { return new Date(s).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"2-digit"}); } catch { return s; }
}
function fmtShortDate(s?: string) {
  if (!s) return "—";
  try { return new Date(s).toLocaleDateString("en-IN",{day:"numeric",month:"short"}); } catch { return s; }
}
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

  /* Reset slider when route or tod changes (NOT on period change) */
  useEffect(() => {
    if (allRouteWeeks.length > 0) {
      const mid = Math.max(0, Math.floor((allRouteWeeks.length - 1) * 0.5));
      setSliderVals([0, mid]);
    }
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

  /* Slider change handler */
  const handleSliderChange = useCallback((vals: number[]) => {
    const [l, r] = vals as [number, number];
    setSliderVals([l, r]);
    const win = r - l;
    if ((win <= 1 || win >= allRouteWeeks.length * 0.85) && !showSparkle) {
      setShowSparkle(true);
      clearTimeout(sparkleTimer.current);
      sparkleTimer.current = setTimeout(() => setShowSparkle(false), 1600);
    }
  }, [allRouteWeeks.length, showSparkle]);

  /* ── Period-filtered data for charts & KPI cards ─────────── */
  const { merged, selectedStats } = useFilteredData(
    allRows, selectedRoute, period, tod,
  );

  /* ── Data trend (from slider baseline vs recent) ─────────── */
  const dataTrend: "improved"|"worsened"|"stable"|"insufficient" =
    recentSpeed > 0 && baselineSpeed > 0 && recentWeeks.length >= 1
      ? recentSpeed > baselineSpeed * 1.05 ? "improved"
      : recentSpeed < baselineSpeed * 0.95 ? "worsened"
      : "stable"
      : "insufficient";

  /* verdict — flipped when question is "worsened?" */
  type TrendKey = "improved"|"worsened"|"stable"|"insufficient";
  const verdictTrend: TrendKey = questionMode === "improved" ? dataTrend : ({
    improved: "worsened", worsened: "improved", stable: "stable", insufficient: "insufficient",
  } as Record<TrendKey,TrendKey>)[dataTrend];

  const VERDICT: Record<TrendKey, {face:string; msg:string; border:string; bg:string; tc:string}> = {
    improved: {
      face: "🤩",
      msg:  questionMode === "improved"
        ? "Yes! It's gotten better — speed is up. 🎉"
        : "Actually, roads have improved — not worsened!",
      border:"#6ee7b7", bg:"#f0fdf4", tc:"#065f46",
    },
    worsened: {
      face: "🥵",
      msg:  questionMode === "worsened"
        ? "Yep, traffic is heavier — roads have worsened."
        : "Nope — things have actually slowed down.",
      border:"#fca5a5", bg:"#fff1f2", tc:"#991b1b",
    },
    stable: {
      face: "🫤",
      msg:  "Meh. No real change either way.",
      border:"#fcd34d", bg:"#fffbeb", tc:"#92400e",
    },
    insufficient: {
      face: "🔍",
      msg:  "Need more data — widen the baseline window.",
      border:"#c4b5fd", bg:"#f5f3ff", tc:"#5b21b6",
    },
  };
  const v      = VERDICT[verdictTrend];
  const colors = dark ? DC : LC;

  /* Verdict subtitle — friendly sentence with origin→destination */
  const verdictSubtext = verdictTrend !== "insufficient" && baselineStartDate
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
              <span>On</span>
              <Chip icon="🛣️" variant="route"
                onClick={nextRoute} animate={!!chipAnim.route}>{selectedRoute}</Chip>
              <span>, have things</span>
              <Chip
                icon={questionMode === "worsened" ? "🚦" : "✅"}
                variant={questionMode}
                onClick={toggleMode} animate={!!chipAnim.mode}>
                {questionMode}
              </Chip>
              <span>over</span>
              <Chip icon="📅" variant="period"
                onClick={nextPeriod} animate={!!chipAnim.period}>{periodLabel}</Chip>
              <span>during</span>
              <Chip icon="⏰" variant="tod"
                onClick={nextTod} animate={!!chipAnim.tod}>{todLabel}</Chip>
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

                  <div style={{ display:"flex", alignItems:"center",
                    justifyContent:"space-between", marginBottom:14, flexWrap:"wrap", gap:8 }}>
                    <div>
                      <p style={{ fontFamily:"var(--app-font-display)", fontWeight:700, fontSize:15,
                        color: dark?"#f1f5f9":"#1e293b" }}>📏 Baseline Window</p>
                      <p style={{ fontSize:11, color:"hsl(var(--muted-foreground))", marginTop:2 }}>
                        Full history · {allRouteWeeks.length} weeks · drag 🔵 🐢 to set comparison range
                      </p>
                    </div>
                    <span style={{ fontSize:11, color:"hsl(var(--muted-foreground))",
                      background:"hsl(var(--muted))", borderRadius:9999, padding:"3px 10px" }}>
                      📅 period chip filters "recent" only
                    </span>
                  </div>

                  <div style={{ padding:"4px 0 2px" }}>
                    <SliderPrimitive.Root
                      min={0} max={maxIdx} step={1}
                      value={sliderVals} onValueChange={handleSliderChange}
                      style={{ position:"relative", display:"flex",
                        alignItems:"center", height:52, userSelect:"none", touchAction:"none" }}
                    >
                      <SliderPrimitive.Track style={{
                        position:"relative", flexGrow:1,
                        height:14, borderRadius:9999, overflow:"hidden", background:"#e2e8f0",
                      }}>
                        <div style={{ position:"absolute", top:0, left:0,
                          width:`${leftPct}%`, height:"100%",
                          background:"linear-gradient(90deg,#cbd5e1,#e2e8f0)" }} />
                        <div style={{ position:"absolute", top:0, left:`${leftPct}%`,
                          width:`${Math.max(0,rightPct-leftPct)}%`, height:"100%",
                          background:"linear-gradient(90deg,#34d399,#60a5fa)" }} />
                        <div style={{ position:"absolute", top:0, left:`${rightPct}%`,
                          width:`${100-rightPct}%`, height:"100%",
                          background:"linear-gradient(90deg,#a78bfa,#f472b6)" }} />
                        <SliderPrimitive.Range style={{ display:"none" }} />
                      </SliderPrimitive.Track>

                      <SliderPrimitive.Thumb className="slider-thumb"
                        title="Drag to set baseline start"
                        style={{ display:"flex", alignItems:"center", justifyContent:"center",
                          width:36, height:36, borderRadius:"50%", background:"white",
                          border:"3px solid #34d399", boxShadow:"0 3px 12px rgba(52,211,153,0.5)",
                          cursor:"grab", fontSize:16, outline:"none", zIndex:10,
                          transition:"transform 0.15s ease, box-shadow 0.15s ease" }}>🔵
                      </SliderPrimitive.Thumb>

                      <SliderPrimitive.Thumb className="slider-thumb"
                        title="Drag to set baseline end"
                        style={{ display:"flex", alignItems:"center", justifyContent:"center",
                          width:36, height:36, borderRadius:"50%", background:"white",
                          border:"3px solid #60a5fa", boxShadow:"0 3px 12px rgba(96,165,250,0.5)",
                          cursor:"grab", fontSize:16, outline:"none", zIndex:10,
                          transition:"transform 0.15s ease, box-shadow 0.15s ease" }}>🐢
                      </SliderPrimitive.Thumb>
                    </SliderPrimitive.Root>
                  </div>

                  <div style={{ display:"flex", justifyContent:"space-between",
                    fontSize:11, color:"hsl(var(--muted-foreground))", marginBottom:14 }}>
                    <span>⏮ {fmtSliderDate(allRouteWeeks[0]?.weekKey)}</span>
                    <span style={{ display:"flex", gap:6, alignItems:"center" }}>
                      <span style={{ display:"inline-block", width:10, height:10,
                        borderRadius:2, background:"linear-gradient(90deg,#34d399,#60a5fa)" }} />
                      🔵 baseline &nbsp;
                      <span style={{ display:"inline-block", width:10, height:10,
                        borderRadius:2, background:"linear-gradient(90deg,#a78bfa,#f472b6)" }} />
                      🐢 recent ({periodLabel})
                    </span>
                    <span>{fmtSliderDate(lastDate)} ⏭</span>
                  </div>

                  {/* Baseline vs Recent tiles */}
                  <div style={{ display:"flex", gap:10, flexWrap:"wrap", alignItems:"stretch" }}>
                    {/* Baseline tile */}
                    <div style={{ flex:"1 1 160px",
                      background: dark ? "rgba(52,211,153,0.12)" : "#f0fdf4",
                      border: dark ? "1px solid rgba(52,211,153,0.3)" : "1px solid #6ee7b7",
                      borderRadius:14, padding:"10px 14px" }}>
                      <p style={{ fontSize:11, fontWeight:700, textTransform:"uppercase",
                        letterSpacing:"0.06em", color: dark?"#34d399":"#065f46", marginBottom:4 }}>
                        🔵 Baseline · {fmtSliderDate(baselineStartDate)} → {fmtSliderDate(baselineEndDate)}
                      </p>
                      <p style={{ fontFamily:"var(--app-font-display)", fontWeight:800,
                        fontSize:26, lineHeight:1, color: dark?"#f1f5f9":"#1e293b", marginBottom:2 }}>
                        {baselineSpeed || "—"}
                        <span style={{ fontSize:13, fontWeight:600 }}> km/h</span>
                      </p>
                      <p style={{ fontSize:11, color: dark?"#94a3b8":"#065f46" }}>
                        avg trip: {fmtDuration(baselineDuration)}
                      </p>
                      <p style={{ fontSize:10, color: dark?"#64748b":"#065f46", opacity:0.7, marginTop:2 }}>
                        {baselineWeeks.length} wk · {baselineWeeks.reduce((a,b)=>a+b.count,0)} trips
                      </p>
                    </div>

                    {/* Delta */}
                    <div style={{ display:"flex", flexDirection:"column",
                      alignItems:"center", justifyContent:"center", padding:"0 4px" }}>
                      <span style={{ fontSize:22 }}>→</span>
                      {recentSpeed > 0 && baselineSpeed > 0 && (
                        <span style={{ fontFamily:"var(--app-font-display)", fontWeight:800,
                          fontSize:13, marginTop:2,
                          color: speedDiff > 0 ? "#059669" : speedDiff < 0 ? "#dc2626" : "#92400e" }}>
                          {speedDiff > 0 ? "▲" : speedDiff < 0 ? "▼" : "="}{" "}
                          {Math.abs(Math.round(speedDiff*10)/10)} km/h
                          {" "}({speedPct > 0 ? "+" : ""}{speedPct}%)
                        </span>
                      )}
                    </div>

                    {/* Recent tile */}
                    <div style={{ flex:"1 1 160px",
                      background: recentSpeed > baselineSpeed
                        ? dark ? "rgba(96,165,250,0.12)" : "#eff6ff"
                        : recentSpeed < baselineSpeed
                        ? dark ? "rgba(239,68,68,0.10)" : "#fff1f2"
                        : dark ? "rgba(251,191,36,0.10)" : "#fffbeb",
                      border: recentSpeed > baselineSpeed
                        ? dark ? "1px solid rgba(96,165,250,0.3)" : "1px solid #bfdbfe"
                        : recentSpeed < baselineSpeed
                        ? dark ? "1px solid rgba(239,68,68,0.3)" : "1px solid #fca5a5"
                        : dark ? "1px solid rgba(251,191,36,0.3)" : "1px solid #fcd34d",
                      borderRadius:14, padding:"10px 14px" }}>
                      <p style={{ fontSize:11, fontWeight:700, textTransform:"uppercase",
                        letterSpacing:"0.06em", color: dark?"#94a3b8":"#1e3a5f", marginBottom:4 }}>
                        🐢 Recent ({periodLabel}) ·{" "}
                        {recentStartDate ? `${fmtSliderDate(recentStartDate)} → now` : "—"}
                      </p>
                      <p style={{ fontFamily:"var(--app-font-display)", fontWeight:800,
                        fontSize:26, lineHeight:1, marginBottom:2,
                        color: recentSpeed > baselineSpeed
                          ? dark ? "#60a5fa" : "#1d4ed8"
                          : recentSpeed < baselineSpeed
                          ? "#dc2626"
                          : dark ? "#fbbf24" : "#92400e" }}>
                        {recentSpeed || (recentWeeks.length === 0 ? "No recent" : "—")}
                        {recentSpeed > 0 && <span style={{ fontSize:13, fontWeight:600 }}> km/h</span>}
                      </p>
                      <p style={{ fontSize:11, color: dark?"#94a3b8":"#1e3a5f" }}>
                        {recentWeeks.length === 0
                          ? `No data in last ${periodLabel} after baseline`
                          : `avg trip: ${fmtDuration(recentDuration)}`}
                      </p>
                      {recentWeeks.length > 0 && (
                        <p style={{ fontSize:10, color: dark?"#64748b":"#1e3a5f", opacity:0.7, marginTop:2 }}>
                          {recentWeeks.length} wk · {recentWeeks.reduce((a,b)=>a+b.count,0)} trips
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ── Verdict ──────────────────────────────────── */}
              <div className="animate-fade-in" style={{
                background: dark ? "rgba(30,40,60,0.8)" : v.bg,
                border:`2px solid ${v.border}`,
                borderRadius:"1.5rem", padding:"1.5rem 2rem",
                maxWidth:660, margin:"0 auto", textAlign:"center",
              }}>
                <div className="animate-bounce-in" key={verdictTrend}
                  style={{ fontSize:"4rem", lineHeight:1, marginBottom:10 }}>
                  {v.face}
                </div>
                <p style={{ fontFamily:"var(--app-font-display)", fontWeight:700, fontSize:18,
                  color: dark?"#f1f5f9":v.tc }}>
                  {v.msg}
                </p>
                {verdictSubtext && (
                  <p style={{ marginTop:8, fontSize:12,
                    color: dark?"#94a3b8":v.tc, opacity:0.85, lineHeight:1.6 }}>
                    {verdictSubtext}
                  </p>
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

                  {/* ── Weekly card grid ──────────────────────── */}
                  <div>
                    <div style={{ display:"flex", alignItems:"center",
                      justifyContent:"space-between", marginBottom:12 }}>
                      <p style={{ fontFamily:"var(--app-font-display)", fontWeight:700, fontSize:17,
                        color: dark?"#f1f5f9":"#1e293b" }}>📋 Weekly Breakdown</p>
                      <span style={{ fontSize:12, color:"hsl(var(--muted-foreground))" }}>
                        {merged.length} weeks · most recent first
                      </span>
                    </div>
                    <div style={{ display:"grid",
                      gridTemplateColumns:"repeat(auto-fill,minmax(185px,1fr))", gap:10 }}>
                      {[...merged].reverse().map((row, i) => {
                        const idx         = merged.length - 1 - i;
                        const isBaseline  = allRouteWeeks.findIndex(w => w.weekKey === row.weekKey);
                        const inBaseline  = isBaseline >= safeLeft && isBaseline <= safeRight;
                        const inRecent    = recentWeeks.some(w => w.weekKey === row.weekKey);
                        const speedVsBase = row.baselineSpeed
                          ? row.avgSpeed >= row.baselineSpeed ? "🟢" : "🔴"
                          : "⚪";
                        return (
                          <div key={row.weekKey} className="week-card" style={{
                            borderLeft: inBaseline ? "3px solid #34d399"
                              : inRecent ? "3px solid #a78bfa"
                              : "3px solid transparent",
                          }}>
                            <p style={{ fontFamily:"var(--app-font-display)", fontWeight:700,
                              fontSize:13, color: dark?"#f1f5f9":"#1e293b",
                              marginBottom:4, display:"flex", alignItems:"center", gap:4 }}>
                              {speedVsBase} {fmtWeek(row.weekKey)}
                              {inBaseline && (
                                <span style={{ fontSize:10, background:"#d1fae5", color:"#065f46",
                                  borderRadius:9999, padding:"1px 5px", fontWeight:600 }}>
                                  baseline
                                </span>
                              )}
                              {inRecent && (
                                <span style={{ fontSize:10, background:"#ede9fe", color:"#5b21b6",
                                  borderRadius:9999, padding:"1px 5px", fontWeight:600 }}>
                                  recent
                                </span>
                              )}
                            </p>
                            <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
                              {([
                                ["⚡ Speed",   `${row.avgSpeed} km/h`],
                                ["🕐 Median",  fmtDuration(row.medianDuration)],
                                ["🔥 Bad day", fmtDuration(row.p95Duration)],
                              ] as [string,string][]).map(([label, val]) => (
                                <div key={label} style={{ display:"flex",
                                  justifyContent:"space-between", fontSize:12 }}>
                                  <span style={{ color:"hsl(var(--muted-foreground))" }}>{label}</span>
                                  <span style={{ fontWeight:600,
                                    color: dark?"#f1f5f9":"#1e293b" }}>{val}</span>
                                </div>
                              ))}
                              <div style={{ display:"flex", justifyContent:"space-between",
                                fontSize:11, marginTop:2, paddingTop:4,
                                borderTop:"1px solid hsl(var(--border))" }}>
                                <span style={{ color:"hsl(var(--muted-foreground))" }}>Samples</span>
                                <span style={{ color:"hsl(var(--muted-foreground))" }}>{row.count}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
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
