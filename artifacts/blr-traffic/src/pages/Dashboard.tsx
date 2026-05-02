import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { CSVLink } from "react-csv";
import { Sun, Moon, Download } from "lucide-react";
import { useTrafficData, useFilteredData } from "@/lib/useTrafficData";
import type { TimePeriod, TimeOfDay } from "@/lib/useTrafficData";

/* ── Colours ─────────────────────────────────────────────────── */
const LC = { primary:"#2563eb", teal:"#0d9488", purple:"#7c3aed", amber:"#d97706", pink:"#db2777" };
const DC = { primary:"#60a5fa", teal:"#2dd4bf", purple:"#a78bfa", amber:"#fbbf24", pink:"#f472b6" };

/* ── Options ─────────────────────────────────────────────────── */
const PERIOD_LIST: { value: TimePeriod; label: string }[] = [
  { value:"1m", label:"1 month" }, { value:"3m", label:"3 months" },
  { value:"6m", label:"6 months" }, { value:"1y", label:"1 year" },
];
const TOD_LIST: { value: TimeOfDay; label: string }[] = [
  { value:"weekday_morning",   label:"weekday mornings (8–12)" },
  { value:"weekday_afternoon", label:"weekday afternoons (12–18)" },
  { value:"weekday_evening",   label:"weekday evenings (18–22)" },
  { value:"weekends",          label:"weekends (all day)" },
  { value:"all",               label:"any time of day" },
];

/* ── Helpers ─────────────────────────────────────────────────── */
function fmtWeek(s: string) {
  try { return new Date(s).toLocaleDateString("en-IN",{day:"numeric",month:"short"}); } catch { return s; }
}
function fmtSliderDate(s?: string) {
  if (!s) return "—";
  try { return new Date(s).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"2-digit"}); } catch { return s; }
}
function fmtDuration(min: number) {
  if (!min) return "—";
  if (min < 60) return `${min.toFixed(0)} min`;
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}
function weeklyAvgSpeed(weeks: { avgSpeed: number }[]) {
  if (!weeks.length) return 0;
  return Math.round((weeks.reduce((a,b) => a+b.avgSpeed, 0) / weeks.length) * 10) / 10;
}
function weeklyAvgDuration(weeks: { avgDuration: number }[]) {
  if (!weeks.length) return 0;
  return Math.round((weeks.reduce((a,b) => a+b.avgDuration, 0) / weeks.length) * 10) / 10;
}

/* ── Recharts tooltip ────────────────────────────────────────── */
function CustomTooltip({ active, payload, label }: {
  active?: boolean; payload?: Array<{name:string;value:number;color:string}>; label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:"rgba(255,255,255,0.96)", border:"1px solid #e2e8f0",
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

/* ── Chip ────────────────────────────────────────────────────── */
function Chip({ children, icon, variant, onClick, animate }: {
  children: React.ReactNode; icon: string;
  variant:"route"|"period"|"tod"; onClick:()=>void; animate:boolean;
}) {
  return (
    <button className={`chip chip-${variant} ${animate?"animate-pop":""}`} onClick={onClick} title="Click to cycle">
      <span>{icon}</span>{children}
    </button>
  );
}

/* ── Sparkle overlay ─────────────────────────────────────────── */
const SPARKLES = ["🎊","✨","🎉","⭐","💫","🌟","🎊","✨","🎉","💥"];
function Sparkles() {
  return (
    <div style={{ position:"absolute", inset:0, pointerEvents:"none", overflow:"hidden", zIndex:20 }}>
      {SPARKLES.map((e, i) => (
        <span key={i} className="sparkle-particle" style={{
          position:"absolute",
          left:`${4 + i * 9.6}%`,
          top:`${15 + (i % 4) * 16}%`,
          fontSize: 12 + (i % 3) * 8,
          animationDelay:`${i * 0.07}s`,
        }}>{e}</span>
      ))}
    </div>
  );
}

/* ── Main Dashboard ──────────────────────────────────────────── */
export default function Dashboard() {
  const [dark, setDark]         = useState(false);
  const [periodIdx, setPeriodIdx] = useState(2);   // 6 months
  const [todIdx,    setTodIdx]    = useState(1);   // weekday afternoons
  const [routeIdx,  setRouteIdx]  = useState(0);

  /* chip animation */
  const [chipAnim, setChipAnim] = useState<Record<string, boolean>>({});
  const chipTimer = useRef<ReturnType<typeof setTimeout>>();
  const popChip = useCallback((key: string) => {
    clearTimeout(chipTimer.current);
    setChipAnim(a => ({ ...a, [key]: true }));
    chipTimer.current = setTimeout(() => setChipAnim(a => ({ ...a, [key]: false })), 400);
  }, []);

  /* baseline slider */
  const [sliderVals, setSliderVals] = useState<[number, number]>([0, 0]);
  const [showSparkle, setShowSparkle] = useState(false);
  const sparkleTimer = useRef<ReturnType<typeof setTimeout>>();

  /* data */
  const { allRows, loading, error, rowCount } = useTrafficData();

  const routeOptions = useMemo(() => {
    const labels = Array.from(new Set(allRows.map(r => r.label_short))).sort();
    return labels.length ? labels : ["Old Airport Road"];
  }, [allRows]);

  const selectedRoute = routeOptions[routeIdx % routeOptions.length] ?? "Old Airport Road";
  const period        = PERIOD_LIST[periodIdx].value;
  const tod           = TOD_LIST[todIdx].value;
  const periodLabel   = PERIOD_LIST[periodIdx].label;
  const todLabel      = TOD_LIST[todIdx].label;

  const nextRoute  = () => { setRouteIdx(i => (i+1) % routeOptions.length); popChip("route"); };
  const nextPeriod = () => { setPeriodIdx(i => (i+1) % PERIOD_LIST.length); popChip("period"); };
  const nextTod    = () => { setTodIdx(i => (i+1) % TOD_LIST.length);    popChip("tod"); };

  const { merged, selectedStats, baselineStats, filtered } = useFilteredData(
    allRows, selectedRoute, period, tod,
  );

  /* reset slider when filters or data length changes */
  useEffect(() => {
    if (merged.length > 0) {
      const mid = Math.max(0, Math.floor((merged.length - 1) / 2));
      setSliderVals([0, mid]);
    }
  }, [selectedRoute, period, tod, merged.length]);

  /* ── Slider derived values ─────────────────────────────────── */
  const maxIdx    = Math.max(1, merged.length - 1);
  const safeLeft  = Math.max(0, Math.min(sliderVals[0], maxIdx));
  const safeRight = Math.max(safeLeft, Math.min(sliderVals[1], maxIdx));
  const leftPct   = (safeLeft  / maxIdx) * 100;
  const rightPct  = (safeRight / maxIdx) * 100;

  const baselineWeeks = useMemo(() => merged.slice(safeLeft, safeRight + 1), [merged, safeLeft, safeRight]);
  const recentWeeks   = useMemo(() => merged.slice(safeRight + 1),           [merged, safeRight]);

  const baselineSpeed    = weeklyAvgSpeed(baselineWeeks);
  const recentSpeed      = weeklyAvgSpeed(recentWeeks);
  const baselineDuration = weeklyAvgDuration(baselineWeeks);
  const recentDuration   = weeklyAvgDuration(recentWeeks);

  const speedDiff = recentSpeed - baselineSpeed;
  const speedPct  = baselineSpeed > 0 ? Math.round((speedDiff / baselineSpeed) * 100) : 0;

  /* trend from slider */
  const sliderTrend: "improved"|"worsened"|"stable"|"insufficient" =
    recentSpeed > 0 && baselineSpeed > 0 && recentWeeks.length >= 1
      ? recentSpeed > baselineSpeed * 1.05 ? "improved"
      : recentSpeed < baselineSpeed * 0.95 ? "worsened"
      : "stable"
      : "insufficient";

  const handleSliderChange = useCallback((vals: number[]) => {
    const [l, r] = vals as [number, number];
    setSliderVals([l, r]);
    const win = r - l;
    if ((win <= 1 || win >= merged.length * 0.85) && !showSparkle) {
      setShowSparkle(true);
      clearTimeout(sparkleTimer.current);
      sparkleTimer.current = setTimeout(() => setShowSparkle(false), 1600);
    }
  }, [merged.length, showSparkle]);

  const baselineStartDate = merged[safeLeft]?.weekKey;
  const baselineEndDate   = merged[safeRight]?.weekKey;
  const recentStartDate   = merged[safeRight + 1]?.weekKey;
  const lastDate          = merged[merged.length - 1]?.weekKey;

  /* verdict */
  const VERDICT = {
    improved:    { emoji:"✅", msg:"Yes! Traffic is flowing better — speed is up.",  border:"#6ee7b7", bg:"#f0fdf4", tc:"#065f46" },
    worsened:    { emoji:"❌", msg:"Nope — things have slowed down.",                border:"#fca5a5", bg:"#fff1f2", tc:"#991b1b" },
    stable:      { emoji:"⚖️", msg:"Pretty stable — no big change either way.",     border:"#fcd34d", bg:"#fffbeb", tc:"#92400e" },
    insufficient:{ emoji:"🔍", msg:"Need more data — widen the baseline window.",   border:"#c4b5fd", bg:"#f5f3ff", tc:"#5b21b6" },
  } as const;
  const v  = VERDICT[sliderTrend];
  const colors = dark ? DC : LC;

  /* CSV export */
  const csvHeaders = [
    { label:"Week",            key:"weekKey" },
    { label:"Avg Speed km/h",  key:"avgSpeed" },
    { label:"Avg Duration min",key:"avgDuration" },
    { label:"Median min",      key:"medianDuration" },
    { label:"p95 min",         key:"p95Duration" },
    { label:"Samples",         key:"count" },
  ];

  /* hourly distribution */
  const hourDist = useMemo(() => {
    const bins: Record<number, number> = {};
    for (const r of filtered) bins[r.hour] = (bins[r.hour] ?? 0) + 1;
    return Array.from({ length:24 }, (_, h) => ({ hour:`${h}:00`, count: bins[h] ?? 0 }));
  }, [filtered]);

  /* ── Render ──────────────────────────────────────────────────── */
  return (
    <div className={dark ? "dark" : ""}>
      <div className="min-h-screen fun-bg transition-colors">

        {/* ── Header ─────────────────────────────────────────── */}
        <header style={{
          background: dark ? "rgba(15,18,40,0.85)" : "rgba(255,255,255,0.75)",
          backdropFilter:"blur(12px)",
          borderBottom:`1px solid hsl(var(--border))`,
          position:"sticky", top:0, zIndex:50,
        }}>
          <div style={{ maxWidth:1320, margin:"0 auto", padding:"0.75rem 1.5rem",
            display:"flex", alignItems:"center", justifyContent:"space-between", gap:12 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <span style={{ fontSize:26 }}>🚦</span>
              <div>
                <p style={{ fontFamily:"var(--app-font-display)", fontWeight:800, fontSize:15,
                  background:"linear-gradient(90deg,#2563eb,#7c3aed)", WebkitBackgroundClip:"text",
                  WebkitTextFillColor:"transparent", lineHeight:1.2 }}>
                  Bangalore Traffic Monitor
                </p>
                <p style={{ fontSize:11, color:"hsl(var(--muted-foreground))" }}>
                  Live data · {rowCount > 0 ? `${rowCount.toLocaleString()} records` : "loading…"}
                </p>
              </div>
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              {!loading && merged.length > 0 && (
                <CSVLink data={merged} headers={csvHeaders}
                  filename={`blr-${selectedRoute.replace(/\s+/g,"-")}-${period}.csv`}
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

        {/* ── Main ────────────────────────────────────────────── */}
        <main style={{ maxWidth:1320, margin:"0 auto", padding:"2rem 1.5rem",
          display:"flex", flexDirection:"column", gap:"1.75rem" }}>

          {/* Hero question */}
          <div className="animate-bounce-in" style={{ textAlign:"center", padding:"2rem 1rem 0.5rem" }}>
            <h1 style={{
              fontFamily:"var(--app-font-display)", fontWeight:900,
              fontSize:"clamp(1.4rem,3.5vw,2.2rem)", lineHeight:1.5,
              color: dark ? "#f1f5f9" : "#1e293b",
              display:"flex", flexWrap:"wrap", alignItems:"center",
              justifyContent:"center", gap:"0.3em",
            }}>
              <span>Have road conditions improved on</span>
              <Chip icon="🛣️" variant="route"  onClick={nextRoute}  animate={!!chipAnim.route}>{selectedRoute}</Chip>
              <span>over the past</span>
              <Chip icon="📅" variant="period" onClick={nextPeriod} animate={!!chipAnim.period}>{periodLabel}</Chip>
              <span>during</span>
              <Chip icon="⏰" variant="tod"    onClick={nextTod}    animate={!!chipAnim.tod}>{todLabel}</Chip>
              <span>?</span>
            </h1>
            <p style={{ marginTop:"0.4rem", fontSize:13, color:"hsl(var(--muted-foreground))" }}>
              Click any chip to cycle options · Drag the 🔵🐢 handles below to set your comparison window
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

          {/* Content */}
          {!loading && !error && rowCount > 0 && (
            <>
              {/* ── Baseline slider ─────────────────────────── */}
              {merged.length > 1 && (
                <div className="animate-fade-in" style={{
                  background: dark ? "rgba(20,28,50,0.85)" : "rgba(255,255,255,0.92)",
                  border:"1px solid hsl(var(--border))",
                  borderRadius:"1.5rem",
                  padding:"1.25rem 1.5rem 1rem",
                  position:"relative", overflow:"hidden",
                }}>
                  {showSparkle && <Sparkles />}

                  {/* Title row */}
                  <div style={{ display:"flex", alignItems:"center",
                    justifyContent:"space-between", marginBottom:14, flexWrap:"wrap", gap:8 }}>
                    <p style={{ fontFamily:"var(--app-font-display)", fontWeight:700, fontSize:15,
                      color: dark ? "#f1f5f9" : "#1e293b", display:"flex", alignItems:"center", gap:6 }}>
                      📏 Baseline Window
                    </p>
                    <span style={{ fontSize:11, color:"hsl(var(--muted-foreground))",
                      background:"hsl(var(--muted))", borderRadius:9999, padding:"3px 10px" }}>
                      Drag 🔵 🐢 handles · snap to weeks
                    </span>
                  </div>

                  {/* Slider track */}
                  <div style={{ padding:"4px 0 2px" }}>
                    <SliderPrimitive.Root
                      min={0}
                      max={maxIdx}
                      step={1}
                      value={sliderVals}
                      onValueChange={handleSliderChange}
                      style={{ position:"relative", display:"flex",
                        alignItems:"center", height:52, userSelect:"none", touchAction:"none" }}
                    >
                      <SliderPrimitive.Track style={{
                        position:"relative", flexGrow:1,
                        height:14, borderRadius:9999,
                        overflow:"hidden", background:"#e2e8f0",
                      }}>
                        {/* Before baseline – soft gray */}
                        <div style={{
                          position:"absolute", top:0, left:0,
                          width:`${leftPct}%`, height:"100%",
                          background:"linear-gradient(90deg,#cbd5e1,#e2e8f0)",
                        }} />
                        {/* Baseline window – teal→blue */}
                        <div style={{
                          position:"absolute", top:0, left:`${leftPct}%`,
                          width:`${Math.max(0, rightPct - leftPct)}%`, height:"100%",
                          background:"linear-gradient(90deg,#34d399,#60a5fa)",
                        }} />
                        {/* Recent – purple→pink */}
                        <div style={{
                          position:"absolute", top:0, left:`${rightPct}%`,
                          width:`${100 - rightPct}%`, height:"100%",
                          background:"linear-gradient(90deg,#a78bfa,#f472b6)",
                        }} />
                        <SliderPrimitive.Range style={{ display:"none" }} />
                      </SliderPrimitive.Track>

                      {/* Left thumb – baseline start 🔵 */}
                      <SliderPrimitive.Thumb
                        className="slider-thumb"
                        title="Drag to set baseline start"
                        style={{
                          display:"flex", alignItems:"center", justifyContent:"center",
                          width:36, height:36, borderRadius:"50%",
                          background:"white",
                          border:"3px solid #34d399",
                          boxShadow:"0 3px 12px rgba(52,211,153,0.5)",
                          cursor:"grab", fontSize:16, outline:"none", zIndex:10,
                          transition:"transform 0.15s ease, box-shadow 0.15s ease",
                        }}
                      >🔵</SliderPrimitive.Thumb>

                      {/* Right thumb – baseline end 🐢 */}
                      <SliderPrimitive.Thumb
                        className="slider-thumb"
                        title="Drag to set baseline end"
                        style={{
                          display:"flex", alignItems:"center", justifyContent:"center",
                          width:36, height:36, borderRadius:"50%",
                          background:"white",
                          border:"3px solid #60a5fa",
                          boxShadow:"0 3px 12px rgba(96,165,250,0.5)",
                          cursor:"grab", fontSize:16, outline:"none", zIndex:10,
                          transition:"transform 0.15s ease, box-shadow 0.15s ease",
                        }}
                      >🐢</SliderPrimitive.Thumb>
                    </SliderPrimitive.Root>
                  </div>

                  {/* Date axis labels */}
                  <div style={{ display:"flex", justifyContent:"space-between",
                    fontSize:11, color:"hsl(var(--muted-foreground))", marginBottom:14 }}>
                    <span>⏮ {fmtSliderDate(merged[0]?.weekKey)}</span>
                    <span style={{ display:"flex", gap:6, alignItems:"center" }}>
                      <span style={{ display:"inline-block", width:10, height:10,
                        borderRadius:2, background:"linear-gradient(90deg,#34d399,#60a5fa)" }} />
                      🔵 baseline &nbsp;
                      <span style={{ display:"inline-block", width:10, height:10,
                        borderRadius:2, background:"linear-gradient(90deg,#a78bfa,#f472b6)" }} />
                      🐢 recent
                    </span>
                    <span>{fmtSliderDate(lastDate)} ⏭</span>
                  </div>

                  {/* Stats comparison tiles */}
                  <div style={{ display:"flex", gap:10, flexWrap:"wrap", alignItems:"stretch" }}>
                    {/* Baseline tile */}
                    <div style={{ flex:"1 1 160px", background:"linear-gradient(135deg,#d1fae5,#a7f3d0)",
                      borderRadius:14, padding:"10px 14px" }}>
                      <p style={{ fontSize:11, fontWeight:700, textTransform:"uppercase",
                        letterSpacing:"0.06em", color:"#065f46", marginBottom:4 }}>
                        🔵 Baseline · {fmtSliderDate(baselineStartDate)} → {fmtSliderDate(baselineEndDate)}
                      </p>
                      <p style={{ fontFamily:"var(--app-font-display)", fontWeight:800,
                        fontSize:26, lineHeight:1, color:"#1e293b", marginBottom:2 }}>
                        {baselineSpeed || "—"} <span style={{ fontSize:13, fontWeight:600 }}>km/h</span>
                      </p>
                      <p style={{ fontSize:11, color:"#065f46" }}>
                        avg duration: {fmtDuration(baselineDuration)}
                      </p>
                      <p style={{ fontSize:10, color:"#065f46", opacity:0.7, marginTop:2 }}>
                        {baselineWeeks.length} week{baselineWeeks.length !== 1 ? "s" : ""} · {baselineWeeks.reduce((a,b) => a+b.count, 0)} trips
                      </p>
                    </div>

                    {/* Arrow + delta */}
                    <div style={{ display:"flex", flexDirection:"column",
                      alignItems:"center", justifyContent:"center", padding:"0 4px" }}>
                      <span style={{ fontSize:22 }}>→</span>
                      {recentSpeed > 0 && baselineSpeed > 0 && (
                        <span style={{
                          fontFamily:"var(--app-font-display)", fontWeight:800,
                          fontSize:13, marginTop:2,
                          color: speedDiff > 0 ? "#059669" : speedDiff < 0 ? "#dc2626" : "#92400e",
                        }}>
                          {speedDiff > 0 ? "▲" : speedDiff < 0 ? "▼" : "="}
                          {" "}{Math.abs(Math.round(speedDiff * 10) / 10)} km/h
                          {" "}({speedPct > 0 ? "+" : ""}{speedPct}%)
                        </span>
                      )}
                    </div>

                    {/* Recent tile */}
                    <div style={{ flex:"1 1 160px",
                      background: recentSpeed > baselineSpeed
                        ? "linear-gradient(135deg,#dbeafe,#bfdbfe)"
                        : recentSpeed < baselineSpeed
                        ? "linear-gradient(135deg,#fee2e2,#fecaca)"
                        : "linear-gradient(135deg,#fef3c7,#fde68a)",
                      borderRadius:14, padding:"10px 14px" }}>
                      <p style={{ fontSize:11, fontWeight:700, textTransform:"uppercase",
                        letterSpacing:"0.06em", color:"#1e3a5f", marginBottom:4 }}>
                        🐢 Recent · {recentStartDate ? fmtSliderDate(recentStartDate) + " → now" : "—"}
                      </p>
                      <p style={{ fontFamily:"var(--app-font-display)", fontWeight:800,
                        fontSize:26, lineHeight:1, marginBottom:2,
                        color: recentSpeed > baselineSpeed ? "#1d4ed8"
                          : recentSpeed < baselineSpeed ? "#dc2626" : "#92400e" }}>
                        {recentSpeed || (recentWeeks.length === 0 ? "No data" : "—")}
                        {recentSpeed > 0 && <span style={{ fontSize:13, fontWeight:600 }}> km/h</span>}
                      </p>
                      <p style={{ fontSize:11, color:"#1e3a5f" }}>
                        {recentWeeks.length === 0
                          ? "Move 🐢 left to reveal recent data"
                          : `avg duration: ${fmtDuration(recentDuration)}`}
                      </p>
                      {recentWeeks.length > 0 && (
                        <p style={{ fontSize:10, color:"#1e3a5f", opacity:0.7, marginTop:2 }}>
                          {recentWeeks.length} week{recentWeeks.length !== 1 ? "s" : ""} · {recentWeeks.reduce((a,b) => a+b.count, 0)} trips
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ── Verdict bubble ───────────────────────────── */}
              <div className="animate-fade-in" style={{
                background: dark ? "rgba(30,40,60,0.8)" : v.bg,
                border:`2px solid ${v.border}`,
                borderRadius:"1.5rem",
                padding:"1.25rem 1.5rem",
                maxWidth:640, margin:"0 auto", textAlign:"center",
              }}>
                <p style={{ fontSize:36, marginBottom:8, lineHeight:1 }}>{v.emoji}</p>
                <p style={{ fontFamily:"var(--app-font-display)", fontWeight:700, fontSize:17,
                  color: dark ? "#f1f5f9" : v.tc }}>{v.msg}</p>
                {sliderTrend !== "insufficient" && (
                  <p style={{ marginTop:6, fontSize:12, color: dark ? "#94a3b8" : v.tc, opacity:0.8 }}>
                    Baseline {fmtSliderDate(baselineStartDate)}–{fmtSliderDate(baselineEndDate)}
                    {" "}({baselineSpeed} km/h) vs recent {fmtSliderDate(recentStartDate)}–{fmtSliderDate(lastDate)}
                    {" "}({recentSpeed} km/h) on <strong>{selectedRoute}</strong>
                  </p>
                )}
              </div>

              {/* ── KPI cards ───────────────────────────────── */}
              {selectedStats.count > 0 ? (
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))", gap:14 }}>
                  {[
                    { cls:"kpi-card-speed",  emoji:"⚡", label:"Avg Speed (full period)",
                      value: selectedStats.avgSpeed ? `${selectedStats.avgSpeed} km/h` : "—",
                      sub: baselineStats.avgSpeed ? `Route baseline: ${baselineStats.avgSpeed} km/h` : "No route baseline",
                      good: selectedStats.avgSpeed > 0 && baselineStats.avgSpeed > 0
                        ? selectedStats.avgSpeed >= baselineStats.avgSpeed : null },
                    { cls:"kpi-card-median", emoji:"🐌", label:"Median Trip",
                      value: fmtDuration(selectedStats.median),
                      sub:`Mean: ${fmtDuration(selectedStats.mean)}`, good: null },
                    { cls:"kpi-card-p95",    emoji:"🔥", label:"p95 Worst Case",
                      value: fmtDuration(selectedStats.p95),
                      sub:"1-in-20 trips take this long", good: null },
                    { cls:"kpi-card-count",  emoji:"📊", label:"Data Points",
                      value: selectedStats.count.toLocaleString(),
                      sub:`${merged.length} weeks · ${period} window`, good: null },
                  ].map(card => (
                    <div key={card.label} className={`kpi-card ${card.cls}`}>
                      <div style={{ fontSize:28, marginBottom:6 }}>{card.emoji}</div>
                      <p style={{ fontSize:11, fontWeight:700, textTransform:"uppercase",
                        letterSpacing:"0.08em", color: dark?"#94a3b8":"#64748b", marginBottom:2 }}>
                        {card.label}
                      </p>
                      <p style={{ fontFamily:"var(--app-font-display)", fontWeight:800, fontSize:26,
                        lineHeight:1.1, marginBottom:4,
                        color: card.good === true ? "#059669"
                          : card.good === false ? "#dc2626"
                          : dark ? "#f1f5f9" : "#1e293b" }}>
                        {card.value}
                      </p>
                      <p style={{ fontSize:11, color: dark?"#94a3b8":"#64748b" }}>{card.sub}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ background: dark?"rgba(30,40,60,0.8)":"rgba(255,255,255,0.8)",
                  border:"1px solid hsl(var(--border))", borderRadius:16, padding:"2.5rem", textAlign:"center" }}>
                  <p style={{ fontSize:36, marginBottom:8 }}>🔍</p>
                  <p style={{ fontWeight:700, color: dark?"#f1f5f9":"#1e293b" }}>No data for these filters</p>
                  <p style={{ fontSize:13, color:"hsl(var(--muted-foreground))", marginTop:4 }}>
                    Click the chips above to try a different route, period, or time window.
                  </p>
                </div>
              )}

              {/* ── Charts ──────────────────────────────────── */}
              {merged.length > 0 && (
                <>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(420px,1fr))", gap:16 }}>

                    {/* Speed chart with baseline region shading */}
                    <div className="chart-card animate-fade-in">
                      <p style={{ fontFamily:"var(--app-font-display)", fontWeight:700, fontSize:15,
                        color: dark?"#f1f5f9":"#1e293b" }}>⚡ Speed Over Time</p>
                      <p style={{ fontSize:12, color:"hsl(var(--muted-foreground))", marginBottom:14 }}>
                        Weekly avg km/h · 🟢 baseline window highlighted
                      </p>
                      <ResponsiveContainer width="100%" height={220}>
                        <AreaChart data={merged} margin={{ top:4, right:8, left:-16, bottom:0 }}>
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
                            tick={{ fontSize:11, fill:"hsl(var(--muted-foreground))" }}
                            tickLine={false} axisLine={false}/>
                          <YAxis tick={{ fontSize:11, fill:"hsl(var(--muted-foreground))" }}
                            tickLine={false} axisLine={false} unit=" km/h"/>
                          <Tooltip content={<CustomTooltip/>}/>
                          <Legend wrapperStyle={{ fontSize:12, paddingTop:8 }}/>
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

                    {/* Duration chart */}
                    <div className="chart-card animate-fade-in">
                      <p style={{ fontFamily:"var(--app-font-display)", fontWeight:700, fontSize:15,
                        color: dark?"#f1f5f9":"#1e293b" }}>🐌 Trip Duration Over Time</p>
                      <p style={{ fontSize:12, color:"hsl(var(--muted-foreground))", marginBottom:14 }}>
                        Weekly median + p95 (min) — lower is better
                      </p>
                      <ResponsiveContainer width="100%" height={220}>
                        <LineChart data={merged} margin={{ top:4, right:8, left:-16, bottom:0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false}/>
                          <XAxis dataKey="weekKey" tickFormatter={fmtWeek}
                            tick={{ fontSize:11, fill:"hsl(var(--muted-foreground))" }}
                            tickLine={false} axisLine={false}/>
                          <YAxis tick={{ fontSize:11, fill:"hsl(var(--muted-foreground))" }}
                            tickLine={false} axisLine={false} unit=" min"/>
                          <Tooltip content={<CustomTooltip/>}/>
                          <Legend wrapperStyle={{ fontSize:12, paddingTop:8 }}/>
                          <Line type="monotone" dataKey="avgDuration" name="Avg Duration"
                            stroke={colors.purple} strokeWidth={2.5} dot={false} connectNulls/>
                          <Line type="monotone" dataKey="p95Duration" name="p95 Duration"
                            stroke={colors.amber} strokeWidth={1.5} strokeDasharray="5 3" dot={false} connectNulls/>
                        </LineChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Sample count */}
                    <div className="chart-card animate-fade-in">
                      <p style={{ fontFamily:"var(--app-font-display)", fontWeight:700, fontSize:15,
                        color: dark?"#f1f5f9":"#1e293b" }}>📅 Weekly Sample Count</p>
                      <p style={{ fontSize:12, color:"hsl(var(--muted-foreground))", marginBottom:14 }}>
                        Trips recorded per week
                      </p>
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={merged} margin={{ top:4, right:8, left:-16, bottom:0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false}/>
                          <XAxis dataKey="weekKey" tickFormatter={fmtWeek}
                            tick={{ fontSize:11, fill:"hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false}/>
                          <YAxis tick={{ fontSize:11, fill:"hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false}/>
                          <Tooltip content={<CustomTooltip/>}/>
                          <Bar dataKey="count" name="Trips" fill={colors.primary} radius={[5,5,0,0]} opacity={0.85}/>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Hourly distribution */}
                    <div className="chart-card animate-fade-in">
                      <p style={{ fontFamily:"var(--app-font-display)", fontWeight:700, fontSize:15,
                        color: dark?"#f1f5f9":"#1e293b" }}>⏰ Hourly Distribution</p>
                      <p style={{ fontSize:12, color:"hsl(var(--muted-foreground))", marginBottom:14 }}>
                        When are trips recorded?
                      </p>
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={hourDist} margin={{ top:4, right:8, left:-16, bottom:0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false}/>
                          <XAxis dataKey="hour" tick={{ fontSize:10, fill:"hsl(var(--muted-foreground))" }}
                            tickLine={false} axisLine={false} interval={3}/>
                          <YAxis tick={{ fontSize:11, fill:"hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false}/>
                          <Tooltip content={<CustomTooltip/>}/>
                          <Bar dataKey="count" name="Trips" fill={colors.purple} radius={[4,4,0,0]} opacity={0.8}/>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Weekly card grid */}
                  <div>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
                      <p style={{ fontFamily:"var(--app-font-display)", fontWeight:700, fontSize:17,
                        color: dark?"#f1f5f9":"#1e293b" }}>📋 Weekly Breakdown</p>
                      <span style={{ fontSize:12, color:"hsl(var(--muted-foreground))" }}>
                        {merged.length} weeks · most recent first
                      </span>
                    </div>
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(185px,1fr))", gap:10 }}>
                      {[...merged].reverse().map((row, i) => {
                        const idx  = merged.length - 1 - i;
                        const isBaseline = idx >= safeLeft && idx <= safeRight;
                        const isRecent   = idx > safeRight;
                        const speedVsBaseline = row.baselineSpeed
                          ? row.avgSpeed >= row.baselineSpeed ? "🟢" : "🔴" : "⚪";
                        return (
                          <div key={row.weekKey} className="week-card" style={{
                            borderLeft: isBaseline ? "3px solid #34d399"
                              : isRecent ? "3px solid #a78bfa"
                              : "3px solid transparent",
                          }}>
                            <p style={{ fontFamily:"var(--app-font-display)", fontWeight:700,
                              fontSize:13, color: dark?"#f1f5f9":"#1e293b", marginBottom:4,
                              display:"flex", alignItems:"center", gap:4 }}>
                              {speedVsBaseline} {fmtWeek(row.weekKey)}
                              {isBaseline && <span style={{ fontSize:10, background:"#d1fae5", color:"#065f46",
                                borderRadius:9999, padding:"1px 5px", fontWeight:600 }}>baseline</span>}
                              {isRecent && <span style={{ fontSize:10, background:"#ede9fe", color:"#5b21b6",
                                borderRadius:9999, padding:"1px 5px", fontWeight:600 }}>recent</span>}
                            </p>
                            <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
                              {[
                                ["⚡ Speed",   `${row.avgSpeed} km/h`],
                                ["🕐 Median",  fmtDuration(row.medianDuration)],
                                ["🔥 p95",     fmtDuration(row.p95Duration)],
                              ].map(([label, val]) => (
                                <div key={label} style={{ display:"flex", justifyContent:"space-between", fontSize:12 }}>
                                  <span style={{ color:"hsl(var(--muted-foreground))" }}>{label}</span>
                                  <span style={{ fontWeight:600, color: dark?"#f1f5f9":"#1e293b" }}>{val}</span>
                                </div>
                              ))}
                              <div style={{ display:"flex", justifyContent:"space-between", fontSize:11,
                                marginTop:2, paddingTop:4, borderTop:"1px solid hsl(var(--border))" }}>
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
          <a href="https://github.com/thecont1/blr-traffic-monitor" target="_blank" rel="noopener noreferrer"
            style={{ color:colors.primary }}>
            thecont1/blr-traffic-monitor
          </a>{" "}
          · Fetched live, no backend needed 🌐
        </footer>
      </div>
    </div>
  );
}
