import { useState, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "@/lib/ThemeContext";
import type { DayStats, TrafficRow, TimeOfDay } from "@/lib/useTrafficData";
import { matchesToD } from "@/lib/useTrafficData";

const CIRCLE_D = 46;
const DAY_HDR  = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const DECILES = 10;

/* ── Ratio → decile mapping (fixed, absolute thresholds) ─────── */
const RATIO_THRESHOLDS: [number, number][] = [
  [0.15, 0], [0.25, 1], [0.35, 2], [0.45, 3], [0.55, 4],
  [0.65, 5], [0.75, 6], [0.85, 7], [0.95, 8],
];

function ratioToDecile(ratio: number): number {
  for (const [threshold, band] of RATIO_THRESHOLDS) {
    if (ratio < threshold) return band;
  }
  return 9;
}

/* ── Centralised decile palettes ───────────────────────────────── */
/*   band 0 = red/slowest  →  band 9 = green/fastest              */
const PALETTES: Record<string, string[]> = {
  colour: ["#E8354A","#F0673A","#F5973A","#F7C244","#EDD97A","#C8DC6A","#96CC54","#5DB96A","#2EA878","#0D8C52"],
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

/* ── Benchmark-relative verdict labels ─────────────────────────── */
const VERDICT_TEXT = [
  "One of the worst roads in the city today",   // band 0
  "One of the worst roads in the city today",   // band 1
  "Slower than it should be",                   // band 2
  "Slower than it should be",                   // band 3
  "Typical city traffic",                       // band 4
  "Typical city traffic",                       // band 5
  "Reasonably good for Bangalore",              // band 6
  "Reasonably good for Bangalore",              // band 7
  "Among the best in the city today",           // band 8
  "Among the best in the city today",           // band 9
];

function verdict(band: number, themeKey: string): { text: string; color: string } {
  if (band < 0) return { text:"No benchmark data", color:"#94A3B8" };
  return { text: VERDICT_TEXT[band], color: decileColor(themeKey, band) };
}

/* ── Tooltip data carried per cell ─────────────────────────────── */
interface CellTip {
  id: string;
  dateKey: string;
  avgSpeed: number;
  benchmarkSpeed: number;
  ratio: number;
  band: number;
}

export function CalendarWidget({
  dailyStats, allRows, selectedRoute, tod,
  benchmarkDailyStats, benchmarkRouteLabel,
  widgetCalYear, widgetCalMonth, onDateClick, cutoffDate,
}: {
  dailyStats: Map<string, DayStats>;
  allRows: TrafficRow[];
  selectedRoute: string;
  tod: TimeOfDay;
  benchmarkDailyStats: Map<string, DayStats>;
  benchmarkRouteLabel: string;
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

  /* ── Band + tooltip metadata for every date in dailyStats ───── */
  const dayBands = useMemo(() => {
    const result = new Map<string, { band: number; tip: CellTip }>();
    for (const [dateKey, s] of dailyStats.entries()) {
      if (s.avgSpeed <= 0) continue;

      const bm = benchmarkDailyStats.get(dateKey);
      const bmOk = bm && bm.avgSpeed > 0;
      const bmSpeed = bmOk ? bm!.avgSpeed : 0;
      const ratio = bmOk ? s.avgSpeed / bm!.avgSpeed : 0;
      const band = bmOk ? ratioToDecile(ratio) : -1;

      result.set(dateKey, {
        band,
        tip: {
          id: `tip-${dateKey}`,
          dateKey,
          avgSpeed: s.avgSpeed,
          benchmarkSpeed: bmSpeed,
          ratio,
          band,
        },
      });
    }
    return result;
  }, [dailyStats, benchmarkDailyStats]);

  /* ── Calendar math ──────────────────────────────────────────── */
  const prefixStr  = `${widgetCalYear}-${String(widgetCalMonth + 1).padStart(2, "0")}`;
  const firstDay   = (new Date(widgetCalYear, widgetCalMonth, 1).getDay() + 6) % 7;
  const daysInMo   = new Date(widgetCalYear, widgetCalMonth + 1, 0).getDate();
  const pal        = paletteFor(thm.key);
  const legendAria = `Legend: 10 speed deciles from red (slowest, worst relative to benchmark) to green (fastest, closest to benchmark)`;

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
      const isFuture      = !isBeyondCutoff && isCurrentMo && dateKey > todayStr;
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
          `${Math.round(entry.tip.ratio * 100)}% of benchmark.`
        : isFuture ? `${dayLabel}. Future date.`
        : isBeyondCutoff ? `${dayLabel}. Beyond cutoff.`
        : s ? `${dayLabel}. No benchmark data for this day.`
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
            <span style={{ fontSize:16, fontWeight:800, color:txtClr,
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
    const v = verdict(d.band, thm.key);
    const isGray = thm.key === "gray";

    /* Theme-adaptive tooltip surface */
    const tipBg      = isGray ? "#FAFAFA" : "#0F172A";
    const tipText    = isGray ? "#111"    : "#F0F4F8";
    const tipMuted   = isGray ? "#737373" : "#64748B";
    const tipBorder  = isGray ? "#D4D4D4" : "#334155";
    const tipShadow  = isGray ? "2px 2px 0 #000" : "4px 4px 0 rgba(0,0,0,0.35)";
    const tipDivider = isGray ? "#E5E5E5" : "#1E293B";

    const ratioPct = d.benchmarkSpeed > 0 ? Math.round(d.ratio * 100) : 0;
    const fillPct  = Math.min(100, Math.max(0, ratioPct));

    return (
      <div
        id={d.id}
        role="tooltip"
        aria-live="polite"
        style={{
          position:"fixed",
          left: Math.max(8, Math.min(tip.x - 156, window.innerWidth - 320)),
          top: tip.y - 8,
          transform:"translateY(-100%)",
          width:312,
          padding:"14px 17px",
          background:tipBg,
          color:tipText,
          borderRadius:0,
          fontSize:14,
          lineHeight:1.5,
          fontFamily:"var(--app-font)",
          boxShadow:tipShadow,
          zIndex:50,
          pointerEvents:"none",
          border:`1px solid ${tipBorder}`,
        }}
      >
        {/* ── Date ── */}
        <div style={{ fontWeight:700, fontSize:17, marginBottom:2 }}>
          {new Date(d.dateKey + "T12:00:00").toLocaleDateString("en-IN", {
            weekday:"short", day:"numeric", month:"short", year:"2-digit",
          })}
        </div>

        {/* ── Route · Time slot ── */}
        <div style={{ color:tipMuted, fontSize:13, marginBottom:12 }}>
          {selectedRoute} · {TOD_LABELS[tod]}
        </div>

        <div style={{ height:1, background:tipDivider, marginBottom:12 }} />

        {/* ── Verdict badge ── */}
        <div style={{ display:"inline-block", padding:"4px 10px", marginBottom:12,
          background:v.color + "22", border:`1px solid ${v.color}44`, borderRadius:0,
          fontSize:13, fontWeight:700, color:v.color }}>
          {d.band >= 0 ? `${v.text} · ${d.band + 1}/${DECILES}` : v.text}
        </div>

        <div style={{ height:1, background:tipDivider, marginBottom:12 }} />

        {/* ── Speed comparison ── */}
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
          <div>
            <div style={{ fontSize:29, fontWeight:800, lineHeight:1.1 }}>
              {Math.round(d.avgSpeed)}
              <span style={{ fontSize:14, fontWeight:600, color:tipMuted }}> km/h</span>
            </div>
            <div style={{ color:tipMuted, fontSize:12 }}>this route</div>
          </div>
          {d.benchmarkSpeed > 0 && (
            <div style={{ textAlign:"right" }}>
              <div style={{ fontSize:29, fontWeight:800, lineHeight:1.1 }}>
                {Math.round(d.benchmarkSpeed)}
                <span style={{ fontSize:14, fontWeight:600, color:tipMuted }}> km/h</span>
              </div>
              <div style={{ color:tipMuted, fontSize:12 }}>benchmark</div>
            </div>
          )}
        </div>

        {/* ── Ratio bar ── */}
        {d.benchmarkSpeed > 0 && (
          <>
            <div style={{ margin:"6px 0 4px", height:6, background:tipDivider, borderRadius:3, overflow:"hidden" }}>
              <div style={{ width:`${fillPct}%`, height:"100%", borderRadius:3,
                background:`linear-gradient(90deg, ${pal[0]}, ${pal[4]}, ${pal[9]})` }} />
            </div>
            <div style={{ fontSize:12, color:tipMuted, marginBottom:8, fontWeight:600 }}>
              {ratioPct}% of benchmark
            </div>
          </>
        )}

        {/* ── Band strip ── */}
        {d.band >= 0 && (
          <div style={{ display:"flex", gap:1, marginBottom:8 }}>
            {pal.map((c, i) => (
              <div key={i} style={{
                flex:1, height:10, background:c,
                transform: i === d.band ? "scaleY(1.4)" : "none",
                border: i === d.band ? "2px solid #fff" : "none",
                boxSizing: "border-box",
              }} />
            ))}
          </div>
        )}

        <div style={{ height:1, background:tipDivider, marginBottom:10 }} />

        {/* ── Footnote ── */}
        <div style={{ fontSize:12, color:tipMuted }}>
          Compared to {benchmarkRouteLabel} · same conditions
        </div>

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

      {/* ⚠ DEBUG PANEL — remove before release */}
      {(() => {
        const mono = "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace";
        const bmRoute = benchmarkRouteLabel;
        const bmTotalDist = allRows.filter(r => r.label_short === bmRoute).reduce((s, r) => s + r.distance_km, 0);
        const bmTotalRows = allRows.filter(r => r.label_short === bmRoute).length;

        const rows: {
          dateKey: string; subjectSpeed: number; bmSpeed: number;
          ratio: number; band: number; color: string;
        }[] = [];
        let missingBm = 0;
        const subjDateKeys: string[] = [];
        const bmDateKeys: string[] = [];

        for (const [dateKey, s] of dailyStats.entries()) {
          if (s.avgSpeed <= 0) continue;
          if (!dateKey.startsWith(prefixStr)) continue;
          subjDateKeys.push(dateKey);
          const bm = benchmarkDailyStats.get(dateKey);
          const bmOk = bm && bm.avgSpeed > 0;
          if (bmOk) bmDateKeys.push(dateKey);
          if (!bmOk) { missingBm++; continue; }
          const ratio = s.avgSpeed / bm!.avgSpeed;
          const band = ratioToDecile(ratio);
          rows.push({ dateKey, subjectSpeed: s.avgSpeed, bmSpeed: bm!.avgSpeed, ratio, band, color: decileColor(thm.key, band) });
        }

        const dateFmt = (dk: string) => new Date(dk + "T12:00:00").toLocaleDateString("en-IN", { weekday:"short", day:"numeric", month:"short" });

        return (
          <div style={{
            border:"2px solid #EF4444", background:"#FEF2F2", padding:12, marginTop:12,
            fontFamily:mono, fontSize:11, lineHeight:1.6, color:"#1F2937", borderRadius:0,
          }}>
            <div style={{ fontWeight:800, fontSize:13, color:"#DC2626", marginBottom:8 }}>
              ⚠ DEBUG — remove before release
            </div>
            <div style={{ marginBottom:10, lineHeight:1.8 }}>
              <div><strong>Benchmark route resolved as:</strong> {bmRoute}</div>
              <div><strong>Benchmark route path length / data points:</strong> {bmTotalDist.toFixed(1)} km total / {bmTotalRows} rows</div>
              <div><strong>Subject route:</strong> {selectedRoute}</div>
              <div><strong>Time slot filter applied to benchmark:</strong> yes — {tod}</div>
              <div><strong>Total dates with subject data:</strong> {subjDateKeys.length}</div>
              <div><strong>Total dates with benchmark data:</strong> {bmDateKeys.length}</div>
              <div><strong>Dates where benchmark data was missing:</strong> {missingBm}</div>
            </div>
            {rows.length > 0 && (
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:10.5 }}>
                <thead>
                  <tr style={{ borderBottom:"2px solid #DC2626", textAlign:"left" }}>
                    <th style={{ padding:"3px 6px" }}>Date</th>
                    <th style={{ padding:"3px 6px" }}>Subject route</th>
                    <th style={{ padding:"3px 6px", textAlign:"right" }}>Subject speed</th>
                    <th style={{ padding:"3px 6px" }}>Benchmark route</th>
                    <th style={{ padding:"3px 6px", textAlign:"right" }}>Benchmark speed</th>
                    <th style={{ padding:"3px 6px", textAlign:"right" }}>Ratio</th>
                    <th style={{ padding:"3px 6px", textAlign:"right" }}>Band</th>
                    <th style={{ padding:"3px 6px" }}>Dot color</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.dateKey} style={{ borderBottom:"1px solid #FECACA", background: i % 2 === 0 ? "transparent" : "#FEF2F280" }}>
                      <td style={{ padding:"2px 6px", whiteSpace:"nowrap" }}>{dateFmt(r.dateKey)}</td>
                      <td style={{ padding:"2px 6px" }}>{selectedRoute}</td>
                      <td style={{ padding:"2px 6px", textAlign:"right" }}>{r.subjectSpeed} km/h</td>
                      <td style={{ padding:"2px 6px" }}>{bmRoute}</td>
                      <td style={{ padding:"2px 6px", textAlign:"right" }}>{r.bmSpeed} km/h</td>
                      <td style={{ padding:"2px 6px", textAlign:"right" }}>{r.ratio.toFixed(3)}</td>
                      <td style={{ padding:"2px 6px", textAlign:"right" }}>{r.band + 1}</td>
                      <td style={{ padding:"2px 6px" }}>
                        <span style={{ display:"inline-block", width:12, height:12, background:r.color, verticalAlign:"middle", marginRight:4 }} />
                        <span>{r.color}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        );
      })()}

      {/* Legend: Slow [10 blocks] Fast */}
      <div role="img" aria-label={legendAria}
        style={{ display:"flex", alignItems:"center", gap:6, marginTop:12,
          justifyContent:"flex-end", fontSize:10, color:thm.textMuted, fontWeight:600 }}>
        <span>Slow</span>
        <div>
          <div style={{ display:"flex", gap:2 }}>
            {pal.map((c, i) => (
              <div key={i} style={{ width:17, height:17, background:c }} />
            ))}
          </div>
          <div style={{ height:2, marginTop:2,
            background:`linear-gradient(to right, ${pal[0]}, ${pal[9]})` }} />
        </div>
        <span>Fast</span>
      </div>

      {/* Tooltip — portalled to body to escape card overflow:hidden */}
      {tip && createPortal(renderTooltip(), document.body)}
    </div>
  );
}
