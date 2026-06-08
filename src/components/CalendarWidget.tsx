import { useState, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "@/lib/ThemeContext";
import type { DayStats, TrafficRow, TimeOfDay } from "@/lib/useTrafficData";
import { matchesToD } from "@/lib/useTrafficData";

const CIRCLE_D = 38;
const DAY_HDR  = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const LOOKBACK_DAYS = 100;
const MIN_LOOKBACK_ROWS = 3;
const DECILES = 10;

/* ── Percentile helper ──────────────────────────────────────────── */
function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/* ── Centralised decile palettes ───────────────────────────────── */
/*   band 0 = p0–p10 (slowest)  →  band 9 = p90–p100 (fastest)     */
const PALETTES: Record<string, string[]> = {
  colour: ["#dc2626","#ea580c","#f97316","#f59e0b","#eab308","#a3e635","#4ade80","#22c55e","#16a34a","#15803d"],
  gray:   ["#0a0a0a","#171717","#262626","#404040","#525252","#737373","#a3a3a3","#d4d4d4","#e5e5e5","#fafafa"],
  pastel: ["#fca5a5","#fdba74","#fcd34d","#fde68a","#d9f99d","#bef264","#86efac","#4ade80","#22c55e","#16a34a"],
};

function paletteFor(key: string): string[] {
  return PALETTES[key] ?? PALETTES.colour;
}

function decileColor(themeKey: string, band: number): string {
  const pal = paletteFor(themeKey);
  return pal[Math.max(0, Math.min(9, band))];
}

/** WCAG relative luminance → pick black or white text for contrast. */
function textOn(hex: string): "#111" | "#fff" {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return L > 0.4 ? "#111" : "#fff";
}

/* ── Human-readable ToD label ──────────────────────────────────── */
const TOD_LABELS: Record<TimeOfDay, string> = {
  weekday_morning:   "Weekday Mornings",
  weekday_afternoon: "Weekday Afternoons",
  weekday_evening:   "Weekday Evenings",
  weekends:          "Weekends",
  late_hours:        "Late Hours",
  all:               "All Times",
};

/* ── Plain-language verdict ─────────────────────────────────────── */
function verdict(diff: number, band: number): { text: string; color: string } {
  if (band < 0) return { text:"Not enough data", color:"#94A3B8" };
  if (diff > 3)  return { text:"Faster than usual", color:"#4ade80" };
  if (diff < -3) return { text:"Slower than usual", color:"#f87171" };
  return { text:"Typical for this time", color:"#fbbf24" };
}

/* ── Tooltip data carried per cell ─────────────────────────────── */
interface CellTip {
  id: string;
  dateKey: string;
  avgSpeed: number;
  band: number;
  lookbackCount: number;
  lookbackAvg: number;
  diff: number;
}

export function CalendarWidget({
  dailyStats, allDayStats, allRows, selectedRoute, tod,
  fmtDur, widgetCalYear, widgetCalMonth, onDateClick, cutoffDate,
}: {
  dailyStats: Map<string, DayStats>;
  allDayStats: Map<string, DayStats>;
  allRows: TrafficRow[];
  selectedRoute: string;
  tod: TimeOfDay;
  fmtDur: (n: number) => string;
  widgetCalYear: number;
  widgetCalMonth: number;
  onDateClick?: (dateKey: string) => void;
  cutoffDate?: Date | null;
}) {
  const { theme: thm } = useTheme();

  const [fadeKey, setFadeKey] = useState(0);
  useEffect(() => { setFadeKey(k => k + 1); }, [widgetCalYear, widgetCalMonth]);

  /* ── Tooltip state ───────────────────────────────────────────── */
  const [tip, setTip] = useState<{ data: CellTip; x: number; y: number } | null>(null);

  const showTip = useCallback((data: CellTip, el: HTMLElement) => {
    const er = el.getBoundingClientRect();
    setTip({ data, x: er.left + er.width / 2, y: er.top });
  }, []);

  const hideTip = useCallback(() => setTip(null), []);

  useEffect(() => {
    if (!tip) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") hideTip(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tip, hideTip]);

  /* ── Rows grouped by day-of-week (route + ToD filtered) ─────── */
  const rowsByDow = useMemo(() => {
    const groups: TrafficRow[][] = [[], [], [], [], [], [], []];
    for (const r of allRows) {
      if (r.label_short !== selectedRoute) continue;
      if (!matchesToD(r.hour, r.dayOfWeek, tod)) continue;
      groups[r.dayOfWeek].push(r);
    }
    return groups;
  }, [allRows, selectedRoute, tod]);

  /* ── Band + tooltip metadata for every date in dailyStats ───── */
  const dayBands = useMemo(() => {
    const result = new Map<string, { band: number; tip: CellTip }>();
    for (const [dateKey, s] of dailyStats.entries()) {
      if (s.avgSpeed <= 0) continue;

      const dow = new Date(dateKey + "T12:00:00").getDay();
      const lookbackEnd = new Date(dateKey + "T12:00:00").getTime();
      const lookbackStart = lookbackEnd - LOOKBACK_DAYS * 86400000;

      const speeds: number[] = [];
      for (const r of rowsByDow[dow]) {
        const t = r.timestamp.getTime();
        if (t >= lookbackStart && t < lookbackEnd) {
          speeds.push(r.speed_kmh);
        }
      }

      if (speeds.length < MIN_LOOKBACK_ROWS) {
        result.set(dateKey, {
          band: -1,
          tip: { id:`tip-${dateKey}`, dateKey, avgSpeed:s.avgSpeed,
            band:-1, lookbackCount:speeds.length, lookbackAvg:0, diff:0 },
        });
        continue;
      }

      speeds.sort((a, b) => a - b);
      const boundaries: number[] = [];
      for (let i = 1; i < DECILES; i++) boundaries.push(pct(speeds, i * 10));
      const lookbackAvg = speeds.reduce((a, b) => a + b, 0) / speeds.length;

      let band = DECILES - 1;
      for (let i = 0; i < boundaries.length; i++) {
        if (s.avgSpeed < boundaries[i]) { band = i; break; }
      }

      result.set(dateKey, {
        band,
        tip: { id:`tip-${dateKey}`, dateKey, avgSpeed:s.avgSpeed,
          band, lookbackCount:speeds.length, lookbackAvg, diff:s.avgSpeed - lookbackAvg },
      });
    }
    return result;
  }, [dailyStats, rowsByDow]);

  /* ── Calendar math ──────────────────────────────────────────── */
  const prefixStr  = `${widgetCalYear}-${String(widgetCalMonth + 1).padStart(2, "0")}`;
  const firstDay   = (new Date(widgetCalYear, widgetCalMonth, 1).getDay() + 6) % 7;
  const daysInMo   = new Date(widgetCalYear, widgetCalMonth + 1, 0).getDate();
  const pal        = paletteFor(thm.key);
  const legendAria = `Legend: 10 speed deciles from p0–p10 (slowest, red) to p90–p100 (fastest, green)`;

  /* ── Memoised cells ─────────────────────────────────────────── */
  const cells = useMemo(() => {
    const todayD    = new Date();
    const todayStr  = `${todayD.getFullYear()}-${String(todayD.getMonth()+1).padStart(2,"0")}-${String(todayD.getDate()).padStart(2,"0")}`;
    const isCurrentMo = widgetCalYear === todayD.getFullYear() && widgetCalMonth === todayD.getMonth();

    const cutoffDateStr = cutoffDate
      ? `${cutoffDate.getFullYear()}-${String(cutoffDate.getMonth()+1).padStart(2,"0")}-${String(cutoffDate.getDate()).padStart(2,"0")}`
      : null;

    return Array.from({ length: 42 }, (_, i) => {
      const dayNum = i - firstDay + 1;

      if (dayNum < 1 || dayNum > daysInMo) {
        return (
          <div key={`e${i}`} role="gridcell" aria-hidden="true"
            style={{ display:"flex", alignItems:"center", justifyContent:"center", padding:"5px 0" }}>
            <div style={{ width:CIRCLE_D, height:CIRCLE_D }} />
          </div>
        );
      }

      const dateKey       = `${prefixStr}-${String(dayNum).padStart(2,"0")}`;
      const s             = dailyStats.get(dateKey);
      const entry         = dayBands.get(dateKey);
      const isBeyondCutoff = !!cutoffDateStr && dateKey > cutoffDateStr;
      const isFuture      = !isBeyondCutoff && isCurrentMo && dateKey >= todayStr;
      const hasData       = !!s && !!entry && entry.band >= 0 && !isFuture && !isBeyondCutoff;
      const band          = entry?.band ?? -1;

      const dateObj  = new Date(dateKey + "T12:00:00");
      const dayLabel = dateObj.toLocaleDateString("en-IN", {
        weekday:"long", day:"numeric", month:"long", year:"numeric",
      });

      let circleStyle: React.CSSProperties;
      let txtClr: string;

      if (isBeyondCutoff || isFuture) {
        circleStyle = { border:`2px dashed ${thm.textMuted}`, background:"transparent" };
        txtClr = thm.textMuted;
      } else if (hasData) {
        const bg = decileColor(thm.key, band);
        circleStyle = { background:bg, border:`2px solid ${bg}`, boxShadow:"0 2px 8px rgba(0,0,0,0.12)" };
        txtClr = textOn(bg);
      } else if (s) {
        circleStyle = { border:"2px dashed #6b7280", background:"transparent" };
        txtClr = "#6b7280";
      } else {
        circleStyle = { border:`2px dashed ${thm.textMuted}`, background:"transparent" };
        txtClr = thm.textMuted;
      }

      const ariaLabel = hasData && entry
        ? `${dayLabel}. ${selectedRoute}, ${TOD_LABELS[tod]}. ` +
          `${Math.round(entry.tip.avgSpeed)} km/h. ` +
          `Decile ${band + 1} of 10. ` +
          `${entry.tip.diff >= 0 ? "+" : ""}${Math.round(entry.tip.diff)} km/h vs baseline.`
        : isFuture ? `${dayLabel}. Future date.`
        : isBeyondCutoff ? `${dayLabel}. Beyond cutoff.`
        : s ? `${dayLabel}. Insufficient lookback data.`
        : `${dayLabel}. No data.`;

      return (
        <div
          key={dateKey}
          role="gridcell"
          tabIndex={hasData ? 0 : undefined}
          aria-label={ariaLabel}
          aria-describedby={hasData && entry ? entry.tip.id : undefined}
          data-dk={hasData ? dateKey : undefined}
          onClick={hasData && onDateClick ? () => onDateClick(dateKey) : undefined}
          onMouseEnter={hasData && entry ? (e) => showTip(entry.tip, e.currentTarget) : undefined}
          onMouseLeave={hasData ? hideTip : undefined}
          onFocus={hasData && entry ? (e) => showTip(entry.tip, e.currentTarget) : undefined}
          onBlur={hasData ? hideTip : undefined}
          style={{ display:"flex", alignItems:"center", justifyContent:"center",
            padding:"5px 0", cursor: hasData ? "pointer" : "default",
            outline: "none", borderRadius: "50%" }}
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
  }, [dailyStats, dayBands, firstDay, daysInMo, prefixStr, thm.key, thm.textMuted,
      widgetCalYear, widgetCalMonth, cutoffDate, onDateClick, selectedRoute, tod, showTip, hideTip]);

  /* ── Tooltip rendering ──────────────────────────────────────── */
  const renderTooltip = () => {
    if (!tip) return null;
    const d = tip.data;
    const v = verdict(d.diff, d.band);
    const diffSign = d.diff >= 0 ? "+" : "";
    const isGray = thm.key === "gray";

    /* Theme-adaptive tooltip surface */
    const tipBg      = isGray ? "#FAFAFA" : "#0F172A";
    const tipText    = isGray ? "#111"    : "#F0F4F8";
    const tipMuted   = isGray ? "#737373" : "#64748B";
    const tipBorder  = isGray ? "#D4D4D4" : "#334155";
    const tipShadow  = isGray ? "2px 2px 0 #000" : "4px 4px 0 rgba(0,0,0,0.35)";
    const tipDivider = isGray ? "#E5E5E5" : "#1E293B";

    return (
      <div
        id={d.id}
        role="tooltip"
        aria-live="polite"
        style={{
          position:"fixed",
          left: Math.max(8, Math.min(tip.x - 130, window.innerWidth - 268)),
          top: tip.y - 8,
          transform:"translateY(-100%)",
          width:260,
          padding:"12px 14px",
          background:tipBg,
          color:tipText,
          borderRadius:0,
          fontSize:12,
          lineHeight:1.5,
          fontFamily:"var(--app-font)",
          boxShadow:tipShadow,
          zIndex:50,
          pointerEvents:"none",
          border:`1px solid ${tipBorder}`,
        }}
      >
        {/* ── Headline ── */}
        <div style={{ fontWeight:700, fontSize:14, marginBottom:2 }}>
          {new Date(d.dateKey + "T12:00:00").toLocaleDateString("en-IN", {
            weekday:"short", day:"numeric", month:"short", year:"2-digit",
          })}
        </div>
        <div style={{ color:tipMuted, fontSize:11, marginBottom:10 }}>
          {selectedRoute} · {TOD_LABELS[tod]}
        </div>

        {/* ── Verdict chip ── */}
        <div style={{ display:"inline-block", padding:"3px 8px", marginBottom:10,
          background:v.color + "22", border:`1px solid ${v.color}44`, borderRadius:0,
          fontSize:11, fontWeight:700, color:v.color }}>
          {d.band >= 0 ? `${v.text} · ${d.band + 1}/${DECILES}` : v.text}
        </div>

        {/* ── Key number ── */}
        <div style={{ fontSize:24, fontWeight:800, lineHeight:1.1, marginBottom:2 }}>
          {Math.round(d.avgSpeed)} <span style={{ fontSize:12, fontWeight:600, color:tipMuted }}>km/h</span>
        </div>
        <div style={{ color:tipMuted, fontSize:11, marginBottom:10 }}>
          avg speed this day
        </div>

        {/* ── Decile strip ── */}
        {d.band >= 0 && (
          <div style={{ display:"flex", gap:1, marginBottom:10 }}>
            {pal.map((c, i) => (
              <div key={i} style={{
                flex:1, height:8, background:c,
                outline: i === d.band ? `2px solid ${isGray ? "#111" : "#fff"}` : "none",
                outlineOffset: -1,
              }} />
            ))}
          </div>
        )}

        {/* ── Baseline comparison ── */}
        {d.lookbackCount > 0 && (
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
            padding:"6px 0", borderTop:`1px solid ${tipDivider}` }}>
            <div>
              <div style={{ fontSize:10, color:tipMuted, textTransform:"uppercase", letterSpacing:"0.05em" }}>
                vs baseline ({Math.round(d.lookbackAvg)} km/h)
              </div>
              <div style={{ fontWeight:700, fontSize:14, color:v.color, marginTop:1 }}>
                {diffSign}{Math.round(d.diff)} km/h
              </div>
            </div>
            <div style={{ fontSize:10, color:tipMuted }}>
              {d.lookbackCount} samples
            </div>
          </div>
        )}

        {/* Tail */}
        <div style={{
          position:"absolute", bottom:-6, left:"50%", transform:"translateX(-50%)",
          width:0, height:0,
          borderLeft:"6px solid transparent", borderRight:"6px solid transparent",
          borderTop:`6px solid ${tipBg}`,
        }} />
      </div>
    );
  };

  /* ── Render ─────────────────────────────────────────────────── */
  return (
    <div style={{ position:"relative" }}>

      {/* Day-of-week headers */}
      <div role="row" style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", marginBottom:2 }}>
        {DAY_HDR.map(d => (
          <div key={d} role="columnheader"
            style={{ textAlign:"center", fontSize:10, fontWeight:700,
              textTransform:"uppercase", letterSpacing:"0.06em",
              color: thm.textMuted, padding:"4px 0" }}>
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div key={fadeKey} role="grid" aria-label="Traffic calendar"
        style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)",
          animation:"cal-fade-in 0.2s ease" }}>
        {cells}
      </div>

      {/* Legend: 10 decile blocks */}
      <div role="img" aria-label={legendAria}
        style={{ display:"flex", alignItems:"flex-start", gap:0, marginTop:12,
          justifyContent:"flex-end", flexWrap:"wrap" }}>
        {pal.map((c, i) => (
          <div key={i} style={{ display:"flex", flexDirection:"column", alignItems:"center" }}>
            <div style={{ width:14, height:14, background:c, marginLeft: i > 0 ? 2 : 0 }} />
            <span style={{ fontSize:8, color:thm.textMuted, marginTop:2,
              whiteSpace:"nowrap", marginLeft: i > 0 ? 2 : 0 }}>
              p{i * 10}
            </span>
          </div>
        ))}
      </div>

      {/* Tooltip — portalled to body to escape card overflow:hidden */}
      {tip && createPortal(renderTooltip(), document.body)}
    </div>
  );
}
