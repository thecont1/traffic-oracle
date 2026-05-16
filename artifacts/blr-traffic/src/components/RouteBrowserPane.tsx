import { useState, useRef, useCallback, useEffect } from "react";
import { useTheme } from "@/lib/ThemeContext";
import type { AppTheme } from "@/lib/theme";

/* ── Info tip ────────────────────────────────────────────────── */
function InfoTip({ thm }: { thm: AppTheme }) {
  const tipRef = useRef<HTMLDivElement>(null);
  const tooltipText = "See if traffic is normal right now. The colored dot shows current speed; the gray bar shows what's typical for this hour (based on 90 days of data). Dot left of the bar = slower than usual, right = faster, centered = as expected. Tap any route to explore it on the main charts.";
  
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
        background: thm.key === "gray" ? "#f0f0f0" : "#262321",
        border: thm.key === "gray" ? "1px solid #d0d0d0" : "none",
        borderRadius: 10, padding: "9px 12px",
        boxShadow: "0 6px 28px rgba(0,0,0,0.45)",
        zIndex: 2000, maxWidth: 240,
        fontSize: 12, lineHeight: 1.5, 
        color: thm.key === "gray" ? "#333333" : "#F3EBDD",
      }}>
        {tooltipText}
      </div>
    </>
  );
}

/* ── Types ─────────────────────────────────────────────────────── */
// RouteCardData is defined in Dashboard.tsx and passed as props
// cityMin, cityMax, status, statusText, sortKey
type LiveStatus = 'much-faster' | 'faster' | 'as-expected' | 'slower' | 'much-slower' | 'no-data';

interface RouteTODStats {
  p10: number;
  p15: number;
  p50: number;
  p85: number;
  p90: number;
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
  const rangeColor = thm.key === 'gray' ? '#CCCCCC' : thm.key === 'pastel' ? 'rgba(80,70,60,0.35)' : 'rgba(60,55,50,0.4)';
  const typicalColor = thm.key === 'gray' ? '#888888' : thm.key === 'pastel' ? 'rgba(80,70,60,0.5)' : 'rgba(60,55,50,0.55)';
  
  // Calculate positions on the city-wide scale using percentiles
  const cityRange = cityMax - cityMin || 1;
  const livePos = hasData ? ((liveSpeed! - cityMin) / cityRange) * 100 : 50;
  // Use p15-p85 as the "typical" range (70% of observations, excludes outliers)
  const typicalMinPos = hasData ? ((typical!.p15 - cityMin) / cityRange) * 100 : 30;
  const typicalMaxPos = hasData ? ((typical!.p85 - cityMin) / cityRange) * 100 : 70;
  const typicalMedianPos = hasData ? ((typical!.p50 - cityMin) / cityRange) * 100 : 50;
  
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
          height: 1,
          background: '#000000',
          borderRadius: 0,
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
        
        {/* Typical median marker (small tick in the box) */}
        {hasData && (
          <div style={{
            position: 'absolute',
            left: `${typicalMedianPos}%`,
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
      
      {/* Live speed display */}
      <div style={{
        textAlign: 'center',
        fontSize: 10,
        color: statusColor,
        fontWeight: (isFaster || isSlower) ? 600 : 400,
        lineHeight: 1,
      }}>
        {fmt(liveSpeed)} km/h
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
      
      {/* Row 3: Traffic NOW! bar - city-wide range with route position */}
      <TrafficNowBar 
        liveSpeed={card.liveSpeed}
        typical={card.typical}
        cityMin={card.cityMin}
        cityMax={card.cityMax}
        status={card.status}
        thm={thm}
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
function DesktopPane({ cards, selectedRoute, onRouteSelect, thm, isOpen, onToggle, paneWidth, dataTimestamp }: PaneProps) {
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
            width: 1, cursor: "col-resize", zIndex: 3,
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
            <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
              <span style={{
                fontFamily: "var(--app-font-display)", fontWeight: 700, fontSize: 13, color: thm.textPrimary,
              }}>
                Traffic NOW!
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
          {dataTimestamp && (
            <p style={{ fontSize: 11, color: thm.textMuted, margin: "4px 0 0", opacity: 0.8 }}>
              {dataTimestamp.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })} {dataTimestamp.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
            </p>
          )}
        </div>

        {/* Scrollable list */}
        <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
          <BlurEdge position="top" />
          <BlurEdge position="bottom" />
          <div style={{
            height: "100%", overflowY: "auto", padding: "8px 8px 8px 0",
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
          TRAFFIC NOW!
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
function MobileSheet({ cards, selectedRoute, onRouteSelect, thm, isOpen, onToggle, dataTimestamp }: PaneProps) {
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
          {dataTimestamp && (
            <p style={{ fontSize: 9, color: thm.textMuted, margin: "2px 0 0" }}>
              {dataTimestamp.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })} {dataTimestamp.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
            </p>
          )}
        </div>
        <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
          <BlurEdge position="top" />
          <BlurEdge position="bottom" />
          <div style={{
            height: "100%", overflowY: "auto", padding: "6px 8px 12px 0",
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
  dataTimestamp: Date | null;
  mobile?: boolean;
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
    dataTimestamp: props.dataTimestamp,
  };

  return props.mobile ? <MobileSheet {...paneProps} /> : <DesktopPane {...paneProps} />;
}
