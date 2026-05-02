import { useState, useMemo, useCallback, useRef } from "react";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { CSVLink } from "react-csv";
import { Sun, Moon, Download } from "lucide-react";
import { useTrafficData, useFilteredData } from "@/lib/useTrafficData";
import type { TimePeriod, TimeOfDay } from "@/lib/useTrafficData";

/* ── Colour palettes ─────────────────────────────────────────── */
const LIGHT_COLORS = {
  primary:  "#2563eb",
  teal:     "#0d9488",
  purple:   "#7c3aed",
  amber:    "#d97706",
  pink:     "#db2777",
};
const DARK_COLORS = {
  primary:  "#60a5fa",
  teal:     "#2dd4bf",
  purple:   "#a78bfa",
  amber:    "#fbbf24",
  pink:     "#f472b6",
};

/* ── Data options ────────────────────────────────────────────── */
const PERIOD_LIST: { value: TimePeriod; label: string }[] = [
  { value: "1m",  label: "1 month" },
  { value: "3m",  label: "3 months" },
  { value: "6m",  label: "6 months" },
  { value: "1y",  label: "1 year" },
];

const TOD_LIST: { value: TimeOfDay; label: string }[] = [
  { value: "weekday_morning",   label: "weekday mornings (8–12)" },
  { value: "weekday_afternoon", label: "weekday afternoons (12–18)" },
  { value: "weekday_evening",   label: "weekday evenings (18–22)" },
  { value: "weekends",          label: "weekends (all day)" },
  { value: "all",               label: "any time of day" },
];

/* ── Helpers ─────────────────────────────────────────────────── */
function fmtWeek(dateStr: string) {
  try { return new Date(dateStr).toLocaleDateString("en-IN", { day: "numeric", month: "short" }); }
  catch { return dateStr; }
}

function fmtDuration(min: number) {
  if (!min) return "—";
  if (min < 60) return `${min.toFixed(0)} min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/* ── Custom recharts tooltip ─────────────────────────────────── */
function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "rgba(255,255,255,0.95)",
      border: "1px solid #e2e8f0",
      borderRadius: 12,
      padding: "10px 14px",
      fontSize: 13,
      boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
    }}>
      <p style={{ fontWeight: 700, marginBottom: 6, color: "#1e293b" }}>{label}</p>
      {payload.map((p) => (
        <div key={p.name} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: p.color, flexShrink: 0 }} />
          <span style={{ color: "#64748b" }}>{p.name}:</span>
          <span style={{ fontWeight: 600, color: "#1e293b" }}>
            {p.name.toLowerCase().includes("speed")
              ? `${p.value} km/h`
              : fmtDuration(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ── Chip component ──────────────────────────────────────────── */
function Chip({ children, icon, variant, onClick, animate }: {
  children: React.ReactNode;
  icon: string;
  variant: "route" | "period" | "tod";
  onClick: () => void;
  animate: boolean;
}) {
  return (
    <button
      className={`chip chip-${variant} ${animate ? "animate-pop" : ""}`}
      onClick={onClick}
      title="Click to cycle"
    >
      <span>{icon}</span>
      {children}
    </button>
  );
}

/* ── Main Dashboard ──────────────────────────────────────────── */
export default function Dashboard() {
  const [dark, setDark] = useState(false);
  const [periodIdx, setPeriodIdx] = useState(2);          // 6 months
  const [todIdx,    setTodIdx]    = useState(1);          // weekday afternoons
  const [routeIdx,  setRouteIdx]  = useState(0);

  const [chipAnim, setChipAnim] = useState<Record<string, boolean>>({});
  const animTimeout = useRef<ReturnType<typeof setTimeout>>();

  const { allRows, loading, error, rowCount } = useTrafficData();

  const routeOptions = useMemo(() => {
    const labels = Array.from(new Set(allRows.map((r) => r.label_short))).sort();
    return labels.length ? labels : ["Old Airport Road"];
  }, [allRows]);

  const selectedRoute = routeOptions[routeIdx % routeOptions.length] ?? "Old Airport Road";
  const period        = PERIOD_LIST[periodIdx].value;
  const tod           = TOD_LIST[todIdx].value;
  const periodLabel   = PERIOD_LIST[periodIdx].label;
  const todLabel      = TOD_LIST[todIdx].label;

  const popChip = useCallback((key: string) => {
    clearTimeout(animTimeout.current);
    setChipAnim((a) => ({ ...a, [key]: true }));
    animTimeout.current = setTimeout(() => setChipAnim((a) => ({ ...a, [key]: false })), 400);
  }, []);

  const nextRoute  = () => { setRouteIdx((i) => (i + 1) % routeOptions.length); popChip("route"); };
  const nextPeriod = () => { setPeriodIdx((i) => (i + 1) % PERIOD_LIST.length); popChip("period"); };
  const nextTod    = () => { setTodIdx((i) => (i + 1) % TOD_LIST.length);    popChip("tod"); };

  const { merged, selectedStats, baselineStats, trend, filtered } = useFilteredData(
    allRows, selectedRoute, period, tod,
  );

  const colors = dark ? DARK_COLORS : LIGHT_COLORS;

  /* verdict config */
  const VERDICT = {
    improved:    { emoji: "✅", msg: "Yes! Traffic is flowing better — speed is up.",   border: "#6ee7b7", bg: "#f0fdf4", textColor: "#065f46" },
    worsened:    { emoji: "❌", msg: "Nope — things have slowed down over this period.", border: "#fca5a5", bg: "#fff1f2", textColor: "#991b1b" },
    stable:      { emoji: "⚖️", msg: "Pretty stable — no big change either way.",       border: "#fcd34d", bg: "#fffbeb", textColor: "#92400e" },
    insufficient:{ emoji: "🔍", msg: "Need more data to give a verdict.",               border: "#c4b5fd", bg: "#f5f3ff", textColor: "#5b21b6" },
  } as const;
  const v = VERDICT[trend];

  const csvHeaders = [
    { label: "Week",            key: "weekKey" },
    { label: "Avg Speed km/h",  key: "avgSpeed" },
    { label: "Avg Duration min",key: "avgDuration" },
    { label: "Median min",      key: "medianDuration" },
    { label: "p95 min",         key: "p95Duration" },
    { label: "Samples",         key: "count" },
  ];

  const hourDist = useMemo(() => {
    const bins: Record<number, number> = {};
    for (const r of filtered) bins[r.hour] = (bins[r.hour] ?? 0) + 1;
    return Array.from({ length: 24 }, (_, h) => ({ hour: `${h}:00`, count: bins[h] ?? 0 }));
  }, [filtered]);

  return (
    <div className={dark ? "dark" : ""}>
      <div className="min-h-screen fun-bg transition-colors">

        {/* ── Top bar ─────────────────────────────────────────── */}
        <header style={{
          background: dark ? "rgba(15,18,40,0.85)" : "rgba(255,255,255,0.75)",
          backdropFilter: "blur(12px)",
          borderBottom: `1px solid hsl(var(--border))`,
          position: "sticky", top: 0, zIndex: 50,
        }}>
          <div style={{ maxWidth: 1320, margin: "0 auto", padding: "0.75rem 1.5rem",
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>

            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 26 }}>🚦</span>
              <div>
                <p style={{ fontFamily: "var(--app-font-display)", fontWeight: 800, fontSize: 15,
                  background: "linear-gradient(90deg,#2563eb,#7c3aed)", WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent", lineHeight: 1.2 }}>
                  Bangalore Traffic Monitor
                </p>
                <p style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>
                  Live data · {rowCount > 0 ? `${rowCount.toLocaleString()} records` : "loading…"}
                </p>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {!loading && merged.length > 0 && (
                <CSVLink
                  data={merged}
                  headers={csvHeaders}
                  filename={`blr-${selectedRoute.replace(/\s+/g,"-")}-${period}.csv`}
                  style={{
                    display: "flex", alignItems: "center", gap: 5, fontSize: 12,
                    border: "1px solid hsl(var(--border))", borderRadius: 9999,
                    padding: "5px 12px", color: "hsl(var(--muted-foreground))",
                    background: "transparent", textDecoration: "none", transition: "all 0.15s",
                  }}
                >
                  <Download size={13} /> Export CSV
                </CSVLink>
              )}
              <button
                onClick={() => setDark((d) => !d)}
                style={{
                  width: 34, height: 34, borderRadius: "50%",
                  border: "1px solid hsl(var(--border))",
                  background: dark ? "#1e293b" : "white",
                  color: "hsl(var(--muted-foreground))",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all 0.2s",
                }}
                aria-label="Toggle dark mode"
              >
                {dark ? <Sun size={15} /> : <Moon size={15} />}
              </button>
            </div>
          </div>
        </header>

        {/* ── Main ──────────────────────────────────────────────── */}
        <main style={{ maxWidth: 1320, margin: "0 auto", padding: "2rem 1.5rem", display: "flex", flexDirection: "column", gap: "1.75rem" }}>

          {/* ── Hero sentence ──────────────────────────────────── */}
          <div className="animate-bounce-in" style={{ textAlign: "center", padding: "2rem 1rem 1rem" }}>
            <h1 style={{
              fontFamily: "var(--app-font-display)", fontWeight: 900,
              fontSize: "clamp(1.4rem, 3.5vw, 2.2rem)",
              lineHeight: 1.5, color: dark ? "#f1f5f9" : "#1e293b",
              display: "flex", flexWrap: "wrap", alignItems: "center",
              justifyContent: "center", gap: "0.3em",
            }}>
              <span>Have road conditions improved on</span>
              <Chip icon="🛣️" variant="route" onClick={nextRoute} animate={!!chipAnim.route}>
                {selectedRoute}
              </Chip>
              <span>over the past</span>
              <Chip icon="📅" variant="period" onClick={nextPeriod} animate={!!chipAnim.period}>
                {periodLabel}
              </Chip>
              <span>during</span>
              <Chip icon="⏰" variant="tod" onClick={nextTod} animate={!!chipAnim.tod}>
                {todLabel}
              </Chip>
              <span>?</span>
            </h1>
            <p style={{ marginTop: "0.5rem", fontSize: 13, color: "hsl(var(--muted-foreground))" }}>
              Click any chip to cycle through options ↑
            </p>
          </div>

          {/* ── Loading ─────────────────────────────────────────── */}
          {loading && (
            <div style={{ textAlign: "center", padding: "4rem 0" }}>
              <div className="animate-float" style={{ fontSize: 56, marginBottom: 16 }}>🚗</div>
              <p style={{ color: "hsl(var(--muted-foreground))", fontWeight: 600 }}>
                Fetching 60k traffic records from GitHub…
              </p>
            </div>
          )}

          {/* ── Error ───────────────────────────────────────────── */}
          {!loading && error && (
            <div style={{
              background: "#fff1f2", border: "1px solid #fca5a5",
              borderRadius: 16, padding: "1.5rem", color: "#991b1b",
            }}>
              <p style={{ fontWeight: 700, marginBottom: 4 }}>😬 Couldn't load data</p>
              <p style={{ fontSize: 13 }}>{error}</p>
            </div>
          )}

          {/* ── Content ─────────────────────────────────────────── */}
          {!loading && !error && rowCount > 0 && (
            <>
              {/* Verdict bubble */}
              <div
                className="animate-fade-in"
                style={{
                  background: dark ? "rgba(30,40,60,0.8)" : v.bg,
                  border: `2px solid ${v.border}`,
                  borderRadius: "1.5rem",
                  padding: "1.25rem 1.5rem",
                  maxWidth: 640, margin: "0 auto",
                  textAlign: "center",
                  position: "relative",
                }}
              >
                <p style={{ fontSize: 36, marginBottom: 8, lineHeight: 1 }}>{v.emoji}</p>
                <p style={{
                  fontFamily: "var(--app-font-display)", fontWeight: 700,
                  fontSize: 17, color: dark ? "#f1f5f9" : v.textColor,
                }}>
                  {v.msg}
                </p>
                {trend !== "insufficient" && (
                  <p style={{ marginTop: 6, fontSize: 13, color: dark ? "#94a3b8" : v.textColor, opacity: 0.8 }}>
                    Comparing first vs. last half of the {periodLabel} window on <strong>{selectedRoute}</strong>
                  </p>
                )}
              </div>

              {/* KPI cards */}
              {selectedStats.count > 0 ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
                  {[
                    {
                      cls: "kpi-card-speed",
                      emoji: "⚡",
                      label: "Avg Speed",
                      value: selectedStats.avgSpeed ? `${selectedStats.avgSpeed} km/h` : "—",
                      sub: baselineStats.avgSpeed ? `Baseline: ${baselineStats.avgSpeed} km/h` : "No baseline data",
                      good: selectedStats.avgSpeed > 0 && baselineStats.avgSpeed > 0
                        ? selectedStats.avgSpeed >= baselineStats.avgSpeed
                        : null,
                    },
                    {
                      cls: "kpi-card-median",
                      emoji: "🐌",
                      label: "Median Trip",
                      value: fmtDuration(selectedStats.median),
                      sub: `Mean: ${fmtDuration(selectedStats.mean)}`,
                      good: null,
                    },
                    {
                      cls: "kpi-card-p95",
                      emoji: "🔥",
                      label: "p95 Worst Case",
                      value: fmtDuration(selectedStats.p95),
                      sub: "1-in-20 trips take this long",
                      good: null,
                    },
                    {
                      cls: "kpi-card-count",
                      emoji: "📊",
                      label: "Data Points",
                      value: selectedStats.count.toLocaleString(),
                      sub: `${merged.length} weeks analyzed`,
                      good: null,
                    },
                  ].map((card) => (
                    <div key={card.label} className={`kpi-card ${card.cls}`}>
                      <div style={{ fontSize: 28, marginBottom: 6 }}>{card.emoji}</div>
                      <p style={{
                        fontSize: 11, fontWeight: 700, textTransform: "uppercase",
                        letterSpacing: "0.08em", color: dark ? "#94a3b8" : "#64748b",
                        marginBottom: 2,
                      }}>
                        {card.label}
                      </p>
                      <p style={{
                        fontFamily: "var(--app-font-display)", fontWeight: 800,
                        fontSize: 26, lineHeight: 1.1, marginBottom: 4,
                        color: card.good === true ? "#059669"
                          : card.good === false ? "#dc2626"
                          : dark ? "#f1f5f9" : "#1e293b",
                      }}>
                        {card.value}
                      </p>
                      <p style={{ fontSize: 11, color: dark ? "#94a3b8" : "#64748b" }}>{card.sub}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{
                  background: dark ? "rgba(30,40,60,0.8)" : "rgba(255,255,255,0.8)",
                  border: "1px solid hsl(var(--border))", borderRadius: 16,
                  padding: "2.5rem", textAlign: "center",
                }}>
                  <p style={{ fontSize: 36, marginBottom: 8 }}>🔍</p>
                  <p style={{ fontWeight: 700, color: dark ? "#f1f5f9" : "#1e293b" }}>No data for these filters</p>
                  <p style={{ fontSize: 13, color: "hsl(var(--muted-foreground))", marginTop: 4 }}>
                    Try clicking the chips to pick a different route, period, or time window.
                  </p>
                </div>
              )}

              {merged.length > 0 && (
                <>
                  {/* Charts 2×2 */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))", gap: 16 }}>

                    {/* Speed trend */}
                    <div className="chart-card animate-fade-in">
                      <p style={{ fontFamily: "var(--app-font-display)", fontWeight: 700, fontSize: 15, color: dark ? "#f1f5f9" : "#1e293b" }}>
                        ⚡ Speed Over Time
                      </p>
                      <p style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", marginBottom: 14 }}>
                        Weekly avg km/h — higher is better
                      </p>
                      <ResponsiveContainer width="100%" height={220}>
                        <AreaChart data={merged} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                          <defs>
                            <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor={colors.teal} stopOpacity={0.25} />
                              <stop offset="95%" stopColor={colors.teal} stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor={colors.pink} stopOpacity={0.15} />
                              <stop offset="95%" stopColor={colors.pink} stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                          <XAxis dataKey="weekKey" tickFormatter={fmtWeek} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                          <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} unit=" km/h" />
                          <Tooltip content={<CustomTooltip />} />
                          <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                          <Area type="monotone" dataKey="avgSpeed" name="Avg Speed" stroke={colors.teal} strokeWidth={2.5} fill="url(#sg)" dot={false} connectNulls />
                          {merged.some((m) => m.baselineSpeed != null) && (
                            <Area type="monotone" dataKey="baselineSpeed" name="Baseline" stroke={colors.pink} strokeWidth={1.5} strokeDasharray="5 3" fill="url(#bg)" dot={false} connectNulls />
                          )}
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Duration trend */}
                    <div className="chart-card animate-fade-in">
                      <p style={{ fontFamily: "var(--app-font-display)", fontWeight: 700, fontSize: 15, color: dark ? "#f1f5f9" : "#1e293b" }}>
                        🐌 Trip Duration Over Time
                      </p>
                      <p style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", marginBottom: 14 }}>
                        Weekly median + p95 (min) — lower is better
                      </p>
                      <ResponsiveContainer width="100%" height={220}>
                        <LineChart data={merged} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                          <XAxis dataKey="weekKey" tickFormatter={fmtWeek} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                          <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} unit=" min" />
                          <Tooltip content={<CustomTooltip />} />
                          <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                          <Line type="monotone" dataKey="avgDuration" name="Avg Duration" stroke={colors.purple} strokeWidth={2.5} dot={false} connectNulls />
                          <Line type="monotone" dataKey="p95Duration" name="p95 Duration" stroke={colors.amber} strokeWidth={1.5} strokeDasharray="5 3" dot={false} connectNulls />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Weekly count */}
                    <div className="chart-card animate-fade-in">
                      <p style={{ fontFamily: "var(--app-font-display)", fontWeight: 700, fontSize: 15, color: dark ? "#f1f5f9" : "#1e293b" }}>
                        📅 Weekly Sample Count
                      </p>
                      <p style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", marginBottom: 14 }}>
                        Trips recorded per week
                      </p>
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={merged} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                          <XAxis dataKey="weekKey" tickFormatter={fmtWeek} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                          <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                          <Tooltip content={<CustomTooltip />} />
                          <Bar dataKey="count" name="Trips" fill={colors.primary} radius={[5, 5, 0, 0]} opacity={0.85} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Hourly distribution */}
                    <div className="chart-card animate-fade-in">
                      <p style={{ fontFamily: "var(--app-font-display)", fontWeight: 700, fontSize: 15, color: dark ? "#f1f5f9" : "#1e293b" }}>
                        ⏰ Hourly Distribution
                      </p>
                      <p style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", marginBottom: 14 }}>
                        When are trips recorded?
                      </p>
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={hourDist} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                          <XAxis dataKey="hour" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} interval={3} />
                          <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                          <Tooltip content={<CustomTooltip />} />
                          <Bar dataKey="count" name="Trips" fill={colors.purple} radius={[4, 4, 0, 0]} opacity={0.8} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Weekly card grid */}
                  <div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                      <p style={{
                        fontFamily: "var(--app-font-display)", fontWeight: 700, fontSize: 17,
                        color: dark ? "#f1f5f9" : "#1e293b",
                      }}>
                        📋 Weekly Breakdown
                      </p>
                      <span style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>
                        {merged.length} weeks
                      </span>
                    </div>
                    <div style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))",
                      gap: 10,
                    }}>
                      {[...merged].reverse().map((row) => {
                        const speedVsBaseline = row.baselineSpeed
                          ? row.avgSpeed >= row.baselineSpeed ? "🟢" : "🔴"
                          : "⚪";
                        return (
                          <div key={row.weekKey} className="week-card">
                            <p style={{
                              fontFamily: "var(--app-font-display)", fontWeight: 700,
                              fontSize: 13, color: dark ? "#f1f5f9" : "#1e293b", marginBottom: 6,
                            }}>
                              {speedVsBaseline} {fmtWeek(row.weekKey)}
                            </p>
                            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                                <span style={{ color: "hsl(var(--muted-foreground))" }}>⚡ Speed</span>
                                <span style={{ fontWeight: 600, color: dark ? "#f1f5f9" : "#1e293b" }}>{row.avgSpeed} km/h</span>
                              </div>
                              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                                <span style={{ color: "hsl(var(--muted-foreground))" }}>🕐 Median</span>
                                <span style={{ fontWeight: 600, color: dark ? "#f1f5f9" : "#1e293b" }}>{fmtDuration(row.medianDuration)}</span>
                              </div>
                              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                                <span style={{ color: "hsl(var(--muted-foreground))" }}>🔥 p95</span>
                                <span style={{ fontWeight: 600, color: dark ? "#94a3b8" : "#64748b" }}>{fmtDuration(row.p95Duration)}</span>
                              </div>
                              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginTop: 2, paddingTop: 4, borderTop: "1px solid hsl(var(--border))" }}>
                                <span style={{ color: "hsl(var(--muted-foreground))" }}>Samples</span>
                                <span style={{ color: "hsl(var(--muted-foreground))" }}>{row.count}</span>
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

        {/* Footer */}
        <footer style={{
          borderTop: "1px solid hsl(var(--border))",
          marginTop: "2rem", padding: "1rem 1.5rem",
          textAlign: "center", fontSize: 12,
          color: "hsl(var(--muted-foreground))",
        }}>
          Data source:{" "}
          <a href="https://github.com/thecont1/blr-traffic-monitor" target="_blank" rel="noopener noreferrer"
            style={{ color: colors.primary }}>
            thecont1/blr-traffic-monitor
          </a>{" "}
          · Fetched live, no backend needed 🌐
        </footer>
      </div>
    </div>
  );
}
