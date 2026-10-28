import { useState, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "@/lib/ThemeContext";
import type { TimeOfDay } from "@/lib/useTrafficData";
import type { AnomalyCategory, AnomalyFeedState, CalendarAnomaly } from "@/lib/calendarAnomalies";
import {
  CATEGORY_LABELS,
  MIN_COMPARABLE_DAYS,
  STATUS_LABELS,
  categoryText,
  cityTodayKey,
  civilWeekdayName,
  describeDelta,
  describeRank,
  describeSample,
  describeSlots,
  formatCivilDate,
  formatMinutes,
  formatPercent,
  formatSignedMinutes,
  instantToCivilKey,
  isBeforePublishedWindow,
  isDateExcludedByTod,
  isScorable,
  parseCivilDate,
} from "@/lib/calendarAnomalies";

const CIRCLE_D = 46;

/** Visually hidden, still announced: carries each cell's detailed comparison. */
const SR_ONLY = {
  position: "absolute" as const,
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap" as const,
  border: 0,
};

const DAY_HDR = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/* ── Category palette ────────────────────────────────────────────────
 * Five categories, ordered much_worse → much_better, plus an unfilled
 * dashed treatment for missing/provisional-unavailable evidence.
 * Colour is always paired with category text in the aria label and tooltip;
 * the grey theme uses a luminance ramp and still distinguishes a filled
 * "usual" day from an outlined day with no usable evidence.            */
export const CATEGORY_COLOURS: Record<string, Record<AnomalyCategory, string>> = {
  colour: {
    much_worse: "#E8354A",
    worse: "#E08A3C",
    usual: "#3A4A5C",
    // "Better" is a lighter, low-emphasis green and "much better" the deep
    // saturated one, so adjacent categories stay separable by luminance as
    // well as hue (red/orange keep the same luminance hierarchy).
    better: "#62BE89",
    much_better: "#0D8C52",
  },
  // A single monotonic luminance ramp — darker means worse — so the five
  // categories stay ordered without hue. "Usual" is the mid step: a filled
  // circle, deliberately distinct from the dashed no-result treatment.
  gray: {
    much_worse: "#111111",
    worse: "#4F4F4F",
    usual: "#8C8C8C",
    better: "#B8B8B8",
    much_better: "#E2E2E2",
  },
  pastel: {
    much_worse: "#FCA5A5",
    worse: "#FDBA74",
    usual: "#EDE5D6",
    better: "#BEF2CE",
    much_better: "#86EFAC",
  },
};

/** Legend order: worst first, matching the old Slow → Fast reading order. */
export const CATEGORY_LEGEND_ORDER: AnomalyCategory[] = [
  "much_worse",
  "worse",
  "usual",
  "better",
  "much_better",
];

export function categoryColor(themeKey: string, category: AnomalyCategory): string {
  const palette = CATEGORY_COLOURS[themeKey] ?? CATEGORY_COLOURS.colour;
  return palette[category];
}

/** WCAG relative luminance → pick black or white text for contrast. */
function textOn(hex: string): "#111" | "#fff" {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const toLinear = (channel: number) =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  const L = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  return L > 0.4 ? "#111" : "#fff";
}

/* ── Human-readable ToD label ──────────────────────────────────────── */
export const TOD_LABELS: Record<TimeOfDay, string> = {
  weekday_morning: "Weekday Mornings",
  weekday_afternoon: "Weekday Afternoons",
  weekday_evening: "Weekday Evenings",
  weekends: "Weekends",
  late_hours: "Late Hours",
  all: "All Times",
};

const TOD_NOUNS: Record<TimeOfDay, string> = {
  weekday_morning: "morning",
  weekday_afternoon: "afternoon",
  weekday_evening: "evening",
  weekends: "day",
  late_hours: "late hours",
  all: "day",
};

const FEED_MESSAGES: Record<Exclude<AnomalyFeedState, "ready" | "loading">, string> = {
  unavailable: "Comparison data unavailable",
  unsupported: "Comparison method not supported",
};

interface FeedMeta {
  methodVersion: string | null;
  generatedAt: string | null;
  error: string | null;
}

export function CalendarWidget({
  anomalies,
  feedState,
  feedMeta,
  publishedFrom,
  selectedRoute,
  tod,
  widgetCalYear,
  widgetCalMonth,
  onDateClick,
  cutoffDate,
  debug = false,
}: {
  /** Records for the selected route + time filter, keyed by civil date. */
  anomalies: Map<string, CalendarAnomaly>;
  feedState: AnomalyFeedState;
  feedMeta?: FeedMeta;
  /** First date the export publishes (rolling 90-day window). */
  publishedFrom?: string | null;
  selectedRoute: string;
  tod: TimeOfDay;
  widgetCalYear: number;
  widgetCalMonth: number;
  onDateClick?: (dateKey: string) => void;
  cutoffDate?: Date | null;
  debug?: boolean;
}) {
  const { theme: thm } = useTheme();

  const [fadeKey, setFadeKey] = useState(0);
  useEffect(() => { setFadeKey(k => k + 1); }, [widgetCalYear, widgetCalMonth]);

  /* ── Tooltip state ───────────────────────────────────────────── */
  const [tip, setTip] = useState<{ record: CalendarAnomaly; x: number; y: number } | null>(null);

  const showTip = useCallback((record: CalendarAnomaly, el: HTMLElement) => {
    const er = el.getBoundingClientRect();
    setTip({ record, x: er.left + er.width / 2, y: er.top });
  }, []);

  const hideTip = useCallback(() => setTip(null), []);

  useEffect(() => {
    if (!tip) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") hideTip(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tip, hideTip]);

  /* ── Calendar math — civil dates only, never viewer-local ────── */
  const prefixStr = `${widgetCalYear}-${String(widgetCalMonth + 1).padStart(2, "0")}`;
  // Weekday of the 1st, computed from the civil date (0=Sun → 0=Mon layout).
  const firstDay = (() => {
    const civil = parseCivilDate(`${prefixStr}-01`);
    return civil ? (civil.weekday + 6) % 7 : 0;
  })();
  const daysInMo = new Date(Date.UTC(widgetCalYear, widgetCalMonth + 1, 0)).getUTCDate();

  // Recomputed on every render: a calendar mounted before midnight must not
  // keep calling yesterday "today" (the cells memo depends on this value, so
  // it re-renders once the date actually changes).
  const todayKey = cityTodayKey();
  const cutoffKey = useMemo(
    () => (cutoffDate ? instantToCivilKey(cutoffDate) : null),
    [cutoffDate],
  );
  const feedReady = feedState === "ready";

  /* ── Memoised cells ─────────────────────────────────────────── */
  const cells = useMemo(() => {
    return Array.from({ length: 42 }, (_, i) => {
      const dayNum = i - firstDay + 1;

      if (dayNum < 1 || dayNum > daysInMo) {
        return (
          <div key={`e${i}`} role="gridcell" aria-hidden="true"
            style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "5px 0" }}>
            <div style={{ width: CIRCLE_D, height: CIRCLE_D }} />
          </div>
        );
      }

      const dateKey = `${prefixStr}-${String(dayNum).padStart(2, "0")}`;
      const record = anomalies.get(dateKey);
      const scorable = isScorable(record);
      const isBeyondCutoff = !!cutoffKey && dateKey > cutoffKey;
      const isFuture = dateKey > todayKey;
      // A Saturday under "weekday evenings" is not missing evidence — it is
      // simply not part of the filter, and must not read as a failed day.
      const outsideFilter = !record && isDateExcludedByTod(dateKey, tod);
      // Nor is a day from before the export's rolling window a day that failed
      // to collect — it is simply not published in this file.
      const beforeWindow = !record && isBeforePublishedWindow(dateKey, { earliestDate: publishedFrom ?? null });

      const dayLabel = formatCivilDate(dateKey, {
        weekday: "long", day: "numeric", month: "long", year: "numeric",
      });

      let circleStyle: React.CSSProperties;
      let txtClr: string;

      if (isBeyondCutoff || isFuture) {
        circleStyle = { border: `2px dashed ${thm.textMuted}`, background: "transparent" };
        txtClr = thm.textMuted;
      } else if (!feedReady) {
        circleStyle = { border: `2px dashed ${thm.textMuted}`, background: "transparent" };
        txtClr = thm.textMuted;
      } else if (record && scorable && record.category) {
        const bg = categoryColor(thm.key, record.category);
        const provisional = record.status === "provisional";
        circleStyle = {
          background: bg,
          border: `2px ${provisional ? "dashed" : "solid"} ${provisional ? textOn(bg) : bg}`,
          boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
        };
        txtClr = textOn(bg);
      } else if (record) {
        // Present but not scorable: incomplete coverage, sparse history, or no
        // readings. Outlined (never filled) so it cannot read as "usual".
        const dotted = record.status === "insufficient_history";
        circleStyle = {
          border: `2px ${dotted ? "dotted" : "dashed"} ${thm.textMuted}`,
          background: "transparent",
        };
        txtClr = thm.textMuted;
      } else if (outsideFilter || beforeWindow) {
        // Outside the selected filter or before the published window: the
        // number stays legible but is clearly not a scored day — no ring.
        circleStyle = { border: "2px solid transparent", background: "transparent" };
        txtClr = thm.textMuted;
      } else {
        circleStyle = { border: `2px dashed ${thm.textMuted}`, background: "transparent" };
        txtClr = thm.textMuted;
      }

      const interactionLabel = !feedReady
        ? FEED_MESSAGES[(feedState as keyof typeof FEED_MESSAGES)] ?? "Comparison data unavailable"
        : isFuture
          ? "Future date"
          : isBeyondCutoff
            ? "Beyond cutoff"
            : record
              ? categoryText(record)
              : outsideFilter
                ? `Not part of ${TOD_LABELS[tod]}`
                : beforeWindow
                  ? "Before the published window"
                  : "No observations";

      const details = (() => {
        if (!record || !feedReady) {
          if (outsideFilter) return `This weekday is not part of ${TOD_LABELS[tod]}.`;
          if (beforeWindow) {
            return `Only the most recent 90 days are published (from ${publishedFrom ?? "–"}).`;
          }
          return "";
        }
        if (isScorable(record)) {
          // The category is already in the cell's label; do not say it twice.
          const parts: string[] = [];
          if (record.status === "provisional") parts.push("Provisional");
          if (record.observedMinutes !== null) {
            parts.push(`Estimated journey ${formatMinutes(record.observedMinutes)}`);
          }
          if (record.typicalMinutes !== null) {
            parts.push(`typical comparable ${civilWeekdayName(record.date)} ${formatMinutes(record.typicalMinutes)}`);
          }
          const delta = describeDelta(record);
          if (delta) parts.push(delta);
          const rank = describeRank(record);
          if (rank) parts.push(rank);
          return `${parts.join(". ")}.`;
        }
        if (record.status === "insufficient_history") {
          return `${STATUS_LABELS.insufficient_history}: ${record.referenceDays ?? 0} comparable ${civilWeekdayName(record.date)}s, ${MIN_COMPARABLE_DAYS} needed.`;
        }
        if (record.status === "incomplete_window") {
          return `${STATUS_LABELS.incomplete_window}: ${record.observedSlots.length} of ${record.expectedSlots.length} hourly estimates.`;
        }
        return `${STATUS_LABELS[record.status] || "No comparable data"}.`;
      })();

      // The accessible name identifies the day — date, route, filter, verdict.
      // The numbers go in the description below, so walking the grid does not
      // read a paragraph per cell.
      const ariaLabel = `${dayLabel}. ${selectedRoute}, ${TOD_LABELS[tod]}. ${interactionLabel}.`;
      const interactive = feedReady && !!record && !isFuture && !isBeyondCutoff;

      return (
        <div
          key={dateKey}
          role="gridcell"
          tabIndex={interactive ? 0 : undefined}
          aria-label={ariaLabel}
          aria-describedby={interactive && details ? `anomaly-desc-${dateKey}` : undefined}
          data-dk={interactive ? dateKey : undefined}
          data-category={scorable ? record?.category ?? undefined : undefined}
          data-status={record?.status}
          onClick={interactive && onDateClick ? () => onDateClick(dateKey) : undefined}
          onMouseEnter={interactive && record ? (e) => showTip(record, e.currentTarget) : undefined}
          onMouseLeave={interactive ? hideTip : undefined}
          onFocus={interactive && record ? (e) => showTip(record, e.currentTarget) : undefined}
          onBlur={interactive ? hideTip : undefined}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "5px 0", cursor: interactive ? "pointer" : "default",
            outline: "none", borderRadius: "50%",
          }}
        >
          <div style={{
            width: CIRCLE_D, height: CIRCLE_D, borderRadius: "50%",
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "transform 0.13s, box-shadow 0.13s",
            ...circleStyle,
          }}>
            <span style={{
              fontSize: 16, fontWeight: 800, color: txtClr,
              lineHeight: 1, userSelect: "none",
              opacity: isFuture || outsideFilter || beforeWindow ? 0.4 : 1,
            }}>
              {dayNum}
            </span>
          </div>
          {interactive && details ? (
            <span id={`anomaly-desc-${dateKey}`} style={SR_ONLY}>{details}</span>
          ) : null}
        </div>
      );
    });
  }, [anomalies, firstDay, daysInMo, prefixStr, thm.key, thm.textMuted, cutoffKey,
      todayKey, onDateClick, selectedRoute, tod, showTip, hideTip, feedReady, feedState,
      publishedFrom]);

  /* ── Tooltip rendering ──────────────────────────────────────── */
  const renderTooltip = () => {
    if (!tip) return null;
    const r = tip.record;
    const isGray = thm.key === "gray";
    const scorable = isScorable(r);

    const tipBg = isGray ? "#FAFAFA" : "#0F172A";
    const tipText = isGray ? "#111" : "#F0F4F8";
    const tipMuted = isGray ? "#737373" : "#94A3B8";
    const tipBorder = isGray ? "#D4D4D4" : "#334155";
    const tipShadow = isGray ? "2px 2px 0 #000" : "4px 4px 0 rgba(0,0,0,0.35)";
    const tipDivider = isGray ? "#E5E5E5" : "#1E293B";

    const accent = r.category ? categoryColor(thm.key, r.category) : thm.textMuted;
    const weekday = civilWeekdayName(r.date);

    const row = (label: string, value: string) => (
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 3 }}>
        <span style={{ color: tipMuted }}>{label}</span>
        <span style={{ fontWeight: 600, textAlign: "right" }}>{value}</span>
      </div>
    );

    return (
      <div
        role="tooltip"
        aria-live="polite"
        style={{
          position: "fixed",
          left: Math.max(8, Math.min(tip.x - 156, window.innerWidth - 328)),
          top: tip.y - 8,
          transform: "translateY(-100%)",
          width: 320,
          padding: "14px 17px",
          background: tipBg,
          color: tipText,
          borderRadius: 0,
          fontSize: 14,
          lineHeight: 1.5,
          fontFamily: "var(--app-font)",
          boxShadow: tipShadow,
          zIndex: 50,
          pointerEvents: "none",
          border: `1px solid ${tipBorder}`,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 2 }}>
          {formatCivilDate(r.date, { weekday: "short", day: "numeric", month: "short", year: "2-digit" })}
        </div>
        <div style={{ color: tipMuted, fontSize: 13, marginBottom: 12 }}>
          {selectedRoute} · {TOD_LABELS[tod]}
        </div>

        <div style={{ height: 1, background: tipDivider, marginBottom: 12 }} />

        {/* ── Category badge ── */}
        <div style={{
          display: "inline-block", padding: "4px 10px", marginBottom: 12,
          background: accent + "22", border: `1px solid ${accent}66`, borderRadius: 0,
          fontSize: 13, fontWeight: 700, color: accent,
        }}>
          {categoryText(r)}
          {r.status === "provisional" ? " · Provisional" : ""}
        </div>

        <div style={{ height: 1, background: tipDivider, marginBottom: 12 }} />

        {r.observedMinutes !== null && (
          <div style={{ fontSize: 29, fontWeight: 800, lineHeight: 1.1, marginBottom: 2 }}>
            {Math.round(r.observedMinutes * 10) / 10}
            <span style={{ fontSize: 14, fontWeight: 600, color: tipMuted }}> min</span>
          </div>
        )}
        <div style={{ color: tipMuted, fontSize: 12, marginBottom: 10 }}>
          estimated journey time · {TOD_NOUNS[tod]}
        </div>

        {scorable ? (
          <>
            {r.typicalMinutes !== null && row(`Typical comparable ${weekday}`, formatMinutes(r.typicalMinutes))}
            {r.deltaMinutes !== null && row("Difference", `${formatSignedMinutes(r.deltaMinutes)} (${formatPercent(r.deltaFraction)})`)}
            <div style={{ fontSize: 12, color: tipMuted, marginTop: 6, marginBottom: 10 }}>
              {describeDelta(r)}
              {describeRank(r) ? ` · ${describeRank(r)}` : ""}
            </div>
          </>
        ) : (
          <div style={{ fontSize: 12.5, color: tipMuted, marginBottom: 10, lineHeight: 1.5 }}>
            {r.status === "insufficient_history" && (
              <>
                {r.referenceDays ?? 0} comparable {weekday}s in the preceding {r.lookbackDays ?? 90} days.
                {" "}{MIN_COMPARABLE_DAYS} are needed before a colour is shown.
              </>
            )}
            {r.status === "incomplete_window" && (
              <>
                Incomplete coverage: {r.observedSlots.length} of {r.expectedSlots.length} expected
                hourly estimates ({describeSlots(r.observedSlots) || "none"}). A partial{" "}
                {TOD_NOUNS[tod]} is not shown as a normal one.
              </>
            )}
            {r.status === "not_started" && <>This {TOD_NOUNS[tod]} has not started yet.</>}
            {r.status === "no_observations" && <>No readings were collected for this {TOD_NOUNS[tod]}.</>}
            {r.status === "future" && <>This date is in the future.</>}
          </div>
        )}

        <div style={{ height: 1, background: tipDivider, marginBottom: 10 }} />

        <div style={{ fontSize: 11.5, color: tipMuted, lineHeight: 1.5 }}>
          Based on {describeSample(r)}
          {r.observedSlots.length > 0 ? ` (${describeSlots(r.observedSlots)})` : ""};
          origin–destination journey comparison.
        </div>
        {r.lastObservedAt && (
          <div style={{ fontSize: 11.5, color: tipMuted, marginTop: 2 }}>
            Last observation {r.lastObservedAt.slice(11)} city time.
          </div>
        )}
        {r.qualityFlags.includes("stale_feed") && (
          <div style={{ fontSize: 11.5, color: accent, marginTop: 2, fontWeight: 600 }}>
            Feed may be stale.
          </div>
        )}
        {r.qualityFlags.includes("distance_varied") && (
          <div style={{ fontSize: 11.5, color: tipMuted, marginTop: 2 }}>
            Route distance varied
            {r.distanceMinKm !== null && r.distanceMaxKm !== null
              ? ` (${r.distanceMinKm}–${r.distanceMaxKm} km)`
              : ""}.
          </div>
        )}

        <div style={{
          position: "absolute", bottom: -6, left: "50%", transform: "translateX(-50%)",
          width: 0, height: 0,
          borderLeft: "6px solid transparent", borderRight: "6px solid transparent",
          borderTop: `6px solid ${tipBg}`,
        }} />
      </div>
    );
  };

  /* ── Render ─────────────────────────────────────────────────── */
  return (
    <div style={{ position: "relative" }}>

      {/* Day-of-week headers */}
      <div role="row" style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", marginBottom: 2 }}>
        {DAY_HDR.map(d => (
          <div key={d} role="columnheader"
            style={{
              textAlign: "center", fontSize: 10, fontWeight: 700,
              textTransform: "uppercase", letterSpacing: "0.06em",
              color: thm.textMuted, padding: "4px 0",
            }}>
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid — fixed height for 6 rows to prevent layout shift */}
      <div key={fadeKey} role="grid" aria-label="Traffic calendar"
        style={{
          display: "grid", gridTemplateColumns: "repeat(7,1fr)",
          minHeight: 6 * (CIRCLE_D + 10),
          animation: "cal-fade-in 0.2s ease",
        }}>
        {cells}
      </div>

      {feedState === "unavailable" && (
        <p role="status" style={{ fontSize: 12, color: thm.textMuted, margin: "8px 0 0" }}>
          Day comparisons are unavailable right now — the anomaly export could not be loaded.
          No fallback colours are shown.
        </p>
      )}
      {feedState === "unsupported" && (
        <p role="status" style={{ fontSize: 12, color: thm.textMuted, margin: "8px 0 0" }}>
          This build does not understand the comparison method in the current export
          {feedMeta?.methodVersion ? ` (${feedMeta.methodVersion})` : ""}. Colours are suppressed
          rather than mismatched.
        </p>
      )}

      {/* ⚠ DEBUG PANEL — ?debug=1 to show. Reads the same records the cells
          render, so diagnostics and colours cannot disagree. */}
      {debug && (() => {
        const mono = "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace";
        const rows = [...anomalies.values()]
          .filter((r) => r.date.startsWith(prefixStr))
          .sort((a, b) => a.date.localeCompare(b.date));

        return (
          <div style={{
            border: "2px solid #EF4444", background: "#FEF2F2", padding: 12, marginTop: 12,
            fontFamily: mono, fontSize: 11, lineHeight: 1.6, color: "#1F2937", borderRadius: 0,
          }}>
            <div style={{ fontWeight: 800, fontSize: 13, color: "#DC2626", marginBottom: 8 }}>
              ⚠ DEBUG — calendar anomalies
            </div>
            <div style={{ marginBottom: 10, lineHeight: 1.8 }}>
              <div><strong>feed state:</strong> {feedState}{feedMeta?.error ? ` (${feedMeta.error})` : ""}</div>
              <div><strong>method_version:</strong> {feedMeta?.methodVersion ?? "–"}</div>
              <div><strong>generated_at:</strong> {feedMeta?.generatedAt ?? "–"}</div>
              <div><strong>records this month:</strong> {rows.length}</div>
              <div><strong>route · time filter:</strong> {selectedRoute} · {tod}</div>
            </div>
            {rows.length > 0 && (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10.5 }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #DC2626", textAlign: "left" }}>
                    <th style={{ padding: "3px 6px" }}>Date</th>
                    <th style={{ padding: "3px 6px" }}>Status</th>
                    <th style={{ padding: "3px 6px" }}>Category</th>
                    <th style={{ padding: "3px 6px", textAlign: "right" }}>Observed</th>
                    <th style={{ padding: "3px 6px", textAlign: "right" }}>Typical</th>
                    <th style={{ padding: "3px 6px", textAlign: "right" }}>Δ</th>
                    <th style={{ padding: "3px 6px", textAlign: "right" }}>Rank</th>
                    <th style={{ padding: "3px 6px", textAlign: "right" }}>Ref days</th>
                    <th style={{ padding: "3px 6px" }}>Slots</th>
                    <th style={{ padding: "3px 6px" }}>Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.date} style={{ borderBottom: "1px solid #FECACA", background: i % 2 === 0 ? "transparent" : "#FEF2F280" }}>
                      <td style={{ padding: "2px 6px", whiteSpace: "nowrap" }}>{r.date}</td>
                      <td style={{ padding: "2px 6px" }}>{r.status}</td>
                      <td style={{ padding: "2px 6px" }}>{r.category ?? "–"}</td>
                      <td style={{ padding: "2px 6px", textAlign: "right" }}>{formatMinutes(r.observedMinutes)}</td>
                      <td style={{ padding: "2px 6px", textAlign: "right" }}>{formatMinutes(r.typicalMinutes)}</td>
                      <td style={{ padding: "2px 6px", textAlign: "right" }}>{formatSignedMinutes(r.deltaMinutes)}</td>
                      <td style={{ padding: "2px 6px", textAlign: "right" }}>{r.rankScore ?? "–"}</td>
                      <td style={{ padding: "2px 6px", textAlign: "right" }}>{r.referenceDays ?? "–"}</td>
                      <td style={{ padding: "2px 6px" }}>{r.observedSlots.join(",") || "–"}</td>
                      <td style={{ padding: "2px 6px" }}>{r.qualityFlags.join(",") || "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {rows.length > 0 && (
              <div style={{ marginTop: 8, fontSize: 10 }}>
                reference_audit_id: {rows[rows.length - 1].referenceAuditId || "–"} ·
                source_revision: {rows[rows.length - 1].sourceRevision || "–"}
              </div>
            )}
          </div>
        );
      })()}

      {/* Legend lives in Dashboard footer row alongside R³S² context */}

      {/* Tooltip — portalled to body to escape card overflow:hidden */}
      {tip && createPortal(renderTooltip(), document.body)}
    </div>
  );
}

/** Compact five-category legend, ordered worst → best. */
export function CalendarLegend({ themeKey, textMuted }: { themeKey: string; textMuted: string }) {
  return (
    <div
      role="img"
      aria-label="Legend: each day is compared with the same weekday and hours on this route over the preceding 90 days. Categories run from much worse than usual to much better than usual; outlined days have no comparable result."
      style={{
        display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
        fontSize: 10, color: textMuted, fontWeight: 600, flexShrink: 0,
      }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
        {CATEGORY_LEGEND_ORDER.map((category) => (
          <span key={category} style={{ display: "flex", alignItems: "center", gap: 3 }}>
            <span style={{
              width: 11, height: 11, background: categoryColor(themeKey, category),
              borderRadius: "50%", display: "inline-block",
            }} />
            <span>{CATEGORY_LABELS[category].replace(" than usual", "").replace("Within the usual range", "Usual")}</span>
          </span>
        ))}
      </span>
      <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{
          width: 11, height: 11, border: `2px dashed ${textMuted}`,
          borderRadius: "50%", display: "inline-block",
        }} />
        <span>No comparable result</span>
      </span>
      <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{
          width: 11, height: 11, display: "inline-flex", alignItems: "center",
          justifyContent: "center", fontSize: 8, fontWeight: 800,
          color: textMuted, opacity: 0.5,
        }}>
          31
        </span>
        <span>Outside filter</span>
      </span>
    </div>
  );
}
