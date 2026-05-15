import { useState, useRef, useCallback, useEffect } from "react";
import { useTheme } from "@/lib/ThemeContext";
import type { AppTheme } from "@/lib/theme";

/* ── Types ─────────────────────────────────────────────────────── */
interface RouteCardData {
  label: string;
  sparkPoints: number[];
  delta: number | null;
  isBaseline: boolean;
  isTop3Worst: boolean;
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

/* ── Sparkline — responsive via ResizeObserver ─────────────────── */
function MiniSparkline({ points, color, isSelected, thm }: {
  points: number[]; color: string; isSelected: boolean; thm: AppTheme;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(160);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(entries => {
      const bw = entries[0]?.contentRect.width;
      if (bw && bw > 0) setW(Math.round(bw));
    });
    obs.observe(el);
    setW(el.getBoundingClientRect().width || 160);
    return () => obs.disconnect();
  }, []);

  if (points.length < 2) return <div ref={containerRef} style={{ height: 24, flex: 1 }} />;

  const H = 24, PY = 2;
  const minV = Math.min(...points), maxV = Math.max(...points);
  const range = maxV - minV || 1;
  const toX = (i: number) => (i / (points.length - 1)) * w;
  const toY = (v: number) => PY + (H - PY * 2) * (1 - (v - minV) / range);
  const pts = points.map((v, i) => `${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(" ");

  const strokeWidth = isSelected ? 3 : 1.5;
  const strokeColor = isSelected ? color : (thm.key === "colour" ? "rgba(140,126,107,0.5)" : "rgba(0,0,0,0.25)");

  return (
    <div ref={containerRef} style={{ flex: 1, minWidth: 30, height: H }}>
      <svg width={w} height={H} style={{ display: "block", overflow: "visible" }}>
        <polyline points={pts} fill="none" stroke={strokeColor} strokeWidth={strokeWidth}
          strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    </div>
  );
}

/* ── Progressive blur edge ─────────────────────────────────────── */
function BlurEdge({ position }: { position: "top" | "bottom" }) {
  const isTop = position === "top";
  return (
    <div aria-hidden="true" style={{
      position: "absolute", left: 0, right: 0,
      top: isTop ? 0 : undefined, bottom: isTop ? undefined : 0,
      height: 24, pointerEvents: "none", zIndex: 5,
      backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)",
      maskImage: `linear-gradient(to ${isTop ? "bottom" : "top"}, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 100%)`,
      WebkitMaskImage: `linear-gradient(to ${isTop ? "bottom" : "top"}, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 100%)`,
    }} />
  );
}

/* ── Route card ────────────────────────────────────────────────── */
function RouteCard({
  card, thm, isSelected, onSelect, isLast,
}: {
  card: RouteCardData; thm: AppTheme; isSelected: boolean;
  onSelect: (label: string) => void; isLast: boolean;
}) {
  const THRESHOLD = 0.5;
  const dir = card.delta !== null && !card.isBaseline
    ? card.delta > THRESHOLD ? "up" : card.delta < -THRESHOLD ? "down" : "flat"
    : "flat";
  const sparkColor = card.isBaseline
    ? (thm.key === "colour" ? "#7DB7E8" : "#8A8176")
    : dir === "up" ? thm.speedGood : dir === "down" ? thm.speedBad : thm.textMuted;

  let cardBg = "transparent";
  if (isSelected) {
    cardBg = thm.key === "colour" ? "rgba(125,183,232,0.14)"
             : thm.key === "pastel" ? "rgba(58,134,200,0.12)"
             : "rgba(0,0,0,0.06)";
  } else if (card.isTop3Worst) {
    cardBg = thm.key === "colour" ? "rgba(240,138,93,0.06)"
           : thm.key === "pastel" ? "rgba(224,106,62,0.06)"
           : "rgba(0,0,0,0.03)";
  }

  const selectedBar = isSelected ? thm.chart.line1 : "transparent";

  return (
    <div
      onClick={() => onSelect(card.label)}
      title={card.isBaseline
        ? "The fastest road in Bangalore — sets the upper bound for what's achievable without breaking traffic laws."
        : undefined}
      style={{
        background: cardBg,
        borderRadius: 6,
        padding: "7px 8px",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: 3,
        transition: "background 0.15s",
        position: "relative",
        borderLeft: `3px solid ${selectedBar}`,
      }}
    >
      {/* Row 1: title + delta */}
      <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
        <p style={{
          fontSize: 12, fontWeight: 700,
          color: isSelected ? thm.chart.line1 : thm.textPrimary,
          lineHeight: 1.3, margin: 0,
          transition: "color 0.15s",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          flex: 1, minWidth: 0,
        }}>
          {card.label}
        </p>
        {card.isBaseline ? (
          <span style={{ fontSize: 9, fontWeight: 700, color: "#F59E0B", whiteSpace: "nowrap", flexShrink: 0 }}>
            ⚡ benchmark
          </span>
        ) : card.delta === null ? (
          <span style={{ fontSize: 10, color: thm.textMuted, flexShrink: 0 }}>—</span>
        ) : Math.abs(card.delta) < THRESHOLD ? (
          <span style={{ fontSize: 10, color: thm.textMuted, flexShrink: 0 }}>steady</span>
        ) : (
          <span style={{ fontSize: 11, fontWeight: 700,
            color: card.delta > 0 ? thm.speedGood : thm.speedBad,
            whiteSpace: "nowrap", flexShrink: 0 }}>
            {card.delta > 0 ? "▲" : "▼"} {Math.abs(card.delta).toFixed(1)}
          </span>
        )}
      </div>
      {/* Row 2: sparkline */}
      <MiniSparkline points={card.sparkPoints} color={sparkColor} isSelected={isSelected} thm={thm} />
      {/* Separator */}
      {!isLast && (
        <div style={{
          height: 1, width: "80%", margin: "3px auto 0",
          background: thm.key === "colour" ? "rgba(71,65,60,0.10)" : "rgba(0,0,0,0.07)",
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
    setDragging(true);
    startXRef.current = e.clientX;
    startWidthRef.current = paneWidth;
  }, [paneWidth]);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const dx = startXRef.current - e.clientX;
      const newW = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidthRef.current + dx));
      // We can't call a prop setter here since paneWidth is controlled by parent
      // Instead we dispatch a custom event that the parent listens for
      window.dispatchEvent(new CustomEvent('route-pane-resize', { detail: newW }));
    };
    const onUp = () => setDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [dragging]);

  return (
    <div style={{
      flexShrink: 0,
      width: isOpen ? paneWidth + RAIL_WIDTH : RAIL_WIDTH,
      transition: dragging ? "none" : "width 0.3s cubic-bezier(0.4,0,0.2,1)",
      overflow: "hidden",
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
            width: 6, cursor: "col-resize", zIndex: 3,
            background: dragging
              ? (thm.key === "colour" ? "rgba(125,183,232,0.3)" : "rgba(58,134,200,0.2)")
              : "transparent",
            transition: "background 0.15s",
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
        marginLeft: isOpen ? 6 : 0,
      }}>
        {/* Header */}
        <div style={{
          padding: "12px 14px 8px",
          borderBottom: `1px solid ${thm.key === "colour" ? "#47413C" : "#DCCFB8"}`,
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{
              fontFamily: "var(--app-font-display)", fontWeight: 700, fontSize: 14, color: thm.textPrimary,
            }}>
              🗺️ Speed Snapshot
            </span>
            <button onClick={onToggle} title="Close"
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15,
                color: thm.textMuted, padding: 3, borderRadius: 4, lineHeight: 1 }}>
              ✕
            </button>
          </div>
          <p style={{ fontSize: 10, color: thm.textMuted, margin: "3px 0 0" }}>
            Tap a route to explore it
          </p>
        </div>

        {/* Scrollable list */}
        <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
          <BlurEdge position="top" />
          <BlurEdge position="bottom" />
          <div style={{
            height: "100%", overflowY: "auto", padding: "10px 8px",
            display: "flex", flexDirection: "column", gap: 8, scrollbarWidth: "thin",
          }}>
            {!cards ? (
              <p style={{ color: thm.textMuted, fontSize: 12, padding: "1rem 0", textAlign: "center" }}>
                Computing route summaries…
              </p>
            ) : cards.length === 0 ? (
              <p style={{ color: thm.textMuted, fontSize: 12, padding: "1rem 0", textAlign: "center" }}>
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
          paddingTop: 16, cursor: "pointer",
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
            }}>Speed Snapshot by Route</span>
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
              <p style={{ color: thm.textMuted, fontSize: 12, padding: "1rem 0", textAlign: "center" }}>
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
