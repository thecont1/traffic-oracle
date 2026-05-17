import { useEffect, useState, Fragment } from "react";
import {
  MapContainer, TileLayer, Polyline, Tooltip, Marker, useMap, useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import { ROUTE_COORDS, BLR_BOUNDS } from "@/lib/routeCoords";

/* ──────────────────────────────────────────────────────────────── */
/*  Types                                                           */
/* ──────────────────────────────────────────────────────────────── */
interface RouteInfo { label_short: string; avgSpeed?: number; }
interface Props {
  routes: RouteInfo[];
  selectedRoute: string;
  onRouteSelect: (route: string) => void;
  dark: boolean;
}

/* ──────────────────────────────────────────────────────────────── */
/*  Maths helpers                                                   */
/* ──────────────────────────────────────────────────────────────── */

/** Deterministic curve-side from route name char codes */
function sideof(name: string): 1 | -1 {
  return name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 2 === 0 ? 1 : -1;
}

/**
 * Quadratic Bézier arc between two lat/lng endpoints.
 * Curve height = 22 % of chord length, applied perpendicular.
 */
function bezierArc(
  p0: [number, number],
  p2: [number, number],
  side: 1 | -1,
  steps = 40,
): [number, number][] {
  const [lat1, lng1] = p0;
  const [lat2, lng2] = p2;
  const dLat = lat2 - lat1;
  const dLng = lng2 - lng1;
  const dist = Math.sqrt(dLat * dLat + dLng * dLng) || 1e-9;
  const cf   = dist * 0.22;          // curvature factor
  const mLat = (lat1 + lat2) / 2;
  const mLng = (lng1 + lng2) / 2;
  // perpendicular unit vector scaled by cf
  const pLat = (-dLng / dist) * cf * side;
  const pLng = ( dLat / dist) * cf * side;
  const cLat = mLat + pLat;           // control point
  const cLng = mLng + pLng;

  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    const u = 1 - t;
    return [
      u * u * lat1 + 2 * u * t * cLat + t * t * lat2,
      u * u * lng1 + 2 * u * t * cLng + t * t * lng2,
    ] as [number, number];
  });
}

/** Point on the arc at t = 0.5 (the apex of the curve) */
function arcApex(
  p0: [number, number],
  p2: [number, number],
  side: 1 | -1,
): [number, number] {
  const [lat1, lng1] = p0;
  const [lat2, lng2] = p2;
  const dLat = lat2 - lat1;
  const dLng = lng2 - lng1;
  const dist = Math.sqrt(dLat * dLat + dLng * dLng) || 1e-9;
  const cf   = dist * 0.22;
  const mLat = (lat1 + lat2) / 2;
  const mLng = (lng1 + lng2) / 2;
  const pLat = (-dLng / dist) * cf * side;
  const pLng = ( dLat / dist) * cf * side;
  const cLat = mLat + pLat;
  const cLng = mLng + pLng;
  // B(0.5) = 0.25*P0 + 0.5*C + 0.25*P2
  return [
    0.25 * lat1 + 0.5 * cLat + 0.25 * lat2,
    0.25 * lng1 + 0.5 * cLng + 0.25 * lng2,
  ];
}

/* ──────────────────────────────────────────────────────────────── */
/*  DivIcon label factory                                           */
/* ──────────────────────────────────────────────────────────────── */
function makeLabelIcon(label: string, selected: boolean, dark: boolean): L.DivIcon {
  const bg = selected
    ? (dark ? "rgba(34,211,238,0.92)" : "rgba(58,134,200,0.92)")
    : dark ? "rgba(38,35,33,0.86)" : "rgba(255,255,255,0.82)";
  const shadow = selected
    ? "0 2px 14px rgba(58,134,200,0.5), 0 1px 4px rgba(0,0,0,0.35)"
    : "0 1px 4px rgba(0,0,0,0.25)";
  const scale = selected ? "scale(1.13)" : "scale(1)";
  const border = selected ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.15)";
  return L.divIcon({
    className: "",
    html: `<div style="
      transform:translate(-50%,-50%) ${scale};
      background:${bg};
      color:#fff;
      padding:3px 9px 3px 7px;
      border-radius:20px;
      font-size:10.5px;
      font-weight:700;
      white-space:nowrap;
      letter-spacing:0.03em;
      border:1px solid ${border};
      box-shadow:${shadow};
      cursor:pointer;
      user-select:none;
      transition:transform 0.18s;
    ">${selected ? "📍 " : ""}${label}</div>`,
    iconSize:   [0, 0],
    iconAnchor: [0, 0],
  });
}

/* ──────────────────────────────────────────────────────────────── */
/*  Internal components                                             */
/* ──────────────────────────────────────────────────────────────── */

/** Fits the viewport to all Bangalore routes on mount. */
function FitView() {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(BLR_BOUNDS, { padding: [28, 28], animate: true });
  }, [map]);
  return null;
}

/** Exposes current zoom level to parent component. */
function ZoomTracker({ onZoom }: { onZoom: (z: number) => void }) {
  const map = useMap();
  useMapEvents({ zoomend: () => onZoom(map.getZoom()) });
  return null;
}

/* ──────────────────────────────────────────────────────────────── */
/*  Tiles                                                           */
/* ──────────────────────────────────────────────────────────────── */
const TILE_DARK  = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const TILE_LIGHT = "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
const TILE_ATTR  = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com">CARTO</a>';

/* ──────────────────────────────────────────────────────────────── */
/*  Main component                                                  */
/* ──────────────────────────────────────────────────────────────── */
export function TrafficMap({ routes, selectedRoute, onRouteSelect, dark }: Props) {
  const [zoom, setZoom] = useState(11);
  const showAllLabels = zoom >= 12;

  return (
    <div style={{
      borderRadius: "1.25rem", overflow: "hidden",
      height: "27rem", border: "1px solid hsl(var(--border))",
      position: "relative",
    }}>
      <MapContainer
        center={[12.97, 77.59]}
        zoom={11}
        style={{ height: "100%", width: "100%" }}
        zoomControl
        scrollWheelZoom={false}
      >
        <FitView />
        <ZoomTracker onZoom={setZoom} />
        <TileLayer url={dark ? TILE_DARK : TILE_LIGHT} attribution={TILE_ATTR} />

        {/* ── Non-selected routes ────────────────────────────── */}
        {routes.map((route) => {
          const raw = ROUTE_COORDS[route.label_short];
          if (!raw || route.label_short === selectedRoute) return null;

          const isAirport = route.label_short === "Airport Expy";
          const side      = sideof(route.label_short);
          const arc       = bezierArc(raw[0], raw[1], side);
          const apex      = arcApex(raw[0], raw[1], side);
          const speedTxt  = route.avgSpeed != null
            ? `${route.avgSpeed > 30 ? "⚡" : "🐌"} ${route.avgSpeed} km/h`
            : "";

          return (
            <Fragment key={route.label_short}>
              <Polyline
                positions={arc}
                pathOptions={{
                  color: isAirport ? "#6FAE63" : dark ? "#64748b" : "#8A8176",
                  weight:     isAirport ? 12 : 10,
                  opacity:    0.40,
                  dashArray:  isAirport ? "10 6" : undefined,
                  lineCap:    "round",
                  lineJoin:   "round",
                }}
                eventHandlers={{ click: () => onRouteSelect(route.label_short) }}
              >
                <Tooltip sticky>
                  <strong>{route.label_short}</strong>
                  {speedTxt && <span>&nbsp; {speedTxt}</span>}
                  <span style={{ display: "block", fontSize: 11, opacity: 0.65 }}>Click to select</span>
                </Tooltip>
              </Polyline>

              {/* Label marker: always for Airport Expy, zoom-gated for others */}
              {(showAllLabels || isAirport) && (
                <Marker
                  position={apex}
                  icon={makeLabelIcon(route.label_short, false, dark)}
                  eventHandlers={{ click: () => onRouteSelect(route.label_short) }}
                  zIndexOffset={0}
                >
                  <Tooltip direction="top" offset={[0, -8]}>
                    <strong>{route.label_short}</strong>
                    {speedTxt && <span>&nbsp; {speedTxt}</span>}
                  </Tooltip>
                </Marker>
              )}
            </Fragment>
          );
        })}

        {/* ── Selected route (rendered last = on top) ────────── */}
        {(() => {
          const raw = ROUTE_COORDS[selectedRoute];
          if (!raw) return null;

          const side     = sideof(selectedRoute);
          const arc      = bezierArc(raw[0], raw[1], side);
          const apex     = arcApex(raw[0], raw[1], side);
          const info     = routes.find(r => r.label_short === selectedRoute);
          const speedTxt = info?.avgSpeed != null
            ? `${info.avgSpeed > 30 ? "⚡" : "🐌"} ${info.avgSpeed} km/h`
            : "";

          const sharedOpts: Partial<L.PathOptions> = {
            lineCap: "round", lineJoin: "round",
          };

          return (
            <Fragment key={`sel-${selectedRoute}`}>
              {/* Outer ambient glow */}
              <Polyline positions={arc} pathOptions={{
                ...sharedOpts, color: dark ? "#22D3EE" : "#3A86C8",
                weight: 36, opacity: 0.10, className: "route-glow-outer",
              }} />
              {/* Mid diffuse glow */}
              <Polyline positions={arc} pathOptions={{
                ...sharedOpts, color: dark ? "#9CC9EE" : "#6DB0D9",
                weight: 22, opacity: 0.20, className: "route-glow-mid",
              }} />
              {/* Core — pulsing red */}
              <Polyline
                positions={arc}
                pathOptions={{
                  ...sharedOpts, color: dark ? "#22D3EE" : "#3A86C8",
                  weight: 16, opacity: 1,
                  className: "route-selected",
                }}
                eventHandlers={{ click: () => onRouteSelect(selectedRoute) }}
              >
                <Tooltip sticky>
                  <strong style={{ color: dark ? "#22D3EE" : "#3A86C8" }}>📍 {selectedRoute}</strong>
                  {speedTxt && <span>&nbsp; {speedTxt}</span>}
                  <span style={{ display: "block", fontSize: 11, opacity: 0.65 }}>Currently selected</span>
                </Tooltip>
              </Polyline>
              {/* Label badge — always shown for selected */}
              <Marker
                position={apex}
                icon={makeLabelIcon(selectedRoute, true, dark)}
                zIndexOffset={1000}
                eventHandlers={{ click: () => onRouteSelect(selectedRoute) }}
              >
                <Tooltip direction="top" offset={[0, -8]}>
                  <strong style={{ color: dark ? "#22D3EE" : "#3A86C8" }}>📍 {selectedRoute}</strong>
                  {speedTxt && <span>&nbsp; {speedTxt}</span>}
                </Tooltip>
              </Marker>
            </Fragment>
          );
        })()}
      </MapContainer>

      {/* ── Legend ─────────────────────────────────────────── */}
      <div style={{
        position: "absolute", bottom: 14, left: 14, zIndex: 1000,
        background: dark ? "rgba(38,35,33,0.92)" : "rgba(255,255,255,0.93)",
        backdropFilter: "blur(10px)",
        border: "1px solid hsl(var(--border))",
        borderRadius: 12, padding: "8px 12px",
        fontSize: 11.5, color: dark ? "#F0F4F8" : "#2B2924",
        pointerEvents: "none",
        boxShadow: dark
          ? "0 4px 20px rgba(0,0,0,0.5)"
          : "0 4px 20px rgba(0,0,0,0.12)",
      }}>
        <p style={{ fontWeight: 800, marginBottom: 7, fontSize: 10,
          opacity: 0.6, textTransform: "uppercase", letterSpacing: "0.07em" }}>
          Legend
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <LegendRow color={dark ? "#22D3EE" : "#3A86C8"} weight={5} label="Selected route" />
          <LegendRow
            color={dark ? "#64748b" : "#475569"}
            weight={3.5} label="Other routes" opacity={0.7}
          />
          <LegendRow color="#6FAE63" weight={3} dashed label="🟢 Airport Expy" />
        </div>
      </div>

      {/* ── Hint ───────────────────────────────────────────── */}
      <div style={{
        position: "absolute", top: 14, right: 14, zIndex: 1000,
        background: dark ? "rgba(38,35,33,0.82)" : "rgba(255,255,255,0.88)",
        backdropFilter: "blur(8px)",
        border: "1px solid hsl(var(--border))",
        borderRadius: 9, padding: "4px 10px",
        fontSize: 11, color: "hsl(var(--muted-foreground))",
        pointerEvents: "none",
      }}>
        Hover for speed · Click to select · Scroll to zoom
      </div>
    </div>
  );
}

/* Tiny legend row helper */
function LegendRow({
  color, weight, label, dashed, opacity = 1,
}: { color: string; weight: number; label: string; dashed?: boolean; opacity?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {dashed ? (
        <svg width={26} height={8} viewBox="0 0 26 8" style={{ flexShrink: 0, opacity }} aria-hidden="true">
          <line x1="0" y1="4" x2="26" y2="4"
            stroke={color} strokeWidth={weight}
            strokeDasharray="6 4" strokeLinecap="round" />
        </svg>
      ) : (
        <svg width={26} height={8} viewBox="0 0 26 8" style={{ flexShrink: 0, opacity }} aria-hidden="true">
          <line x1="0" y1="4" x2="26" y2="4"
            stroke={color} strokeWidth={weight} strokeLinecap="round" />
        </svg>
      )}
      <span>{label}</span>
    </div>
  );
}
