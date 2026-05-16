import { useState, useRef, useCallback, useEffect } from "react";
import { useTheme } from "@/lib/ThemeContext";
import type { AppTheme } from "@/lib/theme";

/* ── Info tip callout ──────────────────────────────────────────── */
function InfoTip({ thm }: { thm: AppTheme }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative" }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}>
      <button
        aria-label="How to read these charts"
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 18, height: 18, borderRadius: "50%",
          border: `1.5px solid ${open ? thm.chart.line1 : thm.textMuted}`,
          fontSize: 10, fontWeight: 700, cursor: "help",
          color: open ? thm.chart.line1 : thm.textMuted,
          background: open ? (thm.key === "colour" ? "rgba(125,183,232,0.12)" : "rgba(58,134,200,0.08)") : "transparent",
          flexShrink: 0, lineHeight: 1, padding: 0,
          transition: "all 0.15s",
          pointerEvents: "none",
        }}
      >i</button>
      {open && (
        <div style={{
          position: "absolute", top: "100%", left: "50%",
          transform: "translateX(-50%)",
          marginTop: 8,
          padding: "12px 14px",
          borderRadius: 12,
          background: thm.key === "colour" ? "#2A2725" : "#FFFFFF",
          border: `1px solid ${thm.key === "colour" ? "#47413C" : "#DCCFB8"}`,
          boxShadow: "0 8px 32px rgba(0,0,0,0.22)",
          fontSize: 11, lineHeight: 1.55,
          color: thm.textPrimary,
          width: 240,
          zIndex: 200,
          animation: "callout-in 0.2s cubic-bezier(0.4,0,0.2,1) both",
          pointerEvents: "none",
        }}>
          {/* Arrow pointer */}
          <div aria-hidden style={{
            position: "absolute", bottom: "100%", left: "50%",
            transform: "translateX(-50%)",
            width: 0, height: 0,
            borderLeft: "6px solid transparent",
            borderRight: "6px solid transparent",
            borderBottom: `6px solid ${thm.key === "colour" ? "#47413C" : "#DCCFB8"}`,
          }} />
          <div aria-hidden style={{
            position: "absolute", bottom: "100%", left: "50%",
            transform: "translateX(-50%)",
            width: 0, height: 0,
            borderLeft: "5px solid transparent",
            borderRight: "5px solid transparent",
            borderBottom: `5px solid ${thm.key === "colour" ? "#2A2725" : "#FFFFFF"}`,
            marginTop: 1,
          }} />
          <p style={{ margin: "0 0 6px", fontWeight: 700, fontSize: 12 }}>
            Traffic NOW!
          </p>
          <p style={{ margin: "0 0 5px", color: thm.textMuted }}>
            <strong style={{ color: thm.textPrimary }}>Live vs Typical.</strong> Colored circle ● shows current speed. Gray bar shows typical range for this hour (90-day history ±90 min). Line spans city-wide min→max.
          </p>
          <p style={{ margin: "0 0 5px", color: thm.textMuted }}>
            <strong style={{ color: thm.textPrimary }}>Position matters.</strong> Circle left of gray bar = slower than typical. Right of bar = faster. Centered = as expected. Verdict: <strong style={{ color: thm.speedGood }}>green</strong> = faster, <strong style={{ color: thm.speedBad }}>red</strong> = slower, <strong style={{ color: thm.chart.line1 }}>blue</strong> = typical.
          </p>
          <p style={{ margin: "0 0 5px", color: thm.textMuted }}>
            <strong style={{ color: thm.textPrimary }}>Hover</strong> for 90-day trend line. Use this pane for quick "should I leave now?" decisions.
          </p>
        </div>
      )}
    </div>
  );
}

/* ── Types ─────────────────────────────────────────────────────── */
// RouteCardData is defined in Dashboard.tsx and passed as props
// Fields: label, origin, destination, liveSpeed, liveTimestamp, typical, 
// cityMin, cityMax, status, statusText, sparkPoints, sparkDates, sortKey
type LiveStatus = 'much-faster' | 'faster' | 'as-expected' | 'slower' | 'much-slower' | 'no-data';

interface RouteTODStats {
  min: number;
  max: number;
  mean: number;
  median: number;
  std: number;
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
  sparkPoints: number[];
  sparkDates: Date[];
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

/* ── Traffic NOW! bar - city-wide range with route position ────── */
function TrafficNowBar({ 
  liveSpeed,
  typical,
  cityMin,
  cityMax,
  status,
  thm,
}: { 
  liveSpeed: number | null;
  typical: RouteTODStats | null;
  cityMin: number;
  cityMax: number;
  status: LiveStatus;
  thm: AppTheme;
}) {
  const hasData = liveSpeed !== null && typical !== null && cityMax > cityMin;
  
  // Determine status direction for colors
  const isFaster = status === 'much-faster' || status === 'faster';
  const isSlower = status === 'much-slower' || status === 'slower';
  const isExpected = status === 'as-expected';
  
  // Get status color
  const getStatusColor = () => {
    if (thm.key === 'gray') {
      if (isFaster) return '#E2E2E2';
      if (isSlower) return '#4A4A4A';
      return '#888888';
    }
    if (thm.key === 'pastel') {
      if (isFaster) return '#8CCB7A';
      if (isSlower) return '#F2A65A';
      return '#6FA8DC';
    }
    if (isFaster) return '#4CD964';
    if (isSlower) return '#FF3B30';
    return '#4DA3FF';
  };
  
  const statusColor = getStatusColor();
  const rangeColor = thm.key === 'gray' ? '#CCCCCC' : 'rgba(0,0,0,0.2)';
  const typicalColor = thm.key === 'gray' ? '#999999' : 'rgba(0,0,0,0.15)';
  
  // Calculate positions on the city-wide scale
  const cityRange = cityMax - cityMin || 1;
  const livePos = hasData ? ((liveSpeed! - cityMin) / cityRange) * 100 : 50;
  const typicalMinPos = hasData ? ((typical!.min - cityMin) / cityRange) * 100 : 30;
  const typicalMaxPos = hasData ? ((typical!.max - cityMin) / cityRange) * 100 : 70;
  const typicalMeanPos = hasData ? ((typical!.mean - cityMin) / cityRange) * 100 : 50;
  
  // Format speed
  const fmt = (n: number | null) => n === null ? '--' : (n % 1 === 0 ? n.toString() : n.toFixed(1));
  
  return (
    <div style={{ width: '100%' }}>
      {/* Box-and-whisker style bar */}
      <div style={{ 
        position: 'relative',
        height: 14,
        marginBottom: 2,
      }}>
        {/* City-wide range track */}
        <div style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 6,
          height: 2,
          background: rangeColor,
          borderRadius: 1,
        }} />
        
        {/* City min marker (left cap) */}
        <div style={{
          position: 'absolute',
          left: 0,
          top: 4,
          width: 3,
          height: 6,
          background: rangeColor,
          borderRadius: '1px 0 0 1px',
        }} />
        
        {/* City max marker (right cap) */}
        <div style={{
          position: 'absolute',
          right: 0,
          top: 4,
          width: 3,
          height: 6,
          background: rangeColor,
          borderRadius: '0 1px 1px 0',
        }} />
        
        {/* Typical range bar (the "box") */}
        {hasData && (
          <div style={{
            position: 'absolute',
            left: `${typicalMinPos}%`,
            right: `${100 - typicalMaxPos}%`,
            top: 5,
            height: 4,
            background: typicalColor,
            borderRadius: 2,
          }} />
        )}
        
        {/* Typical mean marker (small tick in the box) */}
        {hasData && (
          <div style={{
            position: 'absolute',
            left: `${typicalMeanPos}%`,
            top: 4,
            width: 2,
            height: 6,
            background: thm.textMuted,
            transform: 'translateX(-50%)',
            opacity: 0.5,
          }} />
        )}
        
        {/* Live speed marker (prominent circle) */}
        {hasData && (
          <div style={{
            position: 'absolute',
            left: `${livePos}%`,
            top: 1,
            width: 12,
            height: 12,
            background: statusColor,
            borderRadius: '50%',
            transform: 'translateX(-50%)',
            boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
            zIndex: 3,
            border: `2px solid ${thm.sectionBg}`,
          }} />
        )}
      </div>
      
      {/* Speed labels */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: 9,
        color: thm.textMuted,
        lineHeight: 1,
      }}>
        <span>{fmt(cityMin)}</span>
        <span style={{ 
          color: statusColor, 
          fontWeight: (isFaster || isSlower) ? 600 : 400,
        }}>
          {fmt(liveSpeed)} km/h
        </span>
        <span>{fmt(cityMax)}</span>
      </div>
    </div>
  );
}

/** Compute 7-day rolling average for smoothing */
function computeRollingAverage(points: number[], windowSize: number = 7): number[] {
  if (points.length < windowSize) return points;
  
  const result: number[] = [];
  for (let i = 0; i < points.length; i++) {
    const start = Math.max(0, i - windowSize + 1);
    const window = points.slice(start, i + 1);
    const avg = window.reduce((sum, v) => sum + v, 0) / window.length;
    result.push(avg);
  }
  return result;
}

/* ── Mini line chart for hover state ──────────────────────────── */
function MiniLineChart({ 
  points, 
  thm,
  startLabel,
  endLabel,
  status,
}: { 
  points: number[]; 
  thm: AppTheme;
  startLabel: string;
  endLabel: string;
  status: LiveStatus;
}) {
  if (points.length < 2) return null;
  
  const W = 200;  // Wider viewBox for smoother curves when stretched
  const H = 40;
  const PAD = 4;  // Vertical padding only
  
  // Compute smoothed 7-day rolling average
  const smoothedPoints = computeRollingAverage(points, 7);
  
  // Use combined range for consistent scaling
  const allValues = [...points, ...smoothedPoints];
  const minV = Math.min(...allValues);
  const maxV = Math.max(...allValues);
  const range = maxV - minV || 1;
  
  // Full-width X: no horizontal padding, spans entire viewBox
  const toX = (i: number, len: number) => (i / (len - 1)) * W;
  // Y with vertical padding only
  const toY = (v: number) => PAD + (H - PAD * 2) * (1 - (v - minV) / range);
  
  // Raw line path (faint)
  const rawD = points.map((v, i) => `${i === 0 ? 'M' : 'L'} ${toX(i, points.length).toFixed(1)} ${toY(v).toFixed(1)}`).join(' ');
  
  // Smoothed line path (prominent)
  const smoothD = smoothedPoints.map((v, i) => `${i === 0 ? 'M' : 'L'} ${toX(i, smoothedPoints.length).toFixed(1)} ${toY(v).toFixed(1)}`).join(' ');
  
  // Color for smoothed line based on status
  const getTrendColor = () => {
    if (status === 'much-faster' || status === 'faster') return thm.speedGood;
    if (status === 'much-slower' || status === 'slower') return thm.speedBad;
    return thm.chart.line1;
  };
  
  return (
    <div style={{ width: '100%', marginTop: 4 }}>
      <svg width="calc(100% + 24px)" height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', marginLeft: -12, marginRight: -12 }}>
        {/* Raw line - faint background texture */}
        <path 
          d={rawD} 
          fill="none" 
          stroke={thm.textMuted}
          strokeWidth={1}
          strokeOpacity={0.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Smoothed line - primary signal */}
        <path 
          d={smoothD} 
          fill="none" 
          stroke={getTrendColor()}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: 8,
        color: thm.textMuted,
        marginTop: 2,
      }}>
        <span>{startLabel}</span>
        <span>{endLabel}</span>
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
    }, 500);
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
    cardBg = thm.key === "colour" ? "rgba(125,183,232,0.18)"
             : thm.key === "pastel" ? "rgba(58,134,200,0.15)"
             : "rgba(0,0,0,0.08)";
  } else if (hovered) {
    cardBg = thm.key === "colour" ? "rgba(125,183,232,0.08)"
             : thm.key === "pastel" ? "rgba(58,134,200,0.07)"
             : "rgba(0,0,0,0.04)";
  }

  const endpoints = card.destination
    ? `${card.origin} → ${card.destination}`
    : card.origin;
  
  // Compute date labels for mini chart
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
  const today = new Date();
  const startLabel = sixtyDaysAgo.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
  const endLabel = today.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
  
  // Status text color - per theme specs
  const getStatusColor = () => {
    if (thm.key === 'gray') {
      // Scale me gray!: use weight/contrast instead of hue
      return thm.textPrimary;
    }
    
    // For pastel and colour: use semantic colors sparingly
    switch (card.status) {
      case 'much-faster':
      case 'faster': return thm.speedGood;
      case 'much-slower':
      case 'slower': return thm.speedBad;
      default: return thm.textMuted;
    }
  };

  return (
    <div
      onClick={() => onSelect(card.label)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        background: cardBg,
        borderRadius: 6,
        padding: "7px 8px",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: 4,
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
      
      {/* Row 3: Traffic NOW! bar - city-wide range with route position */}
      <TrafficNowBar 
        liveSpeed={card.liveSpeed}
        typical={card.typical}
        cityMin={card.cityMin}
        cityMax={card.cityMax}
        status={card.status}
        thm={thm}
      />
      
      {/* Row 4: Additive mini line chart on hover - with gentle smooth transition */}
      {card.sparkPoints.length > 1 && (
        <div style={{
          maxHeight: hovered ? 60 : 0,
          opacity: hovered ? 1 : 0,
          overflow: 'hidden',
          marginTop: hovered ? 2 : 0,
          transition: 'max-height 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease, margin-top 0.3s ease',
        }}>
          <MiniLineChart 
            points={card.sparkPoints}
            thm={thm}
            startLabel={startLabel}
            endLabel={endLabel}
            status={card.status}
          />
        </div>
      )}
      
      {/* Separator */}
      {!isLast && (
        <div style={{
          height: 1, width: "80%", margin: "2px auto 0",
          background: thm.key === "colour" ? "rgba(71,65,60,0.08)" : "rgba(0,0,0,0.06)",
        }} />
      )}
    </div>
  );
}

/* ── Desktop pane with draggable left edge ─────────────────────── */
function DesktopPane({ cards, selectedRoute, onRouteSelect, thm, isOpen, onToggle, paneWidth }: PaneProps) {
  const RAIL_WIDTH = 36;
  const MIN_WIDTH = 140;
  const MAX_WIDTH = 500;
  const [dragging, setDragging] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

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
      overflow: "visible",
      display: "flex",
      background: thm.sectionBg,
      borderLeft: `1px solid ${thm.key === "colour" ? "#47413C" : "#DCCFB8"}`,
      position: "relative",
    }}>
      {/* Draggable resize handle — left edge */}
      {isOpen && (
        <div
          onMouseDown={onDragStart}
          style={{
            position: "absolute", left: 0, top: 0, bottom: 0,
            width: 8, cursor: "col-resize", zIndex: 3,
            background: dragging
              ? (thm.key === "colour" ? "rgba(125,183,232,0.25)" : "rgba(58,134,200,0.18)")
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
          borderBottom: `1px solid ${thm.key === "colour" ? "#47413C" : "#DCCFB8"}`,
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{
                fontFamily: "var(--app-font-display)", fontWeight: 700, fontSize: 13, color: thm.textPrimary,
              }}>
                � Traffic NOW!
              </span>
              {/* Info tooltip — click to toggle animated callout */}
              <InfoTip thm={thm} />
            </div>
            <button onClick={onToggle} title="Close"
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14,
                color: thm.textMuted, padding: 2, borderRadius: 4, lineHeight: 1 }}>
              ✕
            </button>
          </div>
          <p style={{ fontSize: 10, color: thm.textMuted, margin: "2px 0 0" }}>
            Live vs typical for this hour
          </p>
        </div>

        {/* Scrollable list */}
        <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
          <BlurEdge position="top" />
          <BlurEdge position="bottom" />
          <div style={{
            height: "100%", overflowY: "auto", padding: "8px 6px",
            display: "flex", flexDirection: "column", gap: 6, scrollbarWidth: "thin",
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
        title={isOpen ? "Close route browser" : "Browse all routes"}
        style={{
          position: "absolute", right: 0, top: 0, bottom: 0,
          width: RAIL_WIDTH,
          display: "flex", flexDirection: "column", alignItems: "center",
          paddingTop: 14, cursor: "pointer",
          background: thm.key === "colour" ? "#1F1C19" : thm.key === "pastel" ? "#F3EDE0" : "#f5f5f5",
          borderLeft: `1px solid ${thm.key === "colour" ? "#47413C" : "#DCCFB8"}`,
          transition: "background 0.2s", zIndex: 2,
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLElement).style.background =
            thm.key === "colour" ? "#2A2725" : thm.key === "pastel" ? "#EDE5D5" : "#eeeeee";
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLElement).style.background =
            thm.key === "colour" ? "#1F1C19" : thm.key === "pastel" ? "#F3EDE0" : "#f5f5f5";
        }}
      >
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: "0.12em",
          textTransform: "uppercase", color: thm.textMuted, whiteSpace: "nowrap",
          writingMode: "vertical-rl", textOrientation: "mixed", transform: "rotate(180deg)",
        }}>
          ROUTES
        </span>
        <div style={{
          marginTop: 8, fontSize: 11, color: thm.textMuted,
          transform: isOpen ? "rotate(90deg)" : "rotate(-90deg)",
          transition: "transform 0.3s cubic-bezier(0.4,0,0.2,1)",
        }}>▸</div>
      </div>
    </div>
  );
}

/* ── Mobile bottom sheet ───────────────────────────────────────── */
function MobileSheet({ cards, selectedRoute, onRouteSelect, thm, isOpen, onToggle }: PaneProps) {
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
        borderTop: `1px solid ${thm.key === "colour" ? "#47413C" : "#DCCFB8"}`,
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
        </div>
        <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
          <BlurEdge position="top" />
          <BlurEdge position="bottom" />
          <div style={{
            height: "100%", overflowY: "auto", padding: "6px 10px 12px",
            display: "flex", flexDirection: "column", gap: 6, scrollbarWidth: "thin",
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
          border: `1px solid ${thm.key === "colour" ? "#47413C" : "#DCCFB8"}`,
          background: thm.key === "colour" ? "#262321" : "#FFF9F0",
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
  mobile: boolean;
}

export default function RouteBrowserPane(props: Props) {
  const { theme: thm } = useTheme();
  const [isOpen, setIsOpen] = useState(true);
  const [paneWidth, setPaneWidth] = useState(200);

  useEffect(() => {
    const handler = (e: Event) => {
      const w = (e as CustomEvent).detail;
      if (typeof w === "number" && w >= 140 && w <= 500) setPaneWidth(w);
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
  };

  return props.mobile ? <MobileSheet {...paneProps} /> : <DesktopPane {...paneProps} />;
}
