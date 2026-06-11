import { useState, useRef, useCallback, useEffect, useLayoutEffect, useMemo } from "react";
import { useTheme } from "@/lib/ThemeContext";
import type { AppTheme } from "@/lib/theme";
import type { WeatherRow } from "@/lib/useTrafficData";
import type { LiveStatus, RouteTODStats, RouteCardData } from "@/core/trafficNow";
import appConfig from "../config.json";
import type { AppConfig } from "../lib/config";

const cfg = appConfig as AppConfig;

import InfoTip from "@/components/ui/InfoTip";
import { TOOLTIP_CONTENT } from "@/lib/tooltipContent";
import NestedScaleChart from "@/components/shared/NestedScaleChart";
import { getRouteMapshot } from "@/lib/routeMapshots";

interface RouteMapshot { imageUrl: string; alt: string; }

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
  ttActive?: boolean;
  ttSimulatedNow?: Date | null;
  mapLinkByLabel?: Map<string, string>;
  onHoverRoute?: (label: string | null) => void;
  mapshot?: RouteMapshot | null;
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

/* ── TT date format for pane labels ─────────────────────────── */
function ttFormatPane(dt: Date): string {
  const d = dt.getDate();
  const mon = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][dt.getMonth()];
  const yr = String(dt.getFullYear()).slice(2);
  const hh = String(dt.getHours()).padStart(2, "0");
  const mm = String(dt.getMinutes()).padStart(2, "0");
  return `${d} ${mon} '${yr} · ${hh}:${mm}`;
}

/* ── Animated sorted card list (FLIP) ─────────────────────────── */
function SortedCardList({
  cards, thm, selectedRoute, onRouteSelect, ttActive, mapLinkByLabel, onHover,
}: {
  cards: RouteCardData[];
  thm: AppTheme;
  selectedRoute: string;
  onRouteSelect: (label: string) => void;
  ttActive?: boolean;
  mapLinkByLabel?: Map<string, string>;
  onHover: (label: string | null) => void;
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
            ttActive={ttActive}
            onHover={onHover}
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


/* ── Route card ────────────────────────────────────────────────── */
function RouteCard({
  card, thm, isSelected, onSelect, isLast, ttActive, onHover,
}: {
  card: RouteCardData; thm: AppTheme; isSelected: boolean;
  onSelect: (label: string) => void; isLast: boolean;
  ttActive?: boolean;
  onHover: (label: string | null) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const handleMouseEnter = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setHovered(true);
    onHover(card.label);
  }, [card.label, onHover]);
  
  const handleMouseLeave = useCallback(() => {
    hoverTimeoutRef.current = setTimeout(() => {
      setHovered(false);
      onHover(null);
    }, 2500);
  }, [onHover]);
  
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

  // Status text color — must match NestedScaleChart diamond exactly
  const getStatusColor = () => {
    if (thm.key === 'gray')
      return card.status === 'as-expected' ? '#555555'
           : card.status === 'faster' || card.status === 'unusually-fast' ? '#2D8A4E'
           : '#C0392B';
    if (thm.key === 'pastel')
      return card.status === 'as-expected' ? '#546E7A'
           : card.status === 'faster' || card.status === 'unusually-fast' ? '#2E7D32'
           : '#D84315';
    // colour theme — typical is gray, not blue
    return card.status === 'as-expected' ? '#9CA3AF'
         : card.status === 'faster' || card.status === 'unusually-fast' ? '#34D399'
         : '#F87171';
  };

  // Trend label (matching mobile)
  const trend = (card.liveSpeed !== null && card.prevSpeed !== null && !ttActive)
    ? (card.liveSpeed === card.prevSpeed ? "no change" : card.liveSpeed > card.prevSpeed ? "improving" : "getting worse")
    : null;

  // Diamond position for status text alignment (matching mobile)
  const livePos = card.liveSpeed !== null && card.cityMax > card.cityMin
    ? Math.max(3, Math.min(97, ((card.liveSpeed - card.cityMin) / (card.cityMax - card.cityMin)) * 100))
    : null;
  const statusLeft = livePos === null ? "50%" : livePos < 15 ? "0" : livePos > 85 ? "100%" : `${livePos}%`;
  const statusTransform = livePos === null ? "translateX(-50%)" : livePos < 15 ? "none" : livePos > 85 ? "translateX(-100%)" : "translateX(-50%)";

  return (
    <div
      onClick={() => onSelect(card.label)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      tabIndex={0}
      role="button"
      className="route-card-focus"
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(card.label); } }}
      onFocus={() => onHover(card.label)}
      onBlur={() => onHover(null)}
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
      {/* Route name + endpoints side-by-side */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "auto 1fr",
        gridTemplateRows: "1fr 1fr",
        columnGap: 16,
        alignItems: "baseline",
        minHeight: 0,
      }}>
        <span style={{
          gridRow: "1 / 3",
          fontSize: 17, fontWeight: 700,
          color: isSelected ? thm.chart.line1 : thm.textPrimary,
          lineHeight: 1.35,
          transition: "color 0.12s",
          alignSelf: "center",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {card.label}
        </span>
        {card.origin && (
          <span style={{
            fontSize: 10, color: thm.textMuted, lineHeight: 1.3,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            textAlign: "right",
          }}>
            {card.origin}
          </span>
        )}
        {card.destination && (
          <span style={{
            fontSize: 10, color: thm.textMuted, lineHeight: 1.3,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            textAlign: "right",
          }}>
            → {card.destination}
          </span>
        )}
      </div>

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
              style={{
                fontWeight: 600,
                color:
                  card.weather.aqi <= 50  ? (thm.key === "colour" ? "#34D399" : "#2E7D32") :
                  card.weather.aqi <= 100 ? (thm.key === "colour" ? "#FBBF24" : "#F57F17") :
                                            (thm.key === "colour" ? "#F87171" : "#C62828"),
              }}
            >
              💨 {card.weather.aqi}{card.weather.aqi_category && (
                <span style={{ fontWeight: 400, opacity: 0.8 }}> {card.weather.aqi_category}</span>
              )}
            </span>
          )}
          {card.weather.condition && !card.weather.condition.toLowerCase().startsWith("no precipitation") && (
            <span style={{ opacity: 0.8 }}>🌧️ {card.weather.condition}</span>
          )}
        </div>
      )}

      {/* Row 3: Nested-scale chart (numbers visible when selected/hovered) */}
      <div style={{ marginTop: 2 }}>
        <NestedScaleChart
          liveSpeed={card.liveSpeed}
          prevSpeed={card.prevSpeed}
          typical={card.typical}
          cityMin={card.cityMin}
          cityMax={card.cityMax}
          status={card.status}
          thm={thm}
          expanded={hovered || isSelected}
          ttActive={ttActive}
        />
      </div>

      {/* Row 4: status text below diamond */}
      {livePos !== null && (
        <div style={{ position: "relative", height: 18, marginTop: -2, overflow: "hidden" }}>
          <span
            style={{
              position: "absolute",
              left: statusLeft,
              transform: statusTransform,
              fontSize: 10,
              fontWeight: 600,
              color: getStatusColor(),
              whiteSpace: "nowrap",
              fontStyle: "italic",
              textAlign: "center",
              lineHeight: 1.3,
            }}
          >
            {card.statusText}
            {trend ? `, ${trend}` : ""}
          </span>
        </div>
      )}
      
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
function DesktopPane({ cards, selectedRoute, onRouteSelect, thm, isOpen, onToggle, paneWidth, dataTimestamp, lastUpdated, ttActive, ttSimulatedNow, mapLinkByLabel, onHoverRoute, mapshot }: PaneProps) {
  const RAIL_WIDTH = 44;
  const MIN_WIDTH = cfg.route_pane.min_width;
  const MAX_WIDTH = cfg.route_pane.max_width;
  const [dragging, setDragging] = useState(false);
  const [hoveredRoute, setHoveredRoute] = useState<string | null>(null);
  const handleHover = useCallback((label: string | null) => {
    setHoveredRoute(label);
    onHoverRoute?.(label);
  }, [onHoverRoute]);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);
  const paneBorderColor = ttActive
    ? thm.key === "colour" ? "rgba(167,139,250,0.35)" : thm.key === "pastel" ? "rgba(138,126,104,0.55)" : "rgba(17,17,17,0.45)"
    : thm.paneBorder;
  const railBorderColor = ttActive
    ? thm.key === "colour" ? "rgba(167,139,250,0.16)" : thm.key === "pastel" ? "rgba(138,126,104,0.22)" : "rgba(17,17,17,0.18)"
    : thm.key === "colour" ? "#2A3545" : thm.key === "pastel" ? "#DCCFB8" : "#e0e0e0";
  const railHoverBg = thm.key === "colour" ? "rgba(255,255,255,0.04)" : thm.key === "pastel" ? "rgba(138,126,104,0.08)" : "rgba(0,0,0,0.04)";

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
      border: `1px solid ${paneBorderColor}`,
      borderRadius: 16,
      backgroundClip: "padding-box",
      boxShadow: ttActive ? "0 10px 28px rgba(0,0,0,0.08)" : undefined,
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
        background: thm.paneBg,
        opacity: isOpen ? 1 : 0,
        transition: "opacity 0.2s ease",
        pointerEvents: isOpen ? "auto" : "none",
      }}>
        {/* Header */}
        <div style={{
          padding: "10px 12px 7px",
          borderBottom: `1px solid ${railBorderColor}`,
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{
                fontFamily: "var(--app-font-display)", fontWeight: 900, fontSize: 18,
                color: thm.textPrimary, letterSpacing: "-0.02em", lineHeight: 1,
              }}>
                {ttActive ? "📡 Traffic THEN!" : "📡 Traffic NOW!"}
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
          {dataTimestamp && (
            <p style={{ fontSize: 11, color: thm.textMuted, margin: "4px 0 0",
              display: "flex", alignItems: "center", gap: 5, opacity: 0.8 }}>
              {!ttActive && <span className="live-dot" aria-hidden="true" />}
              <span>
                {ttActive && ttSimulatedNow
                  ? `Time Travel · as of ${ttFormatPane(ttSimulatedNow)}`
                  : `Live · updated ${relativeTime(dataTimestamp)}`}
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
                ttActive={ttActive}
                mapLinkByLabel={mapLinkByLabel}
                onHover={handleHover}
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
          background: thm.paneBg,
          borderLeft: `1px solid ${railBorderColor}`,
          transition: "background 0.2s", zIndex: 2,
          boxShadow: "none",
          outline: "none",
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLElement).style.background =
            railHoverBg;
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLElement).style.background =
            thm.paneBg;
        }}
      >
        {!ttActive && (
          <span className="live-dot" aria-hidden="true" style={{
            width: 5, height: 5, marginBottom: 6,
          }} />
        )}
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
function MobileSheet({ cards, selectedRoute, onRouteSelect, thm, isOpen, onToggle, dataTimestamp, lastUpdated, ttActive, ttSimulatedNow, mapLinkByLabel }: PaneProps) {
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
            }}>{ttActive ? "Traffic THEN!" : "Traffic NOW!"}</span>
          </div>
          {dataTimestamp && (
            <p style={{ fontSize: 9, color: thm.textMuted, margin: "2px 0 0",
              display: "flex", alignItems: "center", gap: 4 }}>
              {!ttActive && <span className="live-dot" aria-hidden="true" style={{ width: 5, height: 5 }} />}
              <span>{ttActive && ttSimulatedNow ? `Time Travel · ${ttFormatPane(ttSimulatedNow)}` : `Live · ${relativeTime(dataTimestamp)}`}</span>
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
                ttActive={ttActive}
                mapLinkByLabel={mapLinkByLabel}
                onHover={() => {}}
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
  isOpen?: boolean;
  onToggle?: () => void;
  paneWidth?: number;
  ttActive?: boolean;
  ttSimulatedNow?: Date | null;
  mapLinkByLabel?: Map<string, string>;
  onHoverRoute?: (label: string | null) => void;
  mapshot?: RouteMapshot | null;
}

export default function RouteBrowserPane(props: Props) {
  const { theme: thm } = useTheme();
  const [internalOpen, setInternalOpen] = useState(cfg.route_pane.open);
  const [internalWidth, setInternalWidth] = useState(cfg.route_pane.width);

  const isOpen = props.isOpen !== undefined ? props.isOpen : internalOpen;
  const paneWidth = props.paneWidth !== undefined ? props.paneWidth : internalWidth;

  useEffect(() => {
    const handler = (e: Event) => {
      const w = (e as CustomEvent).detail;
      if (typeof w === "number" && w >= cfg.route_pane.min_width && w <= cfg.route_pane.max_width) setInternalWidth(w);
    };
    window.addEventListener("route-pane-resize", handler);
    return () => window.removeEventListener("route-pane-resize", handler);
  }, []);

  const handleToggle = useCallback(() => {
    if (props.onToggle) { props.onToggle(); }
    else { setInternalOpen(v => !v); }
  }, [props.onToggle]);
  const handleRouteSelect = useCallback((label: string) => {
    props.onRouteSelect(label);
  }, [props.onRouteSelect]);

  const paneProps: PaneProps = {
    cards: props.cards, selectedRoute: props.selectedRoute,
    onRouteSelect: handleRouteSelect, thm, isOpen, onToggle: handleToggle, paneWidth,
    dataTimestamp: props.dataTimestamp, lastUpdated: props.lastUpdated,
    ttActive: props.ttActive, ttSimulatedNow: props.ttSimulatedNow,
    mapLinkByLabel: props.mapLinkByLabel,
    onHoverRoute: props.onHoverRoute,
    mapshot: props.mapshot,
  };

  return props.mobile ? <MobileSheet {...paneProps} /> : <DesktopPane {...paneProps} />;
}
