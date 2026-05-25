import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useTheme } from "@/lib/ThemeContext";
import { computeAllRouteCards, computeSingleRouteCard } from "@/core/trafficNow";
import type { RouteCardData } from "@/core/trafficNow";
import type { TrafficRow, WeatherRow, Route } from "@/lib/useTrafficData";

interface SwipeableRouteCardsProps {
  allRows: TrafficRow[];
  routes: Route[];
  selectedRoute: string;
  onRouteSelect: (label: string) => void;
  routeOptions: string[];
  weatherMap?: Map<string, WeatherRow>;
}

export default function SwipeableRouteCards({
  allRows, routes, selectedRoute, onRouteSelect, routeOptions, weatherMap,
}: SwipeableRouteCardsProps) {
  const { theme: thm } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentIdx, setCurrentIdx] = useState(() => {
    const idx = routeOptions.indexOf(selectedRoute);
    return idx >= 0 ? idx : 0;
  });
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const isDragging = useRef(false);

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

  const goTo = useCallback((idx: number) => {
    const clamped = Math.max(0, Math.min(idx, total - 1));
    setCurrentIdx(clamped);
    onRouteSelect(routeOptions[clamped]);
  }, [total, routeOptions, onRouteSelect]);

  const goNext = useCallback(() => goTo(currentIdx + 1), [currentIdx, goTo]);
  const goPrev = useCallback(() => goTo(currentIdx - 1), [currentIdx, goTo]);

  // Touch handlers for swipe
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

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 50) {
      if (dx < 0) goNext();
      else goPrev();
    }
  }, [goNext, goPrev]);

  if (!card) return null;

  const statusColors: Record<string, { bg: string; text: string }> = {
    "unusually-fast":  { bg: "#DCFCE7", text: "#166534" },
    "faster":          { bg: "#D1FAE5", text: "#065F46" },
    "as-expected":     { bg: "#FEF3C7", text: "#92400E" },
    "slower":          { bg: "#FEE2E2", text: "#991B1B" },
    "unusually-slower":{ bg: "#FECACA", text: "#7F1D1D" },
    "no-data":         { bg: "#F3F4F6", text: "#6B7280" },
  };
  const sc = statusColors[card.status] ?? statusColors["no-data"];

  return (
    <div style={{ position: "relative" }}>
      {/* Card container with peek effect */}
      <div
        ref={containerRef}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          display: "flex",
          overflow: "hidden",
          borderRadius: 16,
          margin: "0 -8px",
          padding: "0 8px",
        }}
      >
        {/* Peek: show a sliver of adjacent cards */}
        {currentIdx > 0 && (
          <div style={{
            width: 24, flexShrink: 0, opacity: 0.3,
            background: thm.sectionBg, borderRadius: 12,
            marginRight: 4,
          }} />
        )}

        {/* Active card */}
        <div style={{
          flex: 1,
          background: thm.sectionBg,
          border: thm.cardBorder,
          borderRadius: 16,
          padding: "16px 18px",
          boxShadow: thm.cardShadow,
          minWidth: 0,
        }}>
          {/* Route header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <p style={{
                fontFamily: "var(--app-font-display)", fontWeight: 800, fontSize: 16,
                color: thm.textPrimary, margin: 0, lineHeight: 1.2,
              }}>
                {card.label}
              </p>
              <p style={{ fontSize: 11, color: thm.textMuted, margin: "4px 0 0" }}>
                {card.origin}{card.destination ? ` → ${card.destination}` : ""}
              </p>
            </div>
            {/* Status badge */}
            <span style={{
              fontSize: 10, fontWeight: 700, padding: "3px 10px",
              borderRadius: 999, background: sc.bg, color: sc.text,
              whiteSpace: "nowrap", flexShrink: 0, marginLeft: 8,
            }}>
              {card.statusText}
            </span>
          </div>

          {/* Speed + typical range */}
          <div style={{ display: "flex", gap: 16, marginBottom: 10 }}>
            <div>
              <p style={{ fontSize: 10, fontWeight: 600, color: thm.textMuted, margin: 0, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Current Speed
              </p>
              <p style={{
                fontFamily: "var(--app-font-display)", fontWeight: 800, fontSize: 28,
                color: thm.textPrimary, margin: 0, lineHeight: 1,
              }}>
                {card.liveSpeed ?? "—"}<span style={{ fontSize: 12, fontWeight: 600 }}> km/h</span>
              </p>
            </div>
            {card.typical && (
              <div>
                <p style={{ fontSize: 10, fontWeight: 600, color: thm.textMuted, margin: 0, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Typical Range
                </p>
                <p style={{
                  fontFamily: "var(--app-font-display)", fontWeight: 700, fontSize: 14,
                  color: thm.textSecondary, margin: 0, lineHeight: 1, marginTop: 4,
                }}>
                  {Math.round(card.typical.p15)}–{Math.round(card.typical.p85)} km/h
                </p>
              </div>
            )}
          </div>

          {/* Weather row */}
          {card.weather && (
            <div style={{
              display: "flex", gap: 12, fontSize: 11, color: thm.textSecondary,
              padding: "8px 0", borderTop: `1px solid ${thm.key === "gray" ? "#e0e0e0" : "hsl(var(--border))"}`,
              flexWrap: "wrap",
            }}>
              {card.weather.temp_c != null && (
                <span>🌡 {Math.round(card.weather.temp_c)}°C{card.weather.realfeel_c != null ? ` (feels ${Math.round(card.weather.realfeel_c)}°)` : ""}</span>
              )}
              {card.weather.humidity_pct != null && (
                <span>💧 {Math.round(card.weather.humidity_pct)}%</span>
              )}
              {card.weather.aqi != null && (
                <span>🫁 AQI {Math.round(card.weather.aqi)}{card.weather.aqi_category ? ` (${card.weather.aqi_category})` : ""}</span>
              )}
              {card.weather.condition && (
                <span>🌧 {card.weather.condition}</span>
              )}
            </div>
          )}
        </div>

        {currentIdx < total - 1 && (
          <div style={{
            width: 24, flexShrink: 0, opacity: 0.3,
            background: thm.sectionBg, borderRadius: 12,
            marginLeft: 4,
          }} />
        )}
      </div>

      {/* Dot indicators + route counter */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        gap: 6, marginTop: 10,
      }}>
        {routeOptions.map((_, i) => (
          <button
            key={i}
            onClick={() => goTo(i)}
            style={{
              width: i === currentIdx ? 20 : 6,
              height: 6,
              borderRadius: 999,
              background: i === currentIdx ? thm.textPrimary : thm.textMuted,
              opacity: i === currentIdx ? 1 : 0.3,
              border: "none",
              cursor: "pointer",
              transition: "all 0.2s ease",
              padding: 0,
            }}
            aria-label={`Route ${i + 1}`}
          />
        ))}
        <span style={{ fontSize: 10, color: thm.textMuted, marginLeft: 8 }}>
          {currentIdx + 1} / {total}
        </span>
      </div>
    </div>
  );
}
