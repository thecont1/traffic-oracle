import { useState, useRef, useEffect, useId, useCallback, useMemo } from "react";

/* ── Types from the design spec ──────────────────────────────── */
export type ViewingMode = "default" | "grayscale" | "compare" | "compact";

export type IntervalDatum = {
  x: string | number;
  p05: number;
  p15: number;
  p50?: number;
  p85: number;
  p95: number;
  observed?: number;
};

type IntervalSeriesStyle = {
  line: string;
  lineWidth: number;
  lineDash?: string;
  outerFill?: string;
  outerStroke: string;
  innerFill?: string;
  innerStroke: string;
  patternId?: string;
};

/* ── Per-mode style presets ──────────────────────────────────── */
const MODE_STYLES: Record<Exclude<ViewingMode, "compare">, IntervalSeriesStyle> = {
  default: {
    outerFill: "var(--tn-band-outer-fill)",
    outerStroke: "var(--tn-band-outer-stroke)",
    innerFill: "var(--tn-band-inner-fill)",
    innerStroke: "var(--tn-band-inner-stroke)",
    line: "var(--tn-line-main)",
    lineWidth: 3,
  },
  grayscale: {
    outerFill: "url(#tn-hatch-p05-p95)",
    outerStroke: "#666",
    innerFill: "#9a9a9a",
    innerStroke: "#555",
    line: "#111",
    lineWidth: 3,
    patternId: "tn-hatch-p05-p95",
  },
  compact: {
    outerFill: "none",
    outerStroke: "#5f6b6a",
    innerFill: "var(--tn-band-inner-fill)",
    innerStroke: "#2c4e4b",
    line: "#111",
    lineWidth: 2.5,
  },
};

const COMPARE_A: IntervalSeriesStyle = {
  outerFill: "var(--tn-band-outer-fill)",
  outerStroke: "var(--tn-band-outer-stroke)",
  innerFill: "var(--tn-band-inner-fill)",
  innerStroke: "var(--tn-band-inner-stroke)",
  line: "var(--tn-line-main)",
  lineWidth: 3,
};

const COMPARE_B: IntervalSeriesStyle = {
  outerFill: "none",
  outerStroke: "var(--tn-line-compare)",
  innerFill: "none",
  innerStroke: "var(--tn-line-compare)",
  line: "var(--tn-line-compare)",
  lineWidth: 2.5,
  lineDash: "7 4",
};

/* ── Chart geometry helpers ──────────────────────────────────── */
const PAD = { top: 24, right: 16, bottom: 36, left: 44 };

function buildScales(
  data: IntervalDatum[],
  W: number,
  H: number,
): {
  xOf: (i: number) => number;
  yOf: (v: number) => number;
  yMin: number;
  yMax: number;
} {
  const n = data.length;
  const allVals = data.flatMap((d) => [d.p05, d.p95, d.observed ?? d.p50 ?? d.p50 ?? NaN]).filter(isFinite);
  const rawMin = Math.min(...allVals);
  const rawMax = Math.max(...allVals);
  const pad = (rawMax - rawMin) * 0.08 || 2;
  const yMin = rawMin - pad;
  const yMax = rawMax + pad;
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const xOf = (i: number) => PAD.left + (n > 1 ? (i / (n - 1)) * plotW : plotW / 2);
  const yOf = (v: number) => PAD.top + plotH - ((v - yMin) / (yMax - yMin)) * plotH;
  return { xOf, yOf, yMin, yMax };
}

function areaPath(
  data: IntervalDatum[],
  topKey: keyof IntervalDatum,
  botKey: keyof IntervalDatum,
  xOf: (i: number) => number,
  yOf: (v: number) => number,
): string {
  if (data.length === 0) return "";
  const top = data.map((d, i) => `${i === 0 ? "M" : "L"}${xOf(i).toFixed(2)},${yOf(d[topKey] as number).toFixed(2)}`);
  const bot = [...data].reverse().map((d, i) => {
    const origI = data.length - 1 - i;
    return `L${xOf(origI).toFixed(2)},${yOf(d[botKey] as number).toFixed(2)}`;
  });
  return [...top, ...bot, "Z"].join(" ");
}

function linePath(
  data: IntervalDatum[],
  key: keyof IntervalDatum,
  xOf: (i: number) => number,
  yOf: (v: number) => number,
): string {
  return data
    .map((d, i) => {
      const v = d[key];
      if (v === undefined || v === null) return null;
      return `${i === 0 ? "M" : "L"}${xOf(i).toFixed(2)},${yOf(v as number).toFixed(2)}`;
    })
    .filter(Boolean)
    .join(" ");
}

function railPath(
  data: IntervalDatum[],
  key: keyof IntervalDatum,
  xOf: (i: number) => number,
  yOf: (v: number) => number,
): string {
  return data
    .map((d, i) => {
      const v = d[key] as number | undefined;
      if (v == null) return null;
      return `${i === 0 ? "M" : "L"}${xOf(i).toFixed(2)},${yOf(v).toFixed(2)}`;
    })
    .filter(Boolean)
    .join(" ");
}

/* ── Tooltip state ───────────────────────────────────────────── */
interface TooltipState {
  x: number;
  y: number;
  datum: IntervalDatum;
  compareB?: IntervalDatum;
}

/* ── Gridlines ───────────────────────────────────────────────── */
function Gridlines({
  W,
  H,
  yMin,
  yMax,
  yOf,
  gridColor,
}: {
  W: number;
  H: number;
  yMin: number;
  yMax: number;
  yOf: (v: number) => number;
  gridColor: string;
}) {
  const range = yMax - yMin;
  const step = range <= 10 ? 2 : range <= 30 ? 5 : range <= 60 ? 10 : 20;
  const firstTick = Math.ceil(yMin / step) * step;
  const ticks: number[] = [];
  for (let t = firstTick; t <= yMax; t += step) ticks.push(t);

  return (
    <g aria-hidden="true">
      {ticks.map((t) => {
        const cy = yOf(t);
        if (cy < PAD.top - 2 || cy > H - PAD.bottom + 2) return null;
        return (
          <g key={t}>
            <line
              x1={PAD.left} x2={W - PAD.right}
              y1={cy} y2={cy}
              stroke={gridColor} strokeWidth={1} strokeDasharray="3 3"
            />
            <text
              x={PAD.left - 6} y={cy}
              textAnchor="end" dominantBaseline="middle"
              fontSize={10} fill={gridColor}
              fontFamily="var(--app-font, system-ui)"
            >
              {t}
            </text>
          </g>
        );
      })}
    </g>
  );
}

/* ── X-axis labels ───────────────────────────────────────────── */
function XAxisLabels({
  data,
  xOf,
  H,
  gridColor,
  maxLabels,
}: {
  data: IntervalDatum[];
  xOf: (i: number) => number;
  H: number;
  gridColor: string;
  maxLabels: number;
}) {
  const n = data.length;
  const step = Math.max(1, Math.floor(n / maxLabels));
  const labelY = H - PAD.bottom + 14;
  return (
    <g aria-hidden="true">
      {data.map((d, i) => {
        if (i % step !== 0 && i !== n - 1) return null;
        const label = typeof d.x === "string"
          ? (() => {
              try {
                return new Date(d.x).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
              } catch {
                return String(d.x);
              }
            })()
          : String(d.x);
        return (
          <text
            key={i}
            x={xOf(i)} y={labelY}
            textAnchor="middle" fontSize={9}
            fill={gridColor} fontFamily="var(--app-font, system-ui)"
          >
            {label}
          </text>
        );
      })}
    </g>
  );
}

/* ── Grayscale diagonal-hatch pattern def ────────────────────── */
function HatchPatternDef({ id }: { id: string }) {
  return (
    <defs>
      <pattern id={id} patternUnits="userSpaceOnUse" width={8} height={8} patternTransform="rotate(45)">
        <line x1={0} y1={0} x2={0} y2={8} stroke="#aaa" strokeWidth={1.5} />
      </pattern>
    </defs>
  );
}

/* ── Focus marker ────────────────────────────────────────────── */
function FocusMarker({
  cx, cy, color,
}: { cx: number; cy: number; color: string }) {
  return (
    <circle
      cx={cx} cy={cy} r={5}
      fill={color} stroke="white" strokeWidth={2}
      pointerEvents="none"
    />
  );
}

/* ── Tooltip callout ─────────────────────────────────────────── */
function TooltipCallout({
  tip,
  W,
  mode,
  compareLabel,
}: {
  tip: TooltipState;
  W: number;
  mode: ViewingMode;
  compareLabel?: string;
}) {
  const BOX_W = 200;
  const rawX = tip.x - BOX_W / 2;
  const clampedX = Math.max(PAD.left, Math.min(W - PAD.right - BOX_W, rawX));
  const below = tip.y < PAD.top + 60;
  const boxY = below ? tip.y + 14 : tip.y - 130;

  const { datum: d, compareB } = tip;

  const xLabel = typeof d.x === "string"
    ? (() => {
        try {
          return new Date(d.x).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
        } catch { return String(d.x); }
      })()
    : String(d.x);

  return (
    <g role="tooltip" aria-live="polite" style={{ animation: "callout-in 0.12s ease" }}>
      {/* stem */}
      <line
        x1={tip.x} y1={tip.y}
        x2={tip.x} y2={below ? boxY : boxY + 116}
        stroke="rgba(20,26,36,0.5)" strokeWidth={1}
      />
      <foreignObject x={clampedX} y={boxY} width={BOX_W} height={130}>
        <div
          style={{
            background: "rgba(20,26,36,0.94)",
            borderRadius: 10, padding: "9px 12px",
            boxShadow: "0 6px 24px rgba(0,0,0,0.45)",
            fontSize: 11, lineHeight: 1.55,
            color: "#94A3B8",
            fontFamily: "var(--app-font, system-ui)",
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 12, color: "#F0F4F8", marginBottom: 4 }}>{xLabel}</div>
          {(d.observed != null || d.p50 != null) && (
            <div>
              <span style={{ color: "#F0F4F8", fontWeight: 600 }}>
                {d.observed != null ? "Observed" : "Median expected"}: {(d.observed ?? d.p50)!.toFixed(1)} km/h
              </span>
            </div>
          )}
          <div>Core range (15th–85th): {d.p15.toFixed(1)}–{d.p85.toFixed(1)} km/h</div>
          <div>Wide range (5th–95th): {d.p05.toFixed(1)}–{d.p95.toFixed(1)} km/h</div>
          {mode === "compare" && compareB && (
            <>
              <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)", margin: "5px 0 4px" }} />
              <div style={{ color: "var(--tn-line-compare, #f59e0b)", fontWeight: 600 }}>
                {compareLabel ?? "Compare"}
              </div>
              <div>Core range: {compareB.p15.toFixed(1)}–{compareB.p85.toFixed(1)} km/h</div>
              <div>Wide range: {compareB.p05.toFixed(1)}–{compareB.p95.toFixed(1)} km/h</div>
            </>
          )}
        </div>
      </foreignObject>
    </g>
  );
}

/* ── Legend ──────────────────────────────────────────────────── */
function ChartLegend({
  mode,
  gridColor,
  seriesLabel,
  compareLabel,
}: {
  mode: ViewingMode;
  gridColor: string;
  seriesLabel: string;
  compareLabel?: string;
}) {
  const items: { color: string; label: string; dash?: string; fill?: string }[] = [
    { color: mode === "grayscale" ? "#111" : "var(--tn-line-main)", label: seriesLabel },
    { color: "transparent", label: "Core range: 15th–85th percentile", fill: mode === "grayscale" ? "#9a9a9a" : "var(--tn-band-inner-fill)" },
    { color: "transparent", label: "Wide range: 5th–95th percentile", fill: mode === "grayscale" ? "url(#tn-hatch-p05-p95)" : "var(--tn-band-outer-fill)", dash: mode !== "grayscale" ? "4 3" : undefined },
  ];
  if (mode === "compare" && compareLabel) {
    items.splice(1, 0, { color: "var(--tn-line-compare)", label: compareLabel, dash: "7 4" });
  }

  return (
    <div style={{
      display: "flex", flexWrap: "wrap", gap: "6px 14px",
      marginTop: 8, fontSize: 10,
      color: gridColor, fontFamily: "var(--app-font, system-ui)",
    }}>
      {items.map((it, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 5 }}>
          {it.fill ? (
            <svg width={12} height={12} aria-hidden="true">
              <rect x={0} y={0} width={12} height={12} fill={it.fill} rx={2}
                stroke={mode === "grayscale" ? "#666" : "var(--tn-band-outer-stroke)"}
                strokeWidth={1} strokeDasharray={it.dash} />
            </svg>
          ) : (
            <svg width={18} height={4} aria-hidden="true">
              <line x1={0} y1={2} x2={18} y2={2}
                stroke={it.color} strokeWidth={3}
                strokeDasharray={it.dash} />
            </svg>
          )}
          <span>{it.label}</span>
        </div>
      ))}
    </div>
  );
}

/* ── Band renderer ───────────────────────────────────────────── */
function BandSeries({
  data,
  xOf,
  yOf,
  style,
  mode,
  isCompact,
  focusIdx,
}: {
  data: IntervalDatum[];
  xOf: (i: number) => number;
  yOf: (v: number) => number;
  style: IntervalSeriesStyle;
  mode: ViewingMode;
  isCompact: boolean;
  focusIdx: number | null;
}) {
  const outerTop = railPath(data, "p95", xOf, yOf);
  const outerBot = railPath(data, "p05", xOf, yOf);
  const outerArea = areaPath(data, "p95", "p05", xOf, yOf);
  const innerArea = areaPath(data, "p85", "p15", xOf, yOf);
  const mainLine = linePath(data, data.some(d => d.observed != null) ? "observed" : "p50", xOf, yOf);

  const focusDatum = focusIdx != null ? data[focusIdx] : null;
  const focusCX = focusIdx != null ? xOf(focusIdx) : 0;
  const focusCY = focusDatum
    ? yOf(focusDatum.observed ?? focusDatum.p50 ?? focusDatum.p50!)
    : 0;

  return (
    <g>
      {/* 1. p05–p95 outer band or rails */}
      {isCompact ? (
        <>
          <path d={outerTop} fill="none" stroke={style.outerStroke} strokeWidth={1.5} strokeDasharray="4 3" />
          <path d={outerBot} fill="none" stroke={style.outerStroke} strokeWidth={1.5} strokeDasharray="4 3" />
        </>
      ) : style.outerFill && style.outerFill !== "none" ? (
        <>
          <path d={outerArea} fill={style.outerFill} stroke={style.outerStroke} strokeWidth={1.5} />
        </>
      ) : (
        <>
          <path d={outerTop} fill="none" stroke={style.outerStroke} strokeWidth={1.5} strokeDasharray="4 3" />
          <path d={outerBot} fill="none" stroke={style.outerStroke} strokeWidth={1.5} strokeDasharray="4 3" />
        </>
      )}

      {/* 2. p15–p85 inner band (always filled) */}
      {style.innerFill && style.innerFill !== "none" && (
        <path d={innerArea} fill={style.innerFill} stroke={style.innerStroke} strokeWidth={1.5} />
      )}

      {/* 3. Median / observed line */}
      {mainLine && (
        <path
          d={mainLine}
          fill="none"
          stroke={style.line}
          strokeWidth={focusIdx != null ? style.lineWidth + 0.75 : style.lineWidth}
          strokeLinejoin="round"
          strokeLinecap="round"
          strokeDasharray={style.lineDash}
        />
      )}

      {/* 4. Focus marker */}
      {focusDatum && <FocusMarker cx={focusCX} cy={focusCY} color={style.line} />}
    </g>
  );
}

/* ── Main component ──────────────────────────────────────────── */
export interface UncertaintyBandChartProps {
  /** Primary time-series data */
  data: IntervalDatum[];
  /** For compare mode: secondary series */
  compareData?: IntervalDatum[];
  /** Rendering mode — controls geometry + palette */
  mode?: ViewingMode;
  /** Accessible title (shown in <title> tag) */
  title?: string;
  /** Route name for description copy */
  routeName?: string;
  /** Label for primary series */
  seriesLabel?: string;
  /** Label for compare series (compare mode only) */
  compareLabel?: string;
  /** SVG viewBox height */
  height?: number;
  /** Theme key to adapt non-token colors */
  themeKey?: "colour" | "gray" | "pastel";
  /** Called when user selects a data point */
  onFocus?: (datum: IntervalDatum, index: number) => void;
}

export default function UncertaintyBandChart({
  data,
  compareData,
  mode = "default",
  title,
  routeName = "selected route",
  seriesLabel = "Median expected traffic",
  compareLabel = "Comparison period",
  height = 320,
  themeKey = "colour",
  onFocus,
}: UncertaintyBandChartProps) {
  const uid = useId().replace(/:/g, "");
  const titleId = `tn-title-${uid}`;
  const descId = `tn-desc-${uid}`;
  const svgRef = useRef<SVGSVGElement>(null);
  const [W, setW] = useState(800);
  const [focusIdx, setFocusIdx] = useState<number | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  /* Responsive width */
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setW(Math.round(w));
    });
    obs.observe(el);
    const init = el.getBoundingClientRect().width;
    if (init > 0) setW(Math.round(init));
    return () => obs.disconnect();
  }, []);

  const { xOf, yOf, yMin, yMax } = useMemo(
    () => buildScales(data, W, height),
    [data, W, height],
  );

  /* Resolve effective mode — compact if too short */
  const minBandPx = (height - PAD.top - PAD.bottom) *
    (data.length > 0
      ? Math.min(...data.map(d => (d.p85 - d.p15) / ((d.p95 - d.p05) || 1)))
      : 0.5);
  const effectiveMode: ViewingMode = minBandPx < 6 && mode !== "compare" ? "compact" : mode;

  /* Styles */
  const seriesStyle: IntervalSeriesStyle =
    effectiveMode === "compare" ? COMPARE_A
    : effectiveMode === "grayscale" ? MODE_STYLES.grayscale
    : effectiveMode === "compact" ? MODE_STYLES.compact
    : MODE_STYLES.default;

  const gridColor = themeKey === "gray"
    ? "#767676"
    : themeKey === "pastel"
    ? "#6E675B"
    : "var(--tn-grid, #c7c7c2)";

  /* Interaction: nearest index from pointer x */
  const hitIndex = useCallback(
    (clientX: number): number | null => {
      const el = svgRef.current;
      if (!el || data.length === 0) return null;
      const rect = el.getBoundingClientRect();
      const svgX = (clientX - rect.left) * (W / rect.width);
      const plotW = W - PAD.left - PAD.right;
      const n = data.length;
      if (n === 1) return 0;
      const idx = Math.round(((svgX - PAD.left) / plotW) * (n - 1));
      return Math.max(0, Math.min(n - 1, idx));
    },
    [data.length, W],
  );

  const showTip = useCallback(
    (idx: number) => {
      const d = data[idx];
      if (!d) return;
      const cx = xOf(idx);
      const cy = yOf(d.observed ?? d.p50 ?? d.p15);
      const compareB = compareData?.[idx];
      setTooltip({ x: cx, y: cy, datum: d, compareB });
      setFocusIdx(idx);
      onFocus?.(d, idx);
    },
    [data, compareData, xOf, yOf, onFocus],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const idx = hitIndex(e.clientX);
      if (idx !== null) showTip(idx);
    },
    [hitIndex, showTip],
  );

  const handlePointerLeave = useCallback(() => {
    setTooltip(null);
    setFocusIdx(null);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<SVGSVGElement>) => {
      const n = data.length;
      if (n === 0) return;
      if (e.key === "ArrowRight") {
        setFocusIdx(i => {
          const next = Math.min((i ?? -1) + 1, n - 1);
          showTip(next);
          return next;
        });
        e.preventDefault();
      } else if (e.key === "ArrowLeft") {
        setFocusIdx(i => {
          const prev = Math.max((i ?? n) - 1, 0);
          showTip(prev);
          return prev;
        });
        e.preventDefault();
      } else if (e.key === "Escape") {
        setTooltip(null);
        setFocusIdx(null);
      }
    },
    [data.length, showTip],
  );

  /* Invisible keyboard-focusable hit targets for each data point */
  const hitTargets = useMemo(() => {
    const n = data.length;
    if (n === 0) return null;
    const slotW = n > 1 ? (W - PAD.left - PAD.right) / (n - 1) : W - PAD.left - PAD.right;
    return data.map((d, i) => {
      const cx = xOf(i);
      const label = `${typeof d.x === "string"
        ? (() => { try { return new Date(d.x).toLocaleDateString("en-IN", { day: "numeric", month: "short" }); } catch { return d.x; } })()
        : d.x}: ${d.observed != null ? `Observed ${d.observed.toFixed(1)}` : d.p50 != null ? `Median ${d.p50.toFixed(1)}` : ""} km/h. Core range ${d.p15.toFixed(1)}–${d.p85.toFixed(1)}, wide range ${d.p05.toFixed(1)}–${d.p95.toFixed(1)}.`;
      return (
        <rect
          key={i}
          x={cx - slotW / 2} y={PAD.top}
          width={slotW} height={height - PAD.top - PAD.bottom}
          fill="transparent"
          tabIndex={0}
          role="button"
          aria-label={label}
          onFocus={() => showTip(i)}
          onBlur={() => { setTooltip(null); setFocusIdx(null); }}
          style={{ cursor: "crosshair", outline: "none" }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") { showTip(i); e.preventDefault(); }
          }}
        />
      );
    });
  }, [data, W, height, xOf, showTip]);

  if (data.length === 0) {
    return (
      <div style={{
        height, display: "flex", alignItems: "center", justifyContent: "center",
        color: gridColor, fontSize: 13, fontFamily: "var(--app-font, system-ui)",
      }}>
        No forecast data available.
      </div>
    );
  }

  const isCompact = effectiveMode === "compact";
  const chartTitle = title ?? `TrafficNOW! forecast bands for ${routeName}`;
  const chartDesc =
    `The chart shows a wide uncertainty interval from the 5th to 95th percentile, ` +
    `a core interval from the 15th to 85th percentile, ` +
    (data.some(d => d.observed != null)
      ? "and the observed traffic line."
      : "and the median expected traffic line.");

  return (
    <div style={{ width: "100%", position: "relative" }}>
      <svg
        ref={svgRef}
        role="img"
        aria-labelledby={`${titleId} ${descId}`}
        viewBox={`0 0 ${W} ${height}`}
        style={{ width: "100%", height, display: "block", overflow: "visible" }}
        preserveAspectRatio="xMidYMid meet"
        tabIndex={0}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        onKeyDown={handleKeyDown}
      >
        <title id={titleId}>{chartTitle}</title>
        <desc id={descId}>{chartDesc}</desc>

        {/* Grayscale hatch pattern */}
        {(effectiveMode === "grayscale" || (effectiveMode === "compare" && themeKey === "gray")) && (
          <HatchPatternDef id={`tn-hatch-p05-p95`} />
        )}

        {/* 1. Gridlines */}
        <Gridlines W={W} H={height} yMin={yMin} yMax={yMax} yOf={yOf} gridColor={gridColor} />

        {/* X-axis labels */}
        <XAxisLabels data={data} xOf={xOf} H={height} gridColor={gridColor} maxLabels={8} />

        {/* Y-axis label */}
        <text
          x={PAD.left - 36} y={PAD.top + (height - PAD.top - PAD.bottom) / 2}
          textAnchor="middle"
          transform={`rotate(-90, ${PAD.left - 36}, ${PAD.top + (height - PAD.top - PAD.bottom) / 2})`}
          fontSize={9} fill={gridColor}
          fontFamily="var(--app-font, system-ui)"
          aria-hidden="true"
        >
          km/h
        </text>

        {/* 2. Compare series B (rails + dashed line — rendered first so A is on top) */}
        {effectiveMode === "compare" && compareData && compareData.length > 0 && (
          <BandSeries
            data={compareData}
            xOf={xOf}
            yOf={yOf}
            style={COMPARE_B}
            mode={effectiveMode}
            isCompact={false}
            focusIdx={focusIdx}
          />
        )}

        {/* 3. Primary series A (filled bands + main line) */}
        <BandSeries
          data={data}
          xOf={xOf}
          yOf={yOf}
          style={seriesStyle}
          mode={effectiveMode}
          isCompact={isCompact}
          focusIdx={focusIdx}
        />

        {/* 4. Focus ring on SVG when keyboard-focused */}
        <rect
          x={PAD.left} y={PAD.top}
          width={W - PAD.left - PAD.right} height={height - PAD.top - PAD.bottom}
          fill="none" stroke="var(--tn-focus, #005fcc)" strokeWidth={2}
          rx={4} pointerEvents="none"
          opacity={0}
          style={{ transition: "opacity 0.1s" }}
        />

        {/* 5. Keyboard-focusable invisible hit targets */}
        <g role="group" aria-label="Data points — use arrow keys to navigate">
          {hitTargets}
        </g>

        {/* 6. Tooltip anchor marker + callout */}
        {tooltip && (
          <TooltipCallout tip={tooltip} W={W} mode={effectiveMode} compareLabel={compareLabel} />
        )}
      </svg>

      {/* Legend */}
      <ChartLegend
        mode={effectiveMode}
        gridColor={gridColor}
        seriesLabel={seriesLabel}
        compareLabel={compareLabel}
      />
    </div>
  );
}
