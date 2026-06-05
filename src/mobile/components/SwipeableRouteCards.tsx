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
  dataTimestamp?: Date | null;
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

/* ── Weather condition emoji ──────────────────────────────── */
function weatherGlyph(condition: string): string {
  const c = condition.toLowerCase();
  if (c.includes("thunder")) return "⛈️";
  if (c.includes("heavy")) return "🌧️";
  if (c.includes("light") || c.includes("drizzle")) return "🌦️";
  if (c.includes("rain") || c.includes("shower")) return "🌧️";
  if (c.includes("snow") || c.includes("sleet") || c.includes("flurr")) return "❄️";
  if (c.includes("fog") || c.includes("mist") || c.includes("haze")) return "🌫️";
  if (c.includes("overcast") || c.includes("cloud")) return "☁️";
  if (c.includes("clear") || c.includes("sunny")) return "☀️";
  return "🌧️";
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

/* ── Relative time label (mirrors RouteBrowserPane) ──────────── */
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

export default function SwipeableRouteCards({
  allRows,
  routes,
  selectedRoute,
  onRouteSelect,
  routeOptions,
  weatherMap,
  dataTimestamp,
}: SwipeableRouteCardsProps) {
  const { theme: thm } = useTheme();

  /* Tick every 60 s so the "X min ago" label stays fresh */
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);
  const [currentIdx, setCurrentIdx] = useState(() => {
    const idx = routeOptions.indexOf(selectedRoute);
    return idx >= 0 ? idx : 0;
  });
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const isDragging = useRef(false);
  const cardRef = useRef<HTMLDivElement>(null);

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

  // Touch handlers — card follows finger, snaps on release
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (animating.current) return;
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    isDragging.current = false;
    if (cardRef.current) {
      cardRef.current.style.transition = "none";
    }
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = e.touches[0].clientY - touchStartY.current;
    if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
      isDragging.current = true;
      if (cardRef.current) {
        cardRef.current.style.transform = `translateX(${dx}px)`;
        cardRef.current.style.transition = "none";
      }
    }
  }, []);

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!isDragging.current || animating.current) return;
      const dx = e.changedTouches[0].clientX - touchStartX.current;

      if (Math.abs(dx) > 50) {
        const direction = dx < 0 ? 1 : -1; // swipe left -> next, swipe right -> prev
        const target = direction * -100;    // -100% or +100%

        if (cardRef.current) {
          cardRef.current.style.transition =
            "transform 220ms cubic-bezier(0.25,0.1,0.25,1)";
          cardRef.current.style.transform = `translateX(${target}%)`;
        }

        setTimeout(() => {
          if (direction === 1) goNext();
          else goPrev();
        }, 220);
      } else {
        if (cardRef.current) {
          cardRef.current.style.transition =
            "transform 220ms cubic-bezier(0.25,0.1,0.25,1)";
          cardRef.current.style.transform = "translateX(0)";
        }
      }
      isDragging.current = false;
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

        {/* ── Card content (slides on arrow click or drag) ─ */}
        <div
          ref={cardRef}
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
          {/* Row 1: route name + live timestamp inline */}
          <p style={{
            fontSize: 16, fontWeight: 400, color: thm.chart.line1,
            lineHeight: 1.3, margin: 0,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {card.label}
            {dataTimestamp && (
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                fontSize: 10, color: thm.textMuted,
                marginLeft: 8, verticalAlign: "middle",
              }}>
                <span className="live-dot" aria-hidden="true" style={{ width: 5, height: 5 }} />
                <span>{relativeTime(dataTimestamp)}</span>
              </span>
            )}
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
                <span>🌡 {card.weather.temp_c}°C</span>
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
                    {weatherGlyph(card.weather.condition)} {card.weather.condition}
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
