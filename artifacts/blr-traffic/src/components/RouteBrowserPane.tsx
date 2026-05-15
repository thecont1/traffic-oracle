import { useState, useRef, useCallback } from "react";
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
}

/* ── Sparkline ─────────────────────────────────────────────────── */
function MiniSparkline({ points, color }: { points: number[]; color: string }) {
  if (points.length < 2) return <div style={{ width: 60, height: 28, flexShrink: 0 }} />;
  const W = 60, H = 28, PY = 3;
  const minV  = Math.min(...points), maxV = Math.max(...points);
  const range = maxV - minV || 1;
  const toX = (i: number) => (i / (points.length - 1)) * W;
  const toY = (v: number) => PY + (H - PY * 2) * (1 - (v - minV) / range);
  const pts  = points.map((v, i) => `${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(" ");
  return (
    <svg width={W} height={H} style={{ display: "block", overflow: "visible", flexShrink: 0 }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={2.5}
        strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/* ── Progressive blur edge ─────────────────────────────────────── */
function BlurEdge({ position }: { position: "top" | "bottom" }) {
  const isTop = position === "top";
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: isTop ? 0 : undefined,
        bottom: isTop ? undefined : 0,
        height: 28,
        pointerEvents: "none",
        zIndex: 5,
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        maskImage: `linear-gradient(to ${isTop ? "bottom" : "top"}, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 100%)`,
        WebkitMaskImage: `linear-gradient(to ${isTop ? "bottom" : "top"}, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 100%)`,
      }}
    />
  );
}

/* ── Route card ────────────────────────────────────────────────── */
function RouteCard({
  card, thm, isSelected, onSelect,
}: {
  card: RouteCardData;
  thm: AppTheme;
  isSelected: boolean;
  onSelect: (label: string) => void;
}) {
  const THRESHOLD = 0.5;
  const dir = card.delta !== null && !card.isBaseline
    ? card.delta >  THRESHOLD ? "up"
    : card.delta < -THRESHOLD ? "down"
    : "flat"
    : "flat";
  const sparkColor = card.isBaseline
    ? (thm.key === "colour" ? "#7DB7E8" : "#8A8176")
    : dir === "up"   ? thm.speedGood
    : dir === "down" ? thm.speedBad
    : thm.textMuted;

  let cardBg: string = thm.cardBg;
  if (card.isTop3Worst) {
    cardBg = thm.key === "colour" ? "rgba(240,138,93,0.08)"
           : thm.key === "gray"   ? "rgba(0,0,0,0.04)"
           : "rgba(224,106,62,0.07)";
  }

  const cardBorder = card.isBaseline
    ? "1.5px solid #F59E0B"
    : isSelected
    ? `2px solid ${thm.chart.line1}`
    : thm.cardBorder as string;

  const selectedShadow = isSelected
    ? (thm.key === "colour"
        ? `0 0 0 1px ${thm.chart.line1}, 0 4px 16px rgba(125,183,232,0.15)`
        : `0 0 0 1px ${thm.chart.line1}, 0 4px 16px rgba(58,134,200,0.12)`)
    : thm.cardShadow as string;

  return (
    <div
      onClick={() => onSelect(card.label)}
      title={card.isBaseline
        ? "The fastest road in Bangalore — sets the upper bound for what's achievable without breaking traffic laws."
        : undefined}
      style={{
        background: cardBg,
        border: cardBorder,
        boxShadow: selectedShadow,
        borderRadius: 14,
        padding: "11px 13px",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: 7,
        transition: "transform 0.12s, box-shadow 0.15s, border-color 0.15s",
        position: "relative",
      }}
      onMouseEnter={e => {
        const el = e.currentTarget;
        el.style.transform = "translateY(-2px)";
        if (!isSelected) el.style.boxShadow = "0 6px 20px rgba(0,0,0,0.14)";
      }}
      onMouseLeave={e => {
        const el = e.currentTarget;
        el.style.transform = "";
        el.style.boxShadow = selectedShadow;
      }}
    >
      {isSelected && (
        <div style={{
          position: "absolute",
          top: 10,
          right: 10,
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: thm.chart.line1,
          boxShadow: `0 0 6px ${thm.chart.line1}`,
        }} />
      )}
      <p style={{
        fontSize: 13,
        fontWeight: 700,
        color: isSelected ? thm.chart.line1 : thm.textPrimary,
        lineHeight: 1.3,
        margin: 0,
        paddingRight: isSelected ? 14 : 0,
        transition: "color 0.15s",
      }}>
        {card.label}
      </p>
      <div style={{ display: "flex", alignItems: "center",
        justifyContent: "space-between", gap: 8 }}>
        <MiniSparkline points={card.sparkPoints} color={sparkColor} />
        {card.isBaseline ? (
          <span style={{ fontSize: 11, fontWeight: 700,
            color: "#F59E0B", whiteSpace: "nowrap" }}>
            ⚡ Speed benchmark
          </span>
        ) : card.delta === null ? (
          <span style={{ fontSize: 11, color: thm.textMuted }}>— no data</span>
        ) : Math.abs(card.delta) < THRESHOLD ? (
          <span style={{ fontSize: 11, color: thm.textMuted }}>— steady</span>
        ) : (
          <span style={{ fontSize: 12, fontWeight: 700,
            color: card.delta > 0 ? thm.speedGood : thm.speedBad,
            whiteSpace: "nowrap" }}>
            {card.delta > 0 ? "▲" : "▼"} {Math.abs(card.delta).toFixed(1)} km/h
          </span>
        )}
      </div>
    </div>
  );
}

/* ── Desktop slide-over pane ──────────────────────────────────── */
function DesktopPane({ cards, selectedRoute, onRouteSelect, thm, isOpen, onToggle }: PaneProps) {
  const PANE_WIDTH = 340;
  const RAIL_WIDTH = 40;
  const HEADER_HEIGHT = 52; // approximate header height

  return (
    <div style={{
      position: "fixed",
      top: HEADER_HEIGHT,
      right: 0,
      bottom: 0,
      zIndex: 400,
      display: "flex",
      width: isOpen ? PANE_WIDTH + RAIL_WIDTH : RAIL_WIDTH,
      transition: "width 0.3s cubic-bezier(0.4,0,0.2,1)",
      overflow: "hidden",
      boxShadow: isOpen ? "-4px 0 24px rgba(0,0,0,0.08)" : "none",
    }}>
      {/* Slim rail / handle — always visible */}
      <div
        onClick={onToggle}
        title={isOpen ? "Close route browser" : "Browse all routes"}
        style={{
          width: RAIL_WIDTH,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          paddingTop: 18,
          cursor: "pointer",
          background: thm.key === "colour" ? "#1F1C19" : thm.key === "pastel" ? "#F3EDE0" : "#f5f5f5",
          borderLeft: `1px solid ${thm.key === "colour" ? "#47413C" : "#DCCFB8"}`,
          transition: "background 0.2s",
          position: "relative",
          zIndex: 2,
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
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 6,
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          transform: "rotate(180deg)",
        }}>
          <span style={{ fontSize: 16, lineHeight: 1 }}>🗺️</span>
          <span style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: thm.textMuted,
            whiteSpace: "nowrap",
          }}>
            Routes
          </span>
        </div>
        <div style={{
          marginTop: 12,
          fontSize: 12,
          color: thm.textMuted,
          transform: isOpen ? "rotate(90deg)" : "rotate(-90deg)",
          transition: "transform 0.3s cubic-bezier(0.4,0,0.2,1)",
        }}>▸</div>
      </div>

      {/* Scrollable pane content */}
      <div style={{
        width: PANE_WIDTH,
        flexShrink: 0,
        background: thm.sectionBg,
        borderLeft: `1px solid ${thm.key === "colour" ? "#47413C" : "#DCCFB8"}`,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        opacity: isOpen ? 1 : 0,
        transition: "opacity 0.2s ease",
      }}>
        {/* Header */}
        <div style={{
          padding: "14px 16px 10px",
          borderBottom: `1px solid ${thm.key === "colour" ? "#47413C" : "#DCCFB8"}`,
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{
              fontFamily: "var(--app-font-display)",
              fontWeight: 700,
              fontSize: 15,
              color: thm.textPrimary,
            }}>
              🗺️ Speed Snapshot
            </span>
            <button
              onClick={onToggle}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: 16,
                color: thm.textMuted,
                padding: 4,
                borderRadius: 6,
                lineHeight: 1,
              }}
              title="Close"
            >
              ✕
            </button>
          </div>
          <p style={{
            fontSize: 11,
            color: thm.textMuted,
            margin: "4px 0 0",
          }}>
            Tap a route to explore it
          </p>
        </div>

        {/* Scrollable list with blur edges */}
        <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
          <BlurEdge position="top" />
          <BlurEdge position="bottom" />
          <div style={{
            height: "100%",
            overflowY: "auto",
            padding: "14px 12px",
            display: "flex",
            flexDirection: "column",
            gap: 10,
            scrollbarWidth: "thin",
          }}>
            {!cards ? (
              <p style={{ color: thm.textMuted, fontSize: 13, padding: "1rem 0", textAlign: "center" }}>
                Computing route summaries…
              </p>
            ) : cards.length === 0 ? (
              <p style={{ color: thm.textMuted, fontSize: 13, padding: "1rem 0", textAlign: "center" }}>
                No routes found
              </p>
            ) : (
              cards.map(card => (
                <RouteCard
                  key={card.label}
                  card={card}
                  thm={thm}
                  isSelected={card.label === selectedRoute}
                  onSelect={onRouteSelect}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Mobile bottom sheet ───────────────────────────────────────── */
function MobileSheet({ cards, selectedRoute, onRouteSelect, thm, isOpen, onToggle }: PaneProps) {
  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          onClick={onToggle}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            zIndex: 998,
            backdropFilter: "blur(2px)",
            WebkitBackdropFilter: "blur(2px)",
            animation: "fade-in 0.2s ease",
          }}
        />
      )}

      {/* Sheet */}
      <div style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        height: isOpen ? 320 : 0,
        zIndex: 999,
        background: thm.sectionBg,
        borderTop: `1px solid ${thm.key === "colour" ? "#47413C" : "#DCCFB8"}`,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        boxShadow: "0 -4px 24px rgba(0,0,0,0.12)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        transition: "height 0.3s cubic-bezier(0.4,0,0.2,1)",
      }}>
        {/* Drag handle */}
        <div
          onClick={onToggle}
          style={{
            flexShrink: 0,
            padding: "10px 0 6px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 4,
            cursor: "pointer",
          }}
        >
          <div style={{
            width: 36,
            height: 4,
            borderRadius: 2,
            background: thm.textMuted,
            opacity: 0.3,
          }} />
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 14 }}>🗺️</span>
            <span style={{
              fontFamily: "var(--app-font-display)",
              fontWeight: 700,
              fontSize: 14,
              color: thm.textPrimary,
            }}>
              Speed Snapshot by Route
            </span>
          </div>
          <p style={{ fontSize: 11, color: thm.textMuted, margin: 0 }}>
            Tap a route to explore it
          </p>
        </div>

        {/* Scrollable list */}
        <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
          <BlurEdge position="top" />
          <BlurEdge position="bottom" />
          <div style={{
            height: "100%",
            overflowY: "auto",
            padding: "8px 12px 16px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
            scrollbarWidth: "thin",
          }}>
            {!cards ? (
              <p style={{ color: thm.textMuted, fontSize: 13, padding: "1rem 0", textAlign: "center" }}>
                Computing route summaries…
              </p>
            ) : (
              cards.map(card => (
                <RouteCard
                  key={card.label}
                  card={card}
                  thm={thm}
                  isSelected={card.label === selectedRoute}
                  onSelect={(label) => {
                    onRouteSelect(label);
                  }}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Floating trigger button (when closed) */}
      {!isOpen && (
        <button
          onClick={onToggle}
          style={{
            position: "fixed",
            bottom: 20,
            right: 20,
            zIndex: 997,
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 16px",
            borderRadius: 9999,
            border: `1px solid ${thm.key === "colour" ? "#47413C" : "#DCCFB8"}`,
            background: thm.key === "colour" ? "#262321" : "#FFF9F0",
            color: thm.textPrimary,
            fontFamily: "var(--app-font-display)",
            fontWeight: 700,
            fontSize: 13,
            cursor: "pointer",
            boxShadow: "0 4px 16px rgba(0,0,0,0.14)",
            transition: "transform 0.15s, box-shadow 0.15s",
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)";
            (e.currentTarget as HTMLElement).style.boxShadow = "0 6px 24px rgba(0,0,0,0.2)";
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.transform = "";
            (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 16px rgba(0,0,0,0.14)";
          }}
        >
          <span style={{ fontSize: 16 }}>🗺️</span>
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

  const handleToggle = useCallback(() => setIsOpen(v => !v), []);

  const handleRouteSelect = useCallback((label: string) => {
    props.onRouteSelect(label);
  }, [props.onRouteSelect]);

  const paneProps: PaneProps = {
    cards: props.cards,
    selectedRoute: props.selectedRoute,
    onRouteSelect: handleRouteSelect,
    thm,
    isOpen,
    onToggle: handleToggle,
  };

  if (props.mobile) {
    return <MobileSheet {...paneProps} />;
  }

  return <DesktopPane {...paneProps} />;
}
