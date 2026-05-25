import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useTheme } from "@/lib/ThemeContext";
import type { AppTheme } from "@/lib/theme";
import { computeAllRouteCards } from "@/core/trafficNow";
import type { RouteCardData, LiveStatus } from "@/core/trafficNow";
import type { TrafficRow, WeatherRow, Route } from "@/lib/useTrafficData";
import NestedScaleChart from "@/components/shared/NestedScaleChart";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface SwipeableRouteCardsProps {
  allRows: TrafficRow[];
  routes: Route[];
  selectedRoute: string;
  onRouteSelect: (label: string) => void;
  routeOptions: string[];
  weatherMap?: Map<string, WeatherRow>;
}

/* ── Status color (matching desktop RouteCard) ───────────────── */
function getStatusColor(status: LiveStatus, thm: AppTheme): string {
  if (thm.key === "gray")
    return status === "as-expected"
      ? "#555555"
      : status === "faster" || status === "unusually-fast"
        ? "#2D8A4E"
        : "#C0392B";
  if (thm.key === "pastel")
    return status === "as-expected"
      ? "#546E7A"
      : status === "faster" || status === "unusually-fast"
        ? "#2E7D32"
        : "#D84315";
  return status === "as-expected"
    ? "#60A5FA"
    : status === "faster" || status === "unusually-fast"
      ? "#34D399"
      : "#F87171";
}

/* ── Trend label ─────────────────────────────────────────────── */
function trendLabel(
  liveSpeed: number | null,
  prevSpeed: number | null,
): string | null {
  if (liveSpeed === null || prevSpeed === null) return null;
  if (liveSpeed === prevSpeed) return "no change";
  return liveSpeed > prevSpeed ? "improving" : "getting worse";
}

export default function SwipeableRouteCards({
  allRows,
  routes,
  selectedRoute,
  onRouteSelect,
  routeOptions,
  weatherMap,
}: SwipeableRouteCardsProps) {
  const { theme: thm } = useTheme();
  const [currentIdx, setCurrentIdx] = useState(() => {
    const idx = routeOptions.indexOf(selectedRoute);
    return idx >= 0 ? idx : 0;
  });
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const isDragging = useRef(false);

  /* ── Slide animation state (arrow buttons only) ─────────── */
  const [slideDir, setSlideDir] = useState(0); // -1 exit left, 1 exit right, 0 settled
  const [noTransition, setNoTransition] = useState(false);
  const animating = useRef(false);

  // Sync with external route selection
  useEffect(() => {
    const idx = routeOptions.indexOf(selectedRoute);
    if (idx >= 0 && idx !== currentIdx) setCurrentIdx(idx);
  }, [selectedRoute, routeOptions]);

  // Compute card data for all routes
  const allCards = useMemo(
    () => computeAllRouteCards(allRows, routeOptions, routes, weatherMap),
    [allRows, routeOptions, routes, weatherMap],
  );

  const card = allCards[currentIdx] ?? null;
  const total = routeOptions.length;

  /* Wrap index circularly: infinite scroll */
  const wrapIdx = useCallback(
    (idx: number) => ((idx % total) + total) % total,
    [total],
  );

  /* Instant navigation (used by touch swipe) */
  const goTo = useCallback(
    (idx: number) => {
      const wrapped = wrapIdx(idx);
      setCurrentIdx(wrapped);
      onRouteSelect(routeOptions[wrapped]);
    },
    [wrapIdx, routeOptions, onRouteSelect],
  );

  const goNext = useCallback(() => goTo(currentIdx + 1), [currentIdx, goTo]);
  const goPrev = useCallback(() => goTo(currentIdx - 1), [currentIdx, goTo]);

  /* Animated navigation (used by arrow buttons) — infinite scroll */
  const slideTo = useCallback(
    (direction: -1 | 1) => {
      if (total === 0 || animating.current) return;
      const newIdx = wrapIdx(currentIdx + direction);
      animating.current = true;

      // Phase 1: slide content out
      setSlideDir(direction);

      setTimeout(() => {
        // Phase 2: disable transition, jump to opposite side, swap route
        setNoTransition(true);
        setSlideDir(-direction);
        setCurrentIdx(newIdx);
        onRouteSelect(routeOptions[newIdx]);

        // Phase 3: re-enable transition, slide to center
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setNoTransition(false);
            setSlideDir(0);
            setTimeout(() => { animating.current = false; }, 220);
          });
        });
      }, 120);
    },
    [currentIdx, total, routeOptions, onRouteSelect, wrapIdx],
  );

  // Touch handlers
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    isDragging.current = false;
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const dx = Math.abs(e.touches[0].clientX - touchStartX.current);
    const dy = Math.abs(e.touches[0].clientY - touchStartY.current);
    if (dx > 10 && dx > dy) isDragging.current = true;
  }, []);

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!isDragging.current) return;
      const dx = e.changedTouches[0].clientX - touchStartX.current;
      if (Math.abs(dx) > 50) {
        if (dx < 0) goNext();
        else goPrev();
      }
    },
    [goNext, goPrev],
  );

  if (!card) return null;

  const trend = trendLabel(card.liveSpeed, card.prevSpeed);
  const trendColor = getStatusColor(card.status, thm);

  // Accent border color per theme
  const accentColor =
    thm.key === "colour"
      ? "rgba(34,211,238,0.35)"
      : thm.key === "pastel"
        ? "rgba(120,100,80,0.25)"
        : "rgba(0,0,0,0.15)";

  // Compute diamond position for status text centering
  const livePos =
    card.liveSpeed !== null && card.cityMax > card.cityMin
      ? Math.max(3, Math.min(97, ((card.liveSpeed - card.cityMin) / (card.cityMax - card.cityMin)) * 100))
      : null;

  /* Nav button shared style */
  const NAV_SIZE = 30;
  const navBtnBase: React.CSSProperties = {
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
    width: NAV_SIZE,
    height: NAV_SIZE,
    borderRadius: NAV_SIZE / 2,
    background: thm.sectionBg,
    border: `1.5px solid ${accentColor}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    color: thm.textMuted,
    boxShadow: "0 1px 4px rgba(0,0,0,0.18)",
    zIndex: 3,
    padding: 0,
    transition: "opacity 0.15s",
  };

  // Status text alignment: shift toward center when diamond is near edges
  const statusLeft =
    livePos === null ? "50%"
      : livePos < 15 ? "0"
        : livePos > 85 ? "100%"
          : `${livePos}%`;
  const statusTransform =
    livePos === null ? "translateX(-50%)"
      : livePos < 15 ? "none"
        : livePos > 85 ? "translateX(-100%)"
          : "translateX(-50%)";

  return (
    <div style={{ position: "relative", marginTop: 14 }}>
      {/* ── Title cutting across the top border ──────────── */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 14,
          background: thm.sectionBg,
          padding: "0 8px",
          zIndex: 2,
          transform: "translateY(-50%)",
        }}
      >
        <p
          style={{
            fontFamily: "var(--app-font-display)",
            fontWeight: 900,
            fontSize: 18,
            color: thm.textPrimary,
            letterSpacing: "-0.02em",
            lineHeight: 1,
            margin: 0,
            whiteSpace: "nowrap",
          }}
        >
          📡 Traffic NOW!
        </p>
      </div>

      {/* ── Card with distinct border ────────────────────── */}
      <div
        style={{
          position: "relative",
          background: thm.sectionBg,
          border: `2px solid ${accentColor}`,
          borderRadius: 14,
          paddingTop: 14,
          overflow: "hidden",
        }}
      >

        {/* ── Card content (slides on arrow click) ─────────── */}
        <div
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          style={{
            transition: noTransition
              ? "none"
              : "transform 200ms cubic-bezier(0.25,0.1,0.25,1)",
            transform: `translateX(${slideDir * -100}%)`,
            padding: "8px 14px 10px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {/* Row 1: route name */}
          <p
            style={{
              fontSize: 16,
              fontWeight: 400,
              color: thm.chart.line1,
              lineHeight: 1.3,
              margin: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {card.label}
          </p>

          {/* Row 2: origin → destination */}
          <p
            style={{
              fontSize: 11,
              color: thm.textMuted,
              lineHeight: 1.3,
              margin: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {card.origin}
            {card.destination ? ` → ${card.destination}` : ""}
          </p>

          {/* Row 3: weather strip */}
          {card.weather && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                fontSize: 10,
                color: thm.textMuted,
                flexWrap: "wrap",
              }}
            >
              {card.weather.temp_c !== null && (
                <span>
                  🌡 {card.weather.temp_c}°C
                  {card.weather.realfeel_c !== null && (
                    <span style={{ opacity: 0.75 }}>
                      {" "}
                      (Feels like {card.weather.realfeel_c}°C
                      {card.weather.realfeel_word
                        ? ` – ${card.weather.realfeel_word}`
                        : ""}
                      )
                    </span>
                  )}
                </span>
              )}
              {card.weather.humidity_pct !== null && (
                <span>💧{card.weather.humidity_pct}%</span>
              )}
              {card.weather.aqi !== null && (
                <span
                  style={{
                    fontWeight: 600,
                    color:
                      card.weather.aqi <= 50
                        ? thm.key === "colour"
                          ? "#34D399"
                          : "#2E7D32"
                        : card.weather.aqi <= 100
                          ? thm.key === "colour"
                            ? "#FBBF24"
                            : "#F57F17"
                          : thm.key === "colour"
                            ? "#F87171"
                            : "#C62828",
                  }}
                >
                  💨 {card.weather.aqi}
                  {card.weather.aqi_category && (
                    <span style={{ fontWeight: 400, opacity: 0.8 }}>
                      {" "}
                      {card.weather.aqi_category}
                    </span>
                  )}
                </span>
              )}
              {card.weather.condition &&
                !card.weather.condition
                  .toLowerCase()
                  .startsWith("no precipitation") && (
                  <span style={{ opacity: 0.8 }}>
                    🌧️ {card.weather.condition}
                  </span>
                )}
            </div>
          )}

          {/* Row 4: NestedScaleChart bullet */}
          <div style={{ marginTop: 2 }}>
            <NestedScaleChart
              liveSpeed={card.liveSpeed}
              prevSpeed={card.prevSpeed}
              typical={card.typical}
              cityMin={card.cityMin}
              cityMax={card.cityMax}
              status={card.status}
              thm={thm}
              expanded={true}
            />
          </div>

          {/* Row 5: status text below active diamond marker */}
          {livePos !== null && (
            <div style={{ position: "relative", height: 18, marginTop: -2, overflow: "hidden" }}>
              <span
                style={{
                  position: "absolute",
                  left: statusLeft,
                  transform: statusTransform,
                  fontSize: 10,
                  fontWeight: 600,
                  color: trendColor,
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
        </div>
      </div>

      {/* ── Nav buttons (outside overflow:hidden card) ───── */}
      <button
        onClick={() => slideTo(-1)}
        aria-label="Previous route"
        style={{ ...navBtnBase, left: -15 }}
      >
        <ChevronLeft size={16} />
      </button>
      <button
        onClick={() => slideTo(1)}
        aria-label="Next route"
        style={{ ...navBtnBase, right: -15 }}
      >
        <ChevronRight size={16} />
      </button>

      {/* Accessible carousel label */}
      <div
        style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0,0,0,0)" }}
        aria-live="polite"
        aria-atomic="true"
      >
        Route {currentIdx + 1} of {total}
      </div>
    </div>
  );
}
