import { useState, useRef, useCallback, useEffect } from "react";
import { useTheme } from "@/lib/ThemeContext";
import type { AppTheme } from "@/lib/theme";
import appConfig from "../config.json";
import type { AppConfig } from "../lib/config";

const cfg = appConfig as AppConfig;

/* ── Info tip ────────────────────────────────────────────────── */
function InfoTip({ thm }: { thm: AppTheme }) {
  const tipRef = useRef<HTMLDivElement>(null);
  const tooltipText = "See if traffic is normal right now. The colored diamond shows current speed; the neutral band shows what's typical for this hour (based on 90 days of data). Diamond within the band = typical, left = slower, right = faster. Tap any route to explore it on the main charts.";
  
  const show = (e: React.MouseEvent<HTMLSpanElement>) => {
    const el = tipRef.current;
    if (!el) return;
    const r = e.currentTarget.getBoundingClientRect();
    const TW = el.offsetWidth || 240;
    const TH = el.offsetHeight || 64;
    const vw = window.innerWidth;
    const left = Math.max(8, Math.min(vw - TW - 8, r.left + r.width / 2 - TW / 2));
    el.style.left = left + "px";
    el.style.top = (r.top > TH + 20 ? r.top - TH - 10 : r.bottom + 10) + "px";
    el.style.opacity = "1";
  };
  const hide = () => { if (tipRef.current) tipRef.current.style.opacity = "0"; };
  
  return (
    <>
      <span
        onMouseEnter={show}
        onMouseLeave={hide}
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 14, height: 14, borderRadius: "50%",
          border: `1.5px solid ${thm.textMuted}`,
          fontSize: 8, fontWeight: 900, cursor: "help",
          color: thm.textMuted,
          marginLeft: 5, userSelect: "none",
          textTransform: "none", letterSpacing: "normal",
          lineHeight: 1, flexShrink: 0,
        }}
      >
        i
      </span>
      <div ref={tipRef} style={{
        position: "fixed", pointerEvents: "none",
        opacity: 0, transition: "opacity 0.15s ease",
        background: thm.key === "gray" ? "#f0f0f0" : "#141A24",
        border: thm.key === "gray" ? "1px solid #d0d0d0" : "none",
        borderRadius: 10, padding: "9px 12px",
        boxShadow: "0 6px 28px rgba(0,0,0,0.45)",
        zIndex: 2000, maxWidth: 240,
        fontSize: 12, lineHeight: 1.5, 
        color: thm.key === "gray" ? "#333333" : "#F0F4F8",
      }}>
        {tooltipText}
      </div>
    </>
  );
}

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
  liveTimestamp: Date | null;
  typical: RouteTODStats | null;
  cityMin: number;
  cityMax: number;
  status: LiveStatus;
  statusText: string;
  sortKey: string;
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
  typical,
  cityMin,
  cityMax,
  status,
  thm,
  expanded,
}: {
  liveSpeed: number | null;
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

  const statusColor = thm.key === 'gray'
    ? (isFaster ? '#2D8A4E' : isSlower ? '#C0392B' : '#555555')
    : thm.key === 'pastel'
      ? (isFaster ? '#2E7D32' : isSlower ? '#D84315' : '#546E7A')
      : (isFaster ? '#34D399' : isSlower ? '#F87171' : '#60A5FA');

  // Inner band (p15–p85) — main confidence band
  const bandColor = thm.key === 'gray'
    ? 'rgba(0,0,0,0.12)'
    : thm.key === 'pastel'
      ? 'rgba(120,100,70,0.14)'
      : 'rgba(120,140,180,0.20)';

  // Outer band (p05–p15 and p85–p95) — lighter shade
  const outerBandColor = thm.key === 'gray'
    ? 'rgba(0,0,0,0.05)'
    : thm.key === 'pastel'
      ? 'rgba(120,100,70,0.06)'
      : 'rgba(120,140,180,0.08)';

  const tickColor = thm.key === 'gray'
    ? 'rgba(0,0,0,0.25)'
    : thm.key === 'pastel'
      ? 'rgba(120,100,70,0.30)'
      : 'rgba(160,180,210,0.35)';

  const railColor = thm.key === 'gray'
    ? 'rgba(0,0,0,0.06)'
    : thm.key === 'pastel'
      ? 'rgba(120,100,70,0.08)'
      : 'rgba(120,140,180,0.10)';

  const railCapColor = thm.key === 'gray'
    ? 'rgba(0,0,0,0.10)'
    : thm.key === 'pastel'
      ? 'rgba(120,100,70,0.12)'
      : 'rgba(120,140,180,0.15)';

  const labelColor = thm.key === 'gray'
    ? '#999'
    : thm.key === 'pastel'
      ? '#8A7E68'
      : '#64748B';

  const cityRange = cityMax - cityMin || 1;
  const pct = (v: number) => ((v - cityMin) / cityRange) * 100;

  const livePos   = hasData ? pct(liveSpeed!) : null;
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
            {/* Outer band: p05–p15 (lighter) */}
            <div style={{
              position: 'absolute',
              left: `${p05Pos}%`,
              width: `${p15Pos! - p05Pos!}%`,
              top: (BAR_ROW_H - BAND_H) / 2,
              height: BAND_H,
              background: outerBandColor,
              borderRadius: 2,
            }} />

            {/* Outer band: p85–p95 (lighter) */}
            <div style={{
              position: 'absolute',
              left: `${p85Pos}%`,
              width: `${p95Pos! - p85Pos!}%`,
              top: (BAR_ROW_H - BAND_H) / 2,
              height: BAND_H,
              background: outerBandColor,
              borderRadius: 2,
            }} />

            {/* Inner band: p15–p85 (main confidence band) */}
            <div style={{
              position: 'absolute',
              left: `${p15Pos}%`,
              width: `${p85Pos! - p15Pos!}%`,
              top: (BAR_ROW_H - BAND_H) / 2,
              height: BAND_H,
              background: bandColor,
              borderRadius: 2,
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

            {/* Diamond: currentSpeed */}
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
  let cardBg = "transparent";
  if (isSelected) {
    cardBg = thm.key === "colour" ? "rgba(34,211,238,0.15)"
             : thm.key === "pastel" ? "rgba(58,134,200,0.15)"
             : "rgba(0,0,0,0.08)";
 } else if (hovered) {
    cardBg = thm.key === "colour" ? "rgba(34,211,238,0.08)"
             : thm.key === "pastel" ? "rgba(58,134,200,0.07)"
             : "rgba(0,0,0,0.04)";
  }

  const endpoints = card.destination
    ? `${card.origin} → ${card.destination}`
    : card.origin;
  
  // Status text color - per theme specs
  const getStatusColor = () => {
    if (thm.key === 'gray') {
      // Scale me gray!: use weight/contrast instead of hue
      return thm.textPrimary;
    }
    
    // For pastel and colour: use semantic colors sparingly
    switch (card.status) {
      case 'unusually-fast':
      case 'faster': return thm.speedGood;
      case 'unusually-slower':
      case 'slower': return thm.speedBad;
      default: return thm.textMuted;
    }
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
      
      {/* Row 3: Nested-scale chart */}
      <div style={{ marginTop: 4 }} />
      <NestedScaleChart
        liveSpeed={card.liveSpeed}
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
              <InfoTip thm={thm} />
            </div>
            <button onClick={onToggle} title="Close" aria-label="Close route browser"
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14,
                color: thm.textMuted, padding: 10, borderRadius: 4, lineHeight: 1,
                minWidth: 44, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center" }}>
              ✕
            </button>
          </div>
          {dataTimestamp && (
            <p style={{ fontSize: 11, color: thm.textMuted, margin: "4px 0 0",
              display: "flex", alignItems: "center", gap: 5, opacity: 0.8 }}>
              <span className="live-dot" aria-hidden="true" />
              <span>
                Live · updated {relativeTime(dataTimestamp)}
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
              cards.map((card, i) => (
                <RouteCard key={card.label} card={card} thm={thm}
                  isSelected={card.label === selectedRoute} onSelect={onRouteSelect}
                  isLast={i === cards.length - 1} />
              ))
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
          background: thm.key === "colour" ? "#0F1218" : thm.key === "pastel" ? "#F3EDE0" : "#f5f5f5",
          borderLeft: `1px solid ${thm.key === "colour" ? "#2A3545" : "#DCCFB8"}`,
          transition: "background 0.2s", zIndex: 2,
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLElement).style.background =
            thm.key === "colour" ? "#1A2030" : thm.key === "pastel" ? "#EDE5D5" : "#eeeeee";
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLElement).style.background =
            thm.key === "colour" ? "#0F1218" : thm.key === "pastel" ? "#F3EDE0" : "#f5f5f5";
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
          {dataTimestamp && (
            <p style={{ fontSize: 9, color: thm.textMuted, margin: "2px 0 0",
              display: "flex", alignItems: "center", gap: 4 }}>
              <span className="live-dot" aria-hidden="true" style={{ width: 5, height: 5 }} />
              <span>Live · {relativeTime(dataTimestamp)}</span>
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
              cards.map((card, i) => (
                <RouteCard key={card.label} card={card} thm={thm}
                  isSelected={card.label === selectedRoute} onSelect={onRouteSelect}
                  isLast={i === cards.length - 1} />
              ))
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
