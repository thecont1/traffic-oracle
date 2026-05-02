import { useState, useMemo } from "react";
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
  ReferenceLine,
} from "recharts";
import { CSVLink } from "react-csv";
import { Sun, Moon, TrendingUp, TrendingDown, Minus, Download, RefreshCw, AlertCircle } from "lucide-react";
import { useTrafficData, useFilteredData } from "@/lib/useTrafficData";
import type { TimePeriod, TimeOfDay, Route } from "@/lib/useTrafficData";

const CHART_COLORS = {
  primary: "hsl(211, 100%, 47%)",
  secondary: "hsl(250, 100%, 68%)",
  green: "hsl(130, 100%, 28%)",
  red: "hsl(0, 91%, 34%)",
  muted: "hsl(215, 16%, 46%)",
  baseline: "hsl(330, 81%, 60%)",
};

const DARK_CHART_COLORS = {
  primary: "hsl(211, 100%, 55%)",
  secondary: "hsl(250, 100%, 74%)",
  green: "hsl(130, 100%, 36%)",
  red: "hsl(0, 91%, 42%)",
  muted: "hsl(215, 20%, 58%)",
  baseline: "hsl(330, 81%, 65%)",
};

function fmtWeek(dateStr: string) {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  } catch {
    return dateStr;
  }
}

function fmtDuration(min: number) {
  if (!min) return "—";
  if (min < 60) return `${min.toFixed(0)} min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}

function CustomTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-card-border rounded-lg px-3 py-2 text-sm">
      <p className="font-medium text-foreground mb-1">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-medium text-foreground">
            {p.name.toLowerCase().includes("speed") ? `${p.value} km/h` : fmtDuration(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

const PERIODS: { value: TimePeriod; label: string }[] = [
  { value: "1m", label: "1 Month" },
  { value: "3m", label: "3 Months" },
  { value: "6m", label: "6 Months" },
  { value: "1y", label: "1 Year" },
];

const TIMES_OF_DAY: { value: TimeOfDay; label: string }[] = [
  { value: "weekday_morning", label: "Weekday Morning (8–12)" },
  { value: "weekday_afternoon", label: "Weekday Afternoon (12–18)" },
  { value: "weekday_evening", label: "Weekday Evening (18–22)" },
  { value: "weekends", label: "Weekends (all day)" },
];

export default function Dashboard() {
  const [dark, setDark] = useState(false);
  const [period, setPeriod] = useState<TimePeriod>("6m");
  const [tod, setTod] = useState<TimeOfDay>("weekday_afternoon");
  const [selectedRoute, setSelectedRoute] = useState("Old Airport Road");

  const { routes, allRows, loading, error, rowCount } = useTrafficData();

  const routeOptions = useMemo(() => {
    const labels = Array.from(new Set(allRows.map((r) => r.label_short))).sort();
    return labels;
  }, [allRows]);

  const { merged, selectedStats, baselineStats, trend, filtered } = useFilteredData(
    allRows,
    selectedRoute,
    period,
    tod
  );

  const colors = dark ? DARK_CHART_COLORS : CHART_COLORS;

  const trendConfig = {
    improved: { icon: TrendingUp, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800", label: "Improved" },
    worsened: { icon: TrendingDown, color: "text-red-600 dark:text-red-400", bg: "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800", label: "Worsened" },
    stable: { icon: Minus, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800", label: "Stable" },
    insufficient: { icon: AlertCircle, color: "text-muted-foreground", bg: "bg-muted border-border", label: "Not enough data" },
  };

  const tc = trendConfig[trend];
  const TrendIcon = tc.icon;

  const csvHeaders = [
    { label: "Week", key: "weekKey" },
    { label: "Avg Speed (km/h)", key: "avgSpeed" },
    { label: "Avg Duration (min)", key: "avgDuration" },
    { label: "Median Duration (min)", key: "medianDuration" },
    { label: "p95 Duration (min)", key: "p95Duration" },
    { label: "Sample Count", key: "count" },
  ];

  const hourDist = useMemo(() => {
    const bins: Record<number, number> = {};
    for (const r of filtered) bins[r.hour] = (bins[r.hour] ?? 0) + 1;
    return Array.from({ length: 24 }, (_, h) => ({ hour: `${h}:00`, count: bins[h] ?? 0 }));
  }, [filtered]);

  return (
    <div className={dark ? "dark" : ""}>
      <div className="min-h-screen bg-background text-foreground transition-colors">
        {/* Header */}
        <header className="border-b border-border bg-card">
          <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm">B</div>
              <div>
                <h1 className="text-base font-semibold leading-tight text-foreground">Bangalore Traffic Monitor</h1>
                <p className="text-xs text-muted-foreground">Road conditions analysis</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!loading && rowCount > 0 && (
                <span className="hidden sm:inline text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">
                  {rowCount.toLocaleString()} records loaded
                </span>
              )}
              {!loading && merged.length > 0 && (
                <CSVLink
                  data={merged}
                  headers={csvHeaders}
                  filename={`blr-traffic-${selectedRoute.replace(/\s+/g, "-")}-${period}.csv`}
                  className="flex items-center gap-1.5 text-xs border border-border rounded-lg px-3 py-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                >
                  <Download className="w-3 h-3" />
                  Export CSV
                </CSVLink>
              )}
              <button
                onClick={() => setDark((d) => !d)}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                aria-label="Toggle dark mode"
              >
                {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </header>

        <main className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 space-y-6">
          {/* Hero question */}
          <div className={`rounded-xl border px-5 py-4 flex items-start gap-4 ${tc.bg}`}>
            <TrendIcon className={`w-6 h-6 mt-0.5 flex-shrink-0 ${tc.color}`} />
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-0.5">Analysis Question</p>
              <h2 className="text-lg font-semibold text-foreground leading-snug">
                Have road conditions improved on <span className="underline decoration-dotted">{selectedRoute}</span> over the past{" "}
                {PERIODS.find((p) => p.value === period)?.label.toLowerCase()}?
              </h2>
              {trend !== "insufficient" && (
                <p className={`mt-1.5 font-semibold ${tc.color}`}>
                  {trend === "improved" && "Yes — traffic flow has improved (speed up ↑)"}
                  {trend === "worsened" && "No — conditions have worsened (speed down ↓)"}
                  {trend === "stable" && "Broadly stable — no significant change detected"}
                </p>
              )}
              {trend === "insufficient" && (
                <p className="mt-1.5 text-muted-foreground text-sm">Select a route with data to see the verdict.</p>
              )}
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-muted-foreground">Route</label>
              <select
                value={selectedRoute}
                onChange={(e) => setSelectedRoute(e.target.value)}
                className="text-sm border border-border rounded-lg px-3 py-1.5 bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {routeOptions.length === 0 && (
                  <option value={selectedRoute}>{selectedRoute}</option>
                )}
                {routeOptions.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-muted-foreground">Period</label>
              <div className="flex rounded-lg border border-border overflow-hidden">
                {PERIODS.map((p) => (
                  <button
                    key={p.value}
                    onClick={() => setPeriod(p.value)}
                    className={`text-xs px-3 py-1.5 transition-colors ${
                      period === p.value
                        ? "bg-primary text-primary-foreground"
                        : "bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}
                  >
                    {p.value.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-muted-foreground">Time of day</label>
              <select
                value={tod}
                onChange={(e) => setTod(e.target.value as TimeOfDay)}
                className="text-sm border border-border rounded-lg px-3 py-1.5 bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {TIMES_OF_DAY.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Loading state */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-24 gap-4">
              <RefreshCw className="w-8 h-8 text-primary animate-spin" />
              <p className="text-muted-foreground text-sm">Fetching traffic data from GitHub…</p>
            </div>
          )}

          {/* Error state */}
          {!loading && error && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-foreground">Failed to load traffic data</p>
                <p className="text-sm text-muted-foreground mt-1">{error}</p>
                <p className="text-xs text-muted-foreground mt-2">Check that the GitHub CSV URLs are accessible and the data format matches expectations.</p>
              </div>
            </div>
          )}

          {/* No data state */}
          {!loading && !error && rowCount === 0 && (
            <div className="rounded-xl border border-border bg-muted/30 p-8 text-center">
              <AlertCircle className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
              <p className="font-medium text-foreground">No matching records found</p>
              <p className="text-sm text-muted-foreground mt-1">
                The CSVs loaded but no rows could be matched. Check that route labels in the traffic CSV match the routes CSV, and that timestamps and duration/speed columns are present.
              </p>
            </div>
          )}

          {/* Stats cards */}
          {!loading && !error && rowCount > 0 && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  {
                    label: "Avg Speed",
                    value: selectedStats.avgSpeed ? `${selectedStats.avgSpeed} km/h` : "—",
                    sub: baselineStats.avgSpeed ? `Baseline: ${baselineStats.avgSpeed} km/h` : "No baseline",
                    highlight: selectedStats.avgSpeed > 0 && baselineStats.avgSpeed > 0
                      ? selectedStats.avgSpeed >= baselineStats.avgSpeed ? "good" : "bad"
                      : "neutral",
                  },
                  {
                    label: "Median Trip",
                    value: fmtDuration(selectedStats.median),
                    sub: `Mean: ${fmtDuration(selectedStats.mean)}`,
                    highlight: "neutral",
                  },
                  {
                    label: "p95 Trip",
                    value: fmtDuration(selectedStats.p95),
                    sub: "Worst-case travel time",
                    highlight: "neutral",
                  },
                  {
                    label: "Data Points",
                    value: selectedStats.count.toLocaleString(),
                    sub: `${merged.length} weeks analyzed`,
                    highlight: "neutral",
                  },
                ].map((card) => (
                  <div key={card.label} className="bg-card border border-card-border rounded-xl p-4">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">{card.label}</p>
                    <p className={`text-2xl font-semibold leading-none mb-1.5 ${
                      card.highlight === "good" ? "text-emerald-600 dark:text-emerald-400"
                      : card.highlight === "bad" ? "text-red-600 dark:text-red-400"
                      : "text-foreground"
                    }`}>{card.value}</p>
                    <p className="text-xs text-muted-foreground">{card.sub}</p>
                  </div>
                ))}
              </div>

              {/* Charts */}
              {merged.length > 0 ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  {/* Speed trend */}
                  <div className="bg-card border border-card-border rounded-xl p-5">
                    <h3 className="text-sm font-semibold text-foreground mb-1">Average Speed Over Time</h3>
                    <p className="text-xs text-muted-foreground mb-4">Weekly avg (km/h) — higher is better</p>
                    <ResponsiveContainer width="100%" height={240}>
                      <AreaChart data={merged} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                        <defs>
                          <linearGradient id="speedGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={colors.primary} stopOpacity={0.18} />
                            <stop offset="95%" stopColor={colors.primary} stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="baselineGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={colors.baseline} stopOpacity={0.12} />
                            <stop offset="95%" stopColor={colors.baseline} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                        <XAxis dataKey="weekKey" tickFormatter={fmtWeek} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                        <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} unit=" km/h" />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Area type="monotone" dataKey="avgSpeed" name="Avg Speed" stroke={colors.primary} strokeWidth={2} fill="url(#speedGrad)" dot={false} connectNulls />
                        {merged.some((m) => m.baselineSpeed !== null) && (
                          <Area type="monotone" dataKey="baselineSpeed" name="Baseline Speed" stroke={colors.baseline} strokeWidth={1.5} strokeDasharray="4 2" fill="url(#baselineGrad)" dot={false} connectNulls />
                        )}
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Duration trend */}
                  <div className="bg-card border border-card-border rounded-xl p-5">
                    <h3 className="text-sm font-semibold text-foreground mb-1">Trip Duration Over Time</h3>
                    <p className="text-xs text-muted-foreground mb-4">Weekly median + p95 (min) — lower is better</p>
                    <ResponsiveContainer width="100%" height={240}>
                      <LineChart data={merged} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                        <XAxis dataKey="weekKey" tickFormatter={fmtWeek} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                        <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} unit=" min" />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Line type="monotone" dataKey="avgDuration" name="Avg Duration" stroke={colors.secondary} strokeWidth={2} dot={false} connectNulls />
                        <Line type="monotone" dataKey="p95Duration" name="p95 Duration" stroke={colors.red} strokeWidth={1.5} strokeDasharray="4 2" dot={false} connectNulls />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Weekly sample count */}
                  <div className="bg-card border border-card-border rounded-xl p-5">
                    <h3 className="text-sm font-semibold text-foreground mb-1">Weekly Sample Count</h3>
                    <p className="text-xs text-muted-foreground mb-4">Number of recorded trips per week</p>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={merged} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                        <XAxis dataKey="weekKey" tickFormatter={fmtWeek} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                        <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar dataKey="count" name="Trips" fill={colors.primary} radius={[3, 3, 0, 0]} opacity={0.85} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Hourly distribution */}
                  <div className="bg-card border border-card-border rounded-xl p-5">
                    <h3 className="text-sm font-semibold text-foreground mb-1">Hourly Trip Distribution</h3>
                    <p className="text-xs text-muted-foreground mb-4">When were trips recorded? (selected filters applied)</p>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={hourDist} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                        <XAxis dataKey="hour" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} interval={3} />
                        <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar dataKey="count" name="Trips" fill={colors.secondary} radius={[2, 2, 0, 0]} opacity={0.8} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-border bg-muted/20 p-8 text-center">
                  <p className="font-medium text-foreground">No data for selected filters</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Try switching to a different route, period, or time-of-day window.
                  </p>
                </div>
              )}

              {/* Stats table */}
              {merged.length > 0 && (
                <div className="bg-card border border-card-border rounded-xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-card-border flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-foreground">Weekly Summary Table</h3>
                    <span className="text-xs text-muted-foreground">{merged.length} weeks</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Week</th>
                          <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Avg Speed</th>
                          <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Avg Duration</th>
                          <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Median</th>
                          <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">p95</th>
                          <th className="text-right px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Samples</th>
                        </tr>
                      </thead>
                      <tbody>
                        {merged.map((row, i) => (
                          <tr key={row.weekKey} className={`border-b border-border last:border-0 ${i % 2 === 0 ? "" : "bg-muted/20"}`}>
                            <td className="px-5 py-2.5 font-medium text-foreground">{fmtWeek(row.weekKey)}</td>
                            <td className="px-4 py-2.5 text-right text-foreground">{row.avgSpeed} km/h</td>
                            <td className="px-4 py-2.5 text-right text-foreground">{fmtDuration(row.avgDuration)}</td>
                            <td className="px-4 py-2.5 text-right text-muted-foreground">{fmtDuration(row.medianDuration)}</td>
                            <td className="px-4 py-2.5 text-right text-muted-foreground">{fmtDuration(row.p95Duration)}</td>
                            <td className="px-5 py-2.5 text-right text-muted-foreground">{row.count.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </main>

        <footer className="border-t border-border mt-10 py-4 px-6 text-center">
          <p className="text-xs text-muted-foreground">
            Data: <a href="https://github.com/thecont1/blr-traffic-monitor" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">thecont1/blr-traffic-monitor</a> · Fetched live from GitHub
          </p>
        </footer>
      </div>
    </div>
  );
}
