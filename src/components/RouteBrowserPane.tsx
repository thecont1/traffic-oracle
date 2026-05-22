import { useState, useRef, useCallback, useEffect, useLayoutEffect, useMemo } from "react";
import { useTheme } from "@/lib/ThemeContext";
import type { AppTheme } from "@/lib/theme";
import type { WeatherRow } from "@/lib/useTrafficData";
import appConfig from "../config.json";
import type { AppConfig } from "../lib/config";

const cfg = appConfig as AppConfig;

import InfoTip from "@/components/ui/InfoTip";
import { TOOLTIP_CONTENT } from "@/lib/tooltipContent";

/* ── Types ─────────────────────────────────────────────────────── */
// RouteCardData is defined in Dashboard.tsx and passed as props
// cityMin, cityMax, status, statusText, sortKey
type LiveStatus = 'unusually-fast' | 'faster' | 'as-expected' | 'slower' | 'unusually-slower' | 'no-data';

interface RouteTODStats {
  p05: number;
  p10: number;
  p15: number;
  p50: number;
  p85: number;
  p90: number;
  p95: number;
  count: number;
}

interface RouteCardData {
  label: string;
  origin: string;
  destination: string;
  liveSpeed: number | null;
  prevSpeed: number | null;
  liveTimestamp: Date | null;
  typical: RouteTODStats | null;
  cityMin: number;
  cityMax: number;
  status: LiveStatus;
  statusText: string;
  sortKey: string;
  weather?: WeatherRow;
}

interface PaneProps {
  cards: RouteCardData[] | null;
  selectedRoute: string;
  onRouteSelect: (label: string) => void;
  thm: AppTheme;
  isOpen: boolean;
  onToggle: () => void;
  paneWidth: number;
  dataTimestamp: Date | null;
  lastUpdated: Date | null;
}

/* ── Relative time label ─────────────────────────────────────── */
function relativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins === 1) return "1 min ago";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs === 1) return "1 hr ago";
  return `${hrs} hr ago`;
}

/* ── Animated sorted card list (FLIP) ─────────────────────────── */
function SortedCardList({
  cards, thm, selectedRoute, onRouteSelect,
}: {
  cards: RouteCardData[];
  thm: AppTheme;
  selectedRoute: string;
  onRouteSelect: (label: string) => void;
}) {
  // Sort ascending by liveSpeed; nulls sink to bottom
  const sorted = useMemo(() => {
    return [...cards].sort((a, b) => {
      if (a.liveSpeed === null && b.liveSpeed === null) return a.sortKey.localeCompare(b.sortKey);
      if (a.liveSpeed === null) return 1;
      if (b.liveSpeed === null) return -1;
      return a.liveSpeed - b.liveSpeed;
    });
  }, [cards]);

  // FLIP: store DOM refs and previous top offsets per card label
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const prevTops = useRef<Map<string, number>>(new Map());

  // Before paint: record current tops as "previous" for the upcoming render
  useLayoutEffect(() => {
    const map = new Map<string, number>();
    itemRefs.current.forEach((el, label) => {
      map.set(label, el.getBoundingClientRect().top);
    });
    prevTops.current = map;
  });

  // After paint: apply inverse offset then animate to zero
  useEffect(() => {
    itemRefs.current.forEach((el, label) => {
      const prev = prevTops.current.get(label);
      if (prev === undefined) return;
      const next = el.getBoundingClientRect().top;
      const dy = prev - next;
      if (Math.abs(dy) < 1) return;
      // Jump to old position instantly, then transition to natural position
      el.style.transition = "none";
      el.style.transform = `translateY(${dy}px)`;
      // Force reflow
      el.getBoundingClientRect();
      el.style.transition = "transform 0.35s cubic-bezier(0.4,0,0.2,1)";
      el.style.transform = "translateY(0)";
    });
  });

  return (
    <>
      {sorted.map((card, i) => (
        <div
          key={card.label}
          ref={el => {
            if (el) itemRefs.current.set(card.label, el);
            else itemRefs.current.delete(card.label);
          }}
        >
          <RouteCard
            card={card} thm={thm}
            isSelected={card.label === selectedRoute}
            onSelect={onRouteSelect}
            isLast={i === sorted.length - 1}
          />
        </div>
      ))}
    </>
  );
}

/* ── Progressive blur edge ─────────────────────────────────────── */
function BlurEdge({ position }: { position: "top" | "bottom" }) {
  const isTop = position === "top";
  return (
    <div aria-hidden="true" style={{
      position: "absolute", left: 0, right: 0,
      top: isTop ? 0 : undefined, bottom: isTop ? undefined : 0,
      height: 20, pointerEvents: "none", zIndex: 5,
      backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)",
      maskImage: `linear-gradient(to ${isTop ? "bottom" : "top"}, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 100%)`,
      WebkitMaskImage: `linear-gradient(to ${isTop ? "bottom" : "top"}, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 100%)`,
    }} />
  );
}

/* ── Nested-scale bullet chart ──────────────────────────────────── */
function NestedScaleChart({
  liveSpeed,
  prevSpeed,
  typical,
  cityMin,
  cityMax,
  status,
  thm,
  expanded,
}: {
  liveSpeed: number | null;
  prevSpeed: number | null;
  typical: RouteTODStats | null;
  cityMin: number;
  cityMax: number;
  status: LiveStatus;
  thm: AppTheme;
  expanded: boolean;
}) {
  const hasData = liveSpeed !== null && typical !== null && cityMax > cityMin;

  const isFaster = status === 'faster' || status === 'unusually-fast';
  const isSlower = status === 'slower' || status === 'unusually-slower';
  const isTypical = status === 'as-expected';

  // Diamond: dark grey when typical (between p15–p85); status colour when outside
  const statusColor = isTypical
    ? (thm.key === 'colour' ? '#9CA3AF' : '#4A4A4A')
    : thm.key === 'gray'
      ? (isFaster ? '#2D8A4E' : isSlower ? '#C0392B' : '#555555')
      : thm.key === 'pastel'
        ? (isFaster ? '#2E7D32' : isSlower ? '#D84315' : '#546E7A')
        : (isFaster ? '#34D399' : isSlower ? '#F87171' : '#60A5FA');

  // Inner band (p15–p85) — neutral mid-grey, clearly visible
  const bandColor = thm.key === 'colour'
    ? 'rgba(255,255,255,0.20)'
    : 'rgba(0,0,0,0.18)';

  // Midpoint tick (p50) — neutral grey tick, clearly distinct
  const tickColor = thm.key === 'colour'
    ? 'rgba(255,255,255,0.45)'
    : 'rgba(0,0,0,0.35)';

  // Outer rail — very subtle, marks full city-wide extent
  const railColor = thm.key === 'colour'
    ? 'rgba(255,255,255,0.08)'
    : 'rgba(0,0,0,0.08)';

  const railCapColor = thm.key === 'colour'
    ? 'rgba(255,255,255,0.12)'
    : 'rgba(0,0,0,0.12)';

  // Label colors for p15/p85 and cityMin/cityMax
  const labelColor = thm.key === 'gray'
    ? '#767676'
    : thm.key === 'pastel'
      ? '#6E675B'
      : '#64748B';

  // Track animation key: increments whenever liveSpeed changes so CSS
  // animations retrigger on each new data batch.
  const animKey = useMemo(() => Math.random(), [liveSpeed]);

  const cityRange = cityMax - cityMin || 1;
  const pct = (v: number) => ((v - cityMin) / cityRange) * 100;

  const livePos   = hasData ? pct(liveSpeed!) : null;
  const prevPos   = hasData && prevSpeed !== null ? pct(prevSpeed) : null;
  const p05Pos    = hasData ? pct(typical!.p05) : null;
  const p15Pos    = hasData ? pct(typical!.p15) : null;
  const p50Pos    = hasData ? pct(typical!.p50) : null;
  const p85Pos    = hasData ? pct(typical!.p85) : null;
  const p95Pos    = hasData ? pct(typical!.p95) : null;

  const fmt = (n: number | null) =>
    n === null ? '--' : (n % 1 === 0 ? n.toString() : n.toFixed(1));

  const ariaLabel = !hasData
    ? 'No data available.'
    : `Current speed ${fmt(liveSpeed)} km/h. Usual range ${fmt(typical!.p15)} to ${fmt(typical!.p85)} km/h. City-wide range ${fmt(cityMin)} to ${fmt(cityMax)} km/h.`;

  // Layout: top labels (14px) + gap (2px) + bar row (28px) + gap (4px) + bottom labels (14px) = 62px
  const BAR_ROW_H = 28;
  const LABEL_H = 14;
  const TOP_GAP = 2;
  const BOTTOM_GAP = 4;
  const TOTAL_H = LABEL_H + TOP_GAP + BAR_ROW_H + BOTTOM_GAP + LABEL_H;
  const BAND_H = 10;
  const DIAMOND = 10;

  return (
    <div style={{ width: '100%', position: 'relative', height: TOTAL_H }}>
      {/* ── Top labels row: p15 and p85 positioned above bar endpoints (hover only) ── */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: LABEL_H,
        opacity: expanded ? 1 : 0,
        transition: 'opacity 0.15s',
        pointerEvents: expanded ? 'auto' : 'none',
      }}>
        {hasData && (
          <>
            <span style={{
              position: 'absolute',
              left: `${p15Pos}%`,
              transform: 'translateX(-50%)',
              fontSize: 9,
              color: labelColor,
              fontWeight: 500,
              lineHeight: 1,
              whiteSpace: 'nowrap',
            }}>{fmt(typical!.p15)}</span>
            <span style={{
              position: 'absolute',
              left: `${p85Pos}%`,
              transform: 'translateX(-50%)',
              fontSize: 9,
              color: labelColor,
              fontWeight: 500,
              lineHeight: 1,
              whiteSpace: 'nowrap',
            }}>{fmt(typical!.p85)}</span>
          </>
        )}
      </div>

      {/* ── Bar row ── */}
      <div
        style={{
          position: 'absolute',
          top: LABEL_H + TOP_GAP,
          left: 0,
          right: 0,
          height: BAR_ROW_H,
        }}
        role="img"
        aria-label={ariaLabel}
      >
        {/* Outer rail: cityMin–cityMax */}
        <div style={{
          position: 'absolute', left: 0, right: 0,
          top: BAR_ROW_H / 2, transform: 'translateY(-50%)',
          height: 2, borderRadius: 1,
          background: railColor,
        }} />
        {/* Rail caps */}
        <div style={{
          position: 'absolute', left: 0, top: BAR_ROW_H / 2,
          transform: 'translateY(-50%)',
          width: 2, height: 8, borderRadius: 1,
          background: railCapColor,
        }} />
        <div style={{
          position: 'absolute', right: 0, top: BAR_ROW_H / 2,
          transform: 'translateY(-50%)',
          width: 2, height: 8, borderRadius: 1,
          background: railCapColor,
        }} />

        {hasData && (
          <>
            {/* Single p05–p95 band: gradient darkest at p50, fading to transparent at both ends */}
            <div style={{
              position: 'absolute',
              left: `${p05Pos}%`,
              width: `${p95Pos! - p05Pos!}%`,
              top: (BAR_ROW_H - BAND_H) / 2,
              height: BAND_H,
              borderRadius: BAND_H / 2,
              background: (() => {
                // Map p50 to a percentage within the p05–p95 span so the peak
                // of the gradient tracks the actual median, not the midpoint.
                const span = p95Pos! - p05Pos! || 1;
                const medPct = Math.round(((p50Pos! - p05Pos!) / span) * 100);
                const c = bandColor;
                return `linear-gradient(to right, transparent 0%, ${c} ${medPct}%, transparent 100%)`;
              })(),
            }} />

            {/* Midpoint tick: p50 */}
            <div style={{
              position: 'absolute',
              left: `${p50Pos}%`,
              top: (BAR_ROW_H - BAND_H) / 2 - 3,
              width: 1,
              height: BAND_H + 6,
              background: tickColor,
              borderRadius: 1,
              transform: 'translateX(-0.5px)',
            }} />

            {/* Trail diamond: travels from prevPos → livePos, fading 0→1, loops */}
            {prevPos !== null && prevPos !== livePos && (
              <div key={`trail-${animKey}`} style={{
                position: 'absolute',
                top: BAR_ROW_H / 2,
                width: DIAMOND,
                height: DIAMOND,
                background: statusColor,
                borderRadius: 2,
                transform: 'translate(-50%, -50%) rotate(45deg)',
                opacity: 0,
                ['--diamond-from' as string]: `${prevPos}%`,
                ['--diamond-to' as string]: `${livePos}%`,
                animation: 'diamond-trail 2.2s ease-in-out infinite',
                zIndex: 1,
              }} />
            )}

            {/* Live diamond: fixed at current speed, no animation */}
            <div style={{
              position: 'absolute',
              left: `${livePos}%`,
              top: BAR_ROW_H / 2,
              width: DIAMOND,
              height: DIAMOND,
              background: statusColor,
              borderRadius: 2,
              transform: 'translate(-50%, -50%) rotate(45deg)',
              boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
              zIndex: 2,
            }} />
          </>
        )}
      </div>

      {/* ── Bottom labels row: cityMin, live speed, cityMax ── */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: LABEL_H,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
      }}>
        {/* cityMin — hover only */}
        <span style={{
          fontSize: 9,
          color: labelColor,
          fontWeight: 500,
          lineHeight: 1,
          opacity: expanded ? 1 : 0,
          transition: 'opacity 0.15s',
        }}>{hasData ? fmt(cityMin) : ''}</span>

        {/* Live speed — always visible, positioned under diamond */}
        <span style={{
          fontSize: 9,
          fontWeight: 700,
          color: statusColor,
          position: 'absolute',
          left: `${livePos}%`,
          transform: 'translateX(-50%)',
          whiteSpace: 'nowrap',
          lineHeight: 1,
          bottom: 0,
        }}>
          {hasData ? fmt(liveSpeed) : ''}
        </span>

        {/* cityMax — hover only */}
        <span style={{
          fontSize: 9,
          color: labelColor,
          fontWeight: 500,
          lineHeight: 1,
          opacity: expanded ? 1 : 0,
          transition: 'opacity 0.15s',
        }}>{hasData ? fmt(cityMax) : ''}</span>
      </div>
    </div>
  );
}

/* ── Route card ────────────────────────────────────────────────── */
function RouteCard({
  card, thm, isSelected, onSelect, isLast,
}: {
  card: RouteCardData; thm: AppTheme; isSelected: boolean;
  onSelect: (label: string) => void; isLast: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const handleMouseEnter = useCallback(() => {
    // Clear any pending close timeout
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setHovered(true);
  }, []);
  
  const handleMouseLeave = useCallback(() => {
    // Delay closing by 500ms for better UX
    hoverTimeoutRef.current = setTimeout(() => {
      setHovered(false);
    }, 2500);
  }, []);
  
  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);
  
  // Full-width background: selected gets strong tint, hover gets subtle tint
  // Gray mode: base is white so cards are visible against the #F0F0F0 pane
  let cardBg = thm.key === "gray" ? "#ffffff" : "transparent";
  if (isSelected) {
    cardBg = thm.key === "colour" ? "rgba(34,211,238,0.15)"
             : thm.key === "pastel" ? "rgba(58,134,200,0.15)"
             : "rgba(0,0,0,0.08)";
  } else if (hovered) {
    cardBg = thm.key === "colour" ? "rgba(34,211,238,0.08)"
             : thm.key === "pastel" ? "rgba(58,134,200,0.07)"
             : thm.key === "gray" ? "#f5f5f5"
             : "rgba(0,0,0,0.04)";
  }

  const endpoints = card.destination
    ? `${card.origin} → ${card.destination}`
    : card.origin;
  
  // Status text color - matching the demo scheme exactly
  const getStatusColor = () => {
    if (thm.key === 'gray') {
      // Scale me gray: use weight/contrast, no hue
      return card.status === 'as-expected' ? '#555555'
           : card.status === 'faster' || card.status === 'unusually-fast' ? '#2D8A4E'
           : '#C0392B';
    }
    if (thm.key === 'pastel') {
      return card.status === 'as-expected' ? '#546E7A'
           : card.status === 'faster' || card.status === 'unusually-fast' ? '#2E7D32'
           : '#D84315';
    }
    // Colour me Surprised
    return card.status === 'as-expected' ? '#60A5FA'
         : card.status === 'faster' || card.status === 'unusually-fast' ? '#34D399'
         : '#F87171';
  };

  return (
    <div
      onClick={() => onSelect(card.label)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      tabIndex={0}
      role="button"
      className="route-card-focus"
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(card.label); } }}
      style={{
        background: cardBg,
        borderRadius: 6,
        padding: "10px 10px",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        transition: "background 0.12s",
      }}
    >
      {/* Row 1: route name + status */}
      <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
        <p style={{
          fontSize: 12, fontWeight: 700,
          color: isSelected ? thm.chart.line1 : thm.textPrimary,
          lineHeight: 1.3, margin: 0,
          transition: "color 0.12s",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          flex: 1, minWidth: 0,
        }}>
          {card.label}
        </p>
        <span style={{ 
          fontSize: 9, 
          fontWeight: 500,
          color: getStatusColor(),
          whiteSpace: "nowrap", 
          flexShrink: 0,
          fontStyle: 'italic',
        }}>
          {card.statusText}
          {card.liveSpeed !== null && card.prevSpeed !== null && (
            <span style={{ opacity: 0.75 }}>
              {card.liveSpeed === card.prevSpeed 
                ? ', no change' 
                : card.liveSpeed !== card.prevSpeed && (card.liveSpeed > card.prevSpeed ? ', improving' : ', getting worse')
              }
            </span>
          )}
        </span>
      </div>
      
      {/* Row 2: origin → destination */}
      <p style={{
        fontSize: 10, color: thm.textMuted,
        lineHeight: 1.3, margin: 0,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {endpoints}
      </p>

      {/* Row 2b: weather strip */}
      {card.weather && (
        <div style={{
          display: "flex", alignItems: "center", gap: 5,
          fontSize: 10, color: thm.textMuted, flexWrap: "wrap",
        }}>
          {card.weather.temp_c !== null && (
            <span title="Temperature / Feels like">
              🌡 {card.weather.temp_c}°C
              {card.weather.realfeel_c !== null && (
                <span style={{ opacity: 0.75 }}>
                  {" "}(Feels like {card.weather.realfeel_c}°C{card.weather.realfeel_word ? ` – ${card.weather.realfeel_word}` : ""})
                </span>
              )}
            </span>
          )}
          {card.weather.humidity_pct !== null && (
            <span title="Humidity">💧{card.weather.humidity_pct}%</span>
          )}
          {card.weather.aqi !== null && (
            <span
              title={`AQI · ${card.weather.aqi_category}`}
              style={{
                fontWeight: 600,
                color:
                  card.weather.aqi <= 50  ? (thm.key === "colour" ? "#34D399" : "#2E7D32") :
                  card.weather.aqi <= 100 ? (thm.key === "colour" ? "#FBBF24" : "#F57F17") :
                                            (thm.key === "colour" ? "#F87171" : "#C62828"),
              }}
            >
              💨 {card.weather.aqi}
            </span>
          )}
          {card.weather.condition && (
            <span style={{ opacity: 0.8 }}>☁️ {card.weather.condition}</span>
          )}
        </div>
      )}

      {/* Row 3: Nested-scale chart */}
      <div style={{ marginTop: 4 }} />
      <NestedScaleChart
        liveSpeed={card.liveSpeed}
        prevSpeed={card.prevSpeed}
        typical={card.typical}
        cityMin={card.cityMin}
        cityMax={card.cityMax}
        status={card.status}
        thm={thm}
        expanded={hovered || isSelected}
      />
      
      
      {/* Separator */}
      {!isLast && (
        <div style={{
          height: 1, width: "80%", margin: "4px auto 0",
          background: thm.key === "colour" ? "rgba(71,65,60,0.08)" : "rgba(0,0,0,0.06)",
        }} />
      )}
    </div>
  );
}

/* ── Desktop pane with draggable left edge ─────────────────────── */
function DesktopPane({ cards, selectedRoute, onRouteSelect, thm, isOpen, onToggle, paneWidth, dataTimestamp, lastUpdated }: PaneProps) {
  const RAIL_WIDTH = 36;
  const MIN_WIDTH = cfg.route_pane.min_width;
  const MAX_WIDTH = cfg.route_pane.max_width;
  const [dragging, setDragging] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  /* Tick every 60 s so the "Live · updated X min ago" label stays fresh */
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
    startXRef.current = e.clientX;
    startWidthRef.current = paneWidth;
  }, [paneWidth]);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const dx = startXRef.current - e.clientX;
      const newW = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidthRef.current + dx));
      window.dispatchEvent(new CustomEvent("route-pane-resize", { detail: newW }));
    };
    const onUp = () => setDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [dragging]);

  return (
    <div style={{
      flexShrink: 0,
      width: isOpen ? paneWidth + RAIL_WIDTH : RAIL_WIDTH,
      transition: dragging ? "none" : "width 0.3s cubic-bezier(0.4,0,0.2,1)",
      overflow: "hidden",
      display: "flex",
      background: thm.paneBg,
      border: `1px solid ${thm.paneBorder}`,
      borderRadius: 16,
      margin: "8px 0 8px 8px",
      position: "relative",
    }}>
      {/* Draggable resize handle — left edge */}
      {isOpen && (
        <div
          onMouseDown={onDragStart}
          style={{
            position: "absolute", left: 0, top: 0, bottom: 0,
            width: 1, cursor: "col-resize", zIndex: 3,
            background: dragging
              ? (thm.key === "colour" ? "rgba(34,211,238,0.25)" : "rgba(58,134,200,0.18)")
              : "transparent",
            transition: "background 0.15s",
            borderRadius: "0 2px 2px 0",
          }}
          title="Drag to resize"
        />
      )}

      {/* Pane content */}
      <div style={{
        width: paneWidth, flexShrink: 0,
        display: "flex", flexDirection: "column", overflow: "hidden",
        opacity: isOpen ? 1 : 0,
        transition: "opacity 0.2s ease",
        pointerEvents: isOpen ? "auto" : "none",
        marginLeft: isOpen ? 8 : 0,
      }}>
        {/* Header */}
        <div style={{
          padding: "10px 12px 7px",
          borderBottom: `1px solid ${thm.key === "colour" ? "#2A3545" : "#DCCFB8"}`,
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{
                fontFamily: "var(--app-font-display)", fontWeight: 900, fontSize: 18,
                color: thm.textPrimary, letterSpacing: "-0.02em", lineHeight: 1,
              }}>
                Traffic NOW!
              </span>
              {/* Info tooltip — click to toggle animated callout */}
              <InfoTip thm={thm}>{TOOLTIP_CONTENT.routeBrowserPane.body}</InfoTip>
            </div>
            <button onClick={onToggle} title="Close" aria-label="Close route browser"
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14,
                color: thm.textMuted, padding: 10, borderRadius: 4, lineHeight: 1,
                minWidth: 44, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center" }}>
              ✕
            </button>
          </div>
          {lastUpdated && (
            <p style={{ fontSize: 11, color: thm.textMuted, margin: "4px 0 0",
              display: "flex", alignItems: "center", gap: 5, opacity: 0.8 }}>
              <span className="live-dot" aria-hidden="true" />
              <span>
                Live · updated {relativeTime(lastUpdated)}
              </span>
            </p>
          )}
        </div>

        {/* Scrollable list */}
        <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
          <BlurEdge position="top" />
          <BlurEdge position="bottom" />
          <div className="scrollbar-hide" style={{
            height: "100%", overflowY: "auto", padding: "8px 8px 8px 0",
            display: "flex", flexDirection: "column", gap: 6, scrollbarWidth: "none",
          }}>
            {!cards ? (
              <p style={{ color: thm.textMuted, fontSize: 11, padding: "1rem 0", textAlign: "center" }}>
                Computing route summaries…
              </p>
            ) : cards.length === 0 ? (
              <p style={{ color: thm.textMuted, fontSize: 11, padding: "1rem 0", textAlign: "center" }}>
                No routes found
              </p>
            ) : (
              <SortedCardList
                cards={cards}
                thm={thm}
                selectedRoute={selectedRoute}
                onRouteSelect={onRouteSelect}
              />
            )}
          </div>
        </div>
      </div>

      {/* Rail — right edge */}
      <div
        onClick={onToggle}
        role="button"
        tabIndex={0}
        aria-label={isOpen ? "Close route browser" : "Open route browser"}
        aria-expanded={isOpen}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } }}
        title={isOpen ? "Close route browser" : "Browse all routes"}
        style={{
          position: "absolute", right: 0, top: 0, bottom: 0,
          width: RAIL_WIDTH,
          display: "flex", flexDirection: "column", alignItems: "center",
          paddingTop: 14, cursor: "pointer",
          background: thm.key === "colour" ? "#0F1218" : thm.key === "pastel" ? "#F3EDE0" : "#f0f0f0",
          borderLeft: `1px solid ${thm.key === "colour" ? "#2A3545" : thm.key === "pastel" ? "#DCCFB8" : "#e0e0e0"}`,
          transition: "background 0.2s", zIndex: 2,
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLElement).style.background =
            thm.key === "colour" ? "#1A2030" : thm.key === "pastel" ? "#EDE5D5" : "#e8e8e8";
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLElement).style.background =
            thm.key === "colour" ? "#0F1218" : thm.key === "pastel" ? "#F3EDE0" : "#f0f0f0";
        }}
      >
        <span className="live-dot" aria-hidden="true" style={{
          width: 5, height: 5, marginBottom: 6,
        }} />
        <span style={{
          fontSize: 12, fontWeight: 700, letterSpacing: "0.15em",
          textTransform: "uppercase", color: thm.textMuted, whiteSpace: "nowrap",
          writingMode: "vertical-rl", textOrientation: "mixed", transform: "rotate(0deg)",
        }}>
          LIVE ROUTE EXPLORER
        </span>
        <div style={{
          marginTop: 8, fontSize: 15, color: thm.textMuted,
          transform: isOpen ? "rotate(180deg)" : "rotate(90deg)",
          transition: "transform 0.3s cubic-bezier(0.4,0,0.2,1)",
        }}>▸</div>
      </div>
    </div>
  );
}

/* ── Mobile bottom sheet ───────────────────────────────────────── */
function MobileSheet({ cards, selectedRoute, onRouteSelect, thm, isOpen, onToggle, dataTimestamp, lastUpdated }: PaneProps) {
  return (
    <>
      {isOpen && (
        <div onClick={onToggle} style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 998,
          backdropFilter: "blur(2px)", WebkitBackdropFilter: "blur(2px)",
          animation: "fade-in 0.2s ease",
        }} />
      )}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0,
        height: isOpen ? 300 : 0, zIndex: 999,
        background: thm.sectionBg,
        borderTop: `1px solid ${thm.key === "colour" ? "#2A3545" : "#DCCFB8"}`,
        borderTopLeftRadius: 16, borderTopRightRadius: 16,
        boxShadow: "0 -4px 20px rgba(0,0,0,0.10)",
        display: "flex", flexDirection: "column", overflow: "hidden",
        transition: "height 0.3s cubic-bezier(0.4,0,0.2,1)",
      }}>
        <div onClick={onToggle} style={{
          flexShrink: 0, padding: "8px 0 4px",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 3, cursor: "pointer",
        }}>
          <div style={{ width: 32, height: 3, borderRadius: 2, background: thm.textMuted, opacity: 0.3 }} />
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 13 }}>🗺️</span>
            <span style={{
              fontFamily: "var(--app-font-display)", fontWeight: 700, fontSize: 13, color: thm.textPrimary,
            }}>Traffic NOW!</span>
          </div>
          {lastUpdated && (
            <p style={{ fontSize: 9, color: thm.textMuted, margin: "2px 0 0",
              display: "flex", alignItems: "center", gap: 4 }}>
              <span className="live-dot" aria-hidden="true" style={{ width: 5, height: 5 }} />
              <span>Live · {relativeTime(lastUpdated)}</span>
            </p>
          )}
        </div>
        <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
          <BlurEdge position="top" />
          <BlurEdge position="bottom" />
          <div className="scrollbar-hide" style={{
            height: "100%", overflowY: "auto", padding: "6px 8px 12px 0",
            display: "flex", flexDirection: "column", gap: 6, scrollbarWidth: "none",
          }}>
            {!cards ? (
              <p style={{ color: thm.textMuted, fontSize: 11, padding: "1rem 0", textAlign: "center" }}>
                Computing route summaries…
              </p>
            ) : (
              <SortedCardList
                cards={cards}
                thm={thm}
                selectedRoute={selectedRoute}
                onRouteSelect={onRouteSelect}
              />
            )}
          </div>
        </div>
      </div>
      {!isOpen && (
        <button onClick={onToggle} style={{
          position: "fixed", bottom: 16, right: 16, zIndex: 997,
          display: "flex", alignItems: "center", gap: 6,
          padding: "8px 14px", borderRadius: 9999,
          border: `1px solid ${thm.key === "colour" ? "#2A3545" : "#DCCFB8"}`,
          background: thm.key === "colour" ? "#141A24" : "transparent",
          color: thm.textPrimary, fontFamily: "var(--app-font-display)",
          fontWeight: 700, fontSize: 12, cursor: "pointer",
          boxShadow: "0 3px 12px rgba(0,0,0,0.12)",
        }}>
          <span style={{ fontSize: 14 }}>🗺️</span>
          Browse routes
        </button>
      )}
    </>
  );
}

/* ── Main export ───────────────────────────────────────────────── */
interface Props {
  cards: RouteCardData[] | null;
  selectedRoute: string;
  onRouteSelect: (label: string) => void;
  dataTimestamp: Date | null;
  lastUpdated: Date | null;
  mobile?: boolean;
}

export default function RouteBrowserPane(props: Props) {
  const { theme: thm } = useTheme();
  const [isOpen, setIsOpen] = useState(cfg.route_pane.open);
  const [paneWidth, setPaneWidth] = useState(cfg.route_pane.width);

  useEffect(() => {
    const handler = (e: Event) => {
      const w = (e as CustomEvent).detail;
      if (typeof w === "number" && w >= cfg.route_pane.min_width && w <= cfg.route_pane.max_width) setPaneWidth(w);
    };
    window.addEventListener("route-pane-resize", handler);
    return () => window.removeEventListener("route-pane-resize", handler);
  }, []);

  const handleToggle = useCallback(() => setIsOpen(v => !v), []);
  const handleRouteSelect = useCallback((label: string) => {
    props.onRouteSelect(label);
  }, [props.onRouteSelect]);

  const paneProps: PaneProps = {
    cards: props.cards, selectedRoute: props.selectedRoute,
    onRouteSelect: handleRouteSelect, thm, isOpen, onToggle: handleToggle, paneWidth,
    dataTimestamp: props.dataTimestamp, lastUpdated: props.lastUpdated,
  };

  return props.mobile ? <MobileSheet {...paneProps} /> : <DesktopPane {...paneProps} />;
}
