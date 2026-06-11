// ---------------------------------------------------------------------------
// Traffic NOW! card computation — pure functions.
// Extracted from Dashboard.tsx (lines 800-984).
// ---------------------------------------------------------------------------

import type { TrafficRow, WeatherRow } from "@/lib/useTrafficData";

/* ── Types ────────────────────────────────────────────────────────── */

export type LiveStatus = "unusually-fast" | "faster" | "as-expected" | "slower" | "unusually-slower" | "no-data";

export interface RouteTODStats {
  p05: number;
  p10: number;
  p15: number;
  p50: number;
  p85: number;
  p90: number;
  p95: number;
  count: number;
}

export interface RouteCardData {
  label: string;
  origin: string;
  destination: string;
  liveSpeed: number | null;
  prevSpeed: number | null;
  liveTimestamp: Date | null;
  typical: RouteTODStats | null;
  cityMin: number;
  cityMax: number;
  status: LiveStatus;
  statusText: string;
  sortKey: string;
  weather?: WeatherRow;
  map_link?: string;
}

/* ── Pure computation functions ───────────────────────────────────── */

/** Compute live status based on percentiles. */
export function computeLiveStatus(
  liveSpeed: number | null,
  typical: RouteTODStats | null,
): { status: LiveStatus; statusText: string } {
  if (liveSpeed === null || typical === null) {
    return { status: "no-data", statusText: "no data" };
  }
  if (liveSpeed >= typical.p95) return { status: "unusually-fast", statusText: "unusually fast" };
  if (liveSpeed >= typical.p85) return { status: "faster", statusText: "faster than typical" };
  if (liveSpeed > typical.p15)  return { status: "as-expected", statusText: "typical" };
  if (liveSpeed >= typical.p05) return { status: "slower", statusText: "slower than typical" };
  return { status: "unusually-slower", statusText: "unusually slow" };
}

/** Compute TOD statistics from historical data within ±90 min window over N days. */
export function computeTODStats(
  routeRows: TrafficRow[],
  referenceTime: Date,
  daysBack: number = 90,
  windowMinutes: number = 90,
): RouteTODStats | null {
  const cutoff = new Date(referenceTime.getTime() - daysBack * 24 * 60 * 60 * 1000);
  const refHour = referenceTime.getHours();
  const refMin = referenceTime.getMinutes();
  const refTimeVal = refHour * 60 + refMin;

  const relevantRows = routeRows.filter(r => {
    if (r.timestamp < cutoff) return false;
    const rowTimeVal = r.timestamp.getHours() * 60 + r.timestamp.getMinutes();
    let diff = Math.abs(rowTimeVal - refTimeVal);
    if (diff > 720) diff = 1440 - diff;
    return diff <= windowMinutes;
  });

  if (relevantRows.length < 3) return null;

  const speeds = relevantRows.map(r => r.speed_kmh).sort((a, b) => a - b);
  const n = speeds.length;

  const percentile = (p: number) => {
    const idx = (p / 100) * (n - 1);
    const lower = Math.floor(idx);
    const upper = Math.ceil(idx);
    const weight = idx - lower;
    if (upper >= n) return speeds[n - 1];
    return speeds[lower] * (1 - weight) + speeds[upper] * weight;
  };

  return {
    p05: percentile(5),
    p10: percentile(10),
    p15: percentile(15),
    p50: percentile(50),
    p85: percentile(85),
    p90: percentile(90),
    p95: percentile(95),
    count: n,
  };
}

/** Compute RouteCardData[] for all routes — used by route browser pane. */
export function computeAllRouteCards(
  allRows: TrafficRow[],
  routeOptions: string[],
  routes: { label_short: string; label_full: string; route_code?: string; map_link?: string }[],
  weatherMap?: Map<string, WeatherRow>,
): RouteCardData[] {
  const lastTs = allRows.reduce((mx, r) => Math.max(mx, r.timestamp.getTime()), 0);
  const lastDataDate = lastTs ? new Date(lastTs) : new Date();
  const ninetyDaysAgo = new Date(lastDataDate.getTime() - 90 * 24 * 60 * 60 * 1000);

  const preliminaryCards = routeOptions.map((label) => {
    const routeRows = allRows.filter(r => r.label_short === label);
    const routeMeta = routes.find(r => r.label_short === label);
    const labelFull = routeMeta?.label_full ?? label;
    const map_link = routeMeta?.map_link;
    const arrowIdx = labelFull.indexOf("→");
    const origin = arrowIdx > 0 ? labelFull.slice(0, arrowIdx).trim() : label;
    const destination = arrowIdx > 0 ? labelFull.slice(arrowIdx + 1).trim() : "";

    const recentRows = routeRows.filter(r => r.timestamp >= ninetyDaysAgo);
    const sorted = recentRows.slice().sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    const mostRecent = sorted[0] ?? null;
    const prevReading = sorted[1] ?? null;
    const liveSpeed = mostRecent ? mostRecent.speed_kmh : null;
    const prevSpeed = prevReading ? prevReading.speed_kmh : null;
    const liveTimestamp = mostRecent ? mostRecent.timestamp : null;
    const typical = computeTODStats(routeRows, lastDataDate, 90, 90);

    return { label, origin, destination, liveSpeed, prevSpeed, liveTimestamp, typical, sortKey: label.toLowerCase(), map_link };
  });

  const liveSpeeds = preliminaryCards.map(c => c.liveSpeed).filter((s): s is number => s !== null);
  const cityMin = liveSpeeds.length > 0 ? Math.min(...liveSpeeds) : 0;
  const cityMax = liveSpeeds.length > 0 ? Math.max(...liveSpeeds) : 80;

  const allP05 = preliminaryCards.map(c => c.typical?.p05).filter((v): v is number => v != null);
  const allP95 = preliminaryCards.map(c => c.typical?.p95).filter((v): v is number => v != null);
  const typicalMin = allP05.length > 0 ? Math.min(...allP05) : cityMin;
  const typicalMax = allP95.length > 0 ? Math.max(...allP95) : cityMax;

  const effectiveMin = Math.min(cityMin, typicalMin) - 1;
  const effectiveMax = Math.max(cityMax, typicalMax) + 1;

  return preliminaryCards.map(card => {
    const { status, statusText } = computeLiveStatus(card.liveSpeed, card.typical);
    const routeObj = routes.find(r => r.label_short === card.label);
    const weather = routeObj?.route_code ? weatherMap?.get(routeObj.route_code) : undefined;
    return {
      label: card.label, origin: card.origin, destination: card.destination,
      liveSpeed: card.liveSpeed, prevSpeed: card.prevSpeed, liveTimestamp: card.liveTimestamp,
      typical: card.typical, cityMin: effectiveMin, cityMax: effectiveMax,
      status, statusText, sortKey: card.sortKey, weather,
    };
  });
}

/** Compute TrafficNOW! card data for a SINGLE route — used by mobile. */
export function computeSingleRouteCard(
  allRows: TrafficRow[],
  routeLabel: string,
  routeInfo: { label_full: string; route_code?: string },
  weatherMap?: Map<string, WeatherRow>,
): RouteCardData | null {
  const cards = computeAllRouteCards(allRows, [routeLabel], [{ label_short: routeLabel, ...routeInfo }], weatherMap);
  return cards[0] ?? null;
}
