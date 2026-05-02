import { useEffect } from "react";
import {
  MapContainer, TileLayer, Polyline, Tooltip, useMap,
} from "react-leaflet";
import { ROUTE_COORDS, BLR_BOUNDS } from "@/lib/routeCoords";

interface RouteInfo {
  label_short: string;
  avgSpeed?: number;
}

interface Props {
  routes: RouteInfo[];
  selectedRoute: string;
  onRouteSelect: (route: string) => void;
  dark: boolean;
}

/* Fit map to Bangalore bounding box on first render */
function FitView() {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(BLR_BOUNDS, { padding: [20, 20] });
  }, [map]);
  return null;
}

const TILE_LIGHT = "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
const TILE_DARK  = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const TILE_ATTR  = '&copy; <a href="https://openstreetmap.org">OpenStreetMap</a> contributors &copy; <a href="https://carto.com">CARTO</a>';

export function TrafficMap({ routes, selectedRoute, onRouteSelect, dark }: Props) {
  return (
    <div style={{
      borderRadius: "1.25rem", overflow: "hidden",
      height: "24rem", border: "1px solid hsl(var(--border))",
      position: "relative",
    }}>
      <MapContainer
        center={[12.97, 77.59]}
        zoom={11}
        style={{ height: "100%", width: "100%" }}
        zoomControl={true}
        scrollWheelZoom={false}
      >
        <FitView />
        <TileLayer url={dark ? TILE_DARK : TILE_LIGHT} attribution={TILE_ATTR} />

        {/* All non-selected routes */}
        {routes.map((route) => {
          const coords = ROUTE_COORDS[route.label_short];
          if (!coords || route.label_short === selectedRoute) return null;
          const isBaseline = route.label_short === "Airport Expy";
          const speedEmoji = route.avgSpeed
            ? route.avgSpeed > 30 ? "⚡" : "🐌"
            : "";
          return (
            <Polyline
              key={route.label_short}
              positions={coords}
              pathOptions={{
                color: isBaseline ? "#22c55e" : dark ? "#94a3b8" : "#334155",
                weight: isBaseline ? 3 : 4,
                opacity: 0.65,
                dashArray: isBaseline ? "8 5" : undefined,
              }}
              eventHandlers={{ click: () => onRouteSelect(route.label_short) }}
            >
              <Tooltip sticky>
                <span style={{ fontWeight: 600 }}>{route.label_short}</span>
                {speedEmoji && route.avgSpeed != null && (
                  <span> &nbsp;{speedEmoji} {route.avgSpeed} km/h</span>
                )}
                <span style={{ display: "block", fontSize: 11, opacity: 0.7 }}>
                  Click to select
                </span>
              </Tooltip>
            </Polyline>
          );
        })}

        {/* Selected route — rendered last so it's on top */}
        {(() => {
          const coords = ROUTE_COORDS[selectedRoute];
          if (!coords) return null;
          const info = routes.find(r => r.label_short === selectedRoute);
          const speedEmoji = info?.avgSpeed
            ? info.avgSpeed > 30 ? "⚡" : "🐌"
            : "";
          return (
            <>
              {/* Glow layer */}
              <Polyline
                key={`${selectedRoute}-glow`}
                positions={coords}
                pathOptions={{
                  color: "#ef4444",
                  weight: 16,
                  opacity: 0.18,
                  className: "route-glow",
                }}
              />
              {/* Main pulsing line */}
              <Polyline
                key={`${selectedRoute}-main`}
                positions={coords}
                pathOptions={{
                  color: "#ef4444",
                  weight: 7,
                  opacity: 1,
                  className: "route-selected",
                }}
              >
                <Tooltip sticky permanent={false}>
                  <span style={{ fontWeight: 700, color: "#dc2626" }}>
                    📍 {selectedRoute}
                  </span>
                  {speedEmoji && info?.avgSpeed != null && (
                    <span> &nbsp;{speedEmoji} {info.avgSpeed} km/h</span>
                  )}
                  <span style={{ display: "block", fontSize: 11, opacity: 0.7 }}>
                    Currently selected
                  </span>
                </Tooltip>
              </Polyline>
            </>
          );
        })()}
      </MapContainer>

      {/* Legend overlay */}
      <div style={{
        position: "absolute", bottom: 12, left: 12, zIndex: 1000,
        background: dark ? "rgba(15,18,40,0.88)" : "rgba(255,255,255,0.9)",
        backdropFilter: "blur(8px)",
        border: "1px solid hsl(var(--border))",
        borderRadius: 10, padding: "6px 10px", fontSize: 12,
        color: dark ? "#f1f5f9" : "#1e293b",
        pointerEvents: "none",
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ display: "inline-block", width: 18, height: 3,
              background: "#ef4444", borderRadius: 2 }} />
            <span>Selected route</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ display: "inline-block", width: 18, height: 2,
              background: dark ? "#94a3b8" : "#334155", borderRadius: 2 }} />
            <span>Other routes</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ display: "inline-block", width: 18, height: 2,
              borderTop: "2px dashed #22c55e" }} />
            <span>🟢 Airport Expy baseline</span>
          </div>
        </div>
      </div>

      {/* Click hint */}
      <div style={{
        position: "absolute", top: 12, right: 12, zIndex: 1000,
        background: dark ? "rgba(15,18,40,0.8)" : "rgba(255,255,255,0.85)",
        backdropFilter: "blur(8px)",
        border: "1px solid hsl(var(--border))",
        borderRadius: 8, padding: "4px 8px", fontSize: 11,
        color: "hsl(var(--muted-foreground))", pointerEvents: "none",
      }}>
        Click a route to select it
      </div>
    </div>
  );
}
