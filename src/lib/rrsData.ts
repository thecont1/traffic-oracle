/**
 * R³S² (Rolling Relative Route Scoring System) — Frontend data layer.
 *
 * Fetches and parses the pre-computed R³S² derived CSVs from the
 * traffic-monitor-lizard repo. No canonical scoring is computed in
 * the browser — only light filtering, lookup, and formatting.
 *
 * Data source: GitHub raw via /api/traffic-csv/ proxy (Vite + Cloudflare Worker).
 */

import { useState, useEffect, useMemo } from "react";
import * as Papa from "papaparse";
import { bust } from "./useTrafficData";
import type { TimeOfDay } from "./useTrafficData";

// ============================================================================
// Types
// ============================================================================

/** Single row from rrs-route-day.csv */
export interface RrsRouteDay {
  date: string;
  route_code: string;
  route_label: string;
  tod_bucket: string;
  mean_speed: number;
  trip_count: number;
  daily_rank: number;
  participating_routes: number;
  rrs_daily_points: number;
}

/** Single row from rrs-route-window.csv */
export interface RrsRouteWindow {
  window_end_date: string;
  route_code: string;
  route_label: string;
  tod_bucket: string;
  window_days: number;
  rrs_rolling_score: number;
  routes_in_window: number;
  dates_expected: number;
  dates_present: number;
  trip_count_window: number;
  mean_speed_window: number;
  speed_sd_window: number;
  completeness_ratio: number;
  score_status: string;
  rrs_rank: number;
  speed_cv: number;
  sigma_band_distribution: Record<string, number>;
  daily_z_scores: Record<string, { z: number; band: string }>;
}

/** Summary for display near the calendar */
export interface RrsContext {
  rank: number;
  totalRoutes: number;
  score: number;
  windowDays: number;
  datesPresent: number;
  datesExpected: number;
  meanSpeed: number;
  speedSd: number;
  completeness: number;
  scoreStatus: string;
  volatilityLabel: string;
  routeLabel: string;
  windowEndDate: string;
  /** Per-day audit data for the selected route in the window */
  dailyAudit: RrsDailyAuditRow[];
  /** All routes in the window, for the collapsible debug table */
  allRoutes: RrsRouteWindow[];
  /** Full raw data for the selected route + TOD (for debug) */
  rawData: RrsRouteWindow | null;
}

export interface RrsDailyAuditRow {
  date: string;
  meanSpeed: number;
  dailyRank: number;
  participatingRoutes: number;
  rrsDailyPoints: number;
  cumulativePoints: number;
  zScore: number;
  sigmaBand: string;
  tripCount: number;
}

// ============================================================================
// Constants
// ============================================================================

const RRS_ROUTE_DAY_URL = "/api/traffic-csv/rrs-route-day.csv";
const RRS_ROUTE_WINDOW_URL = "/api/traffic-csv/rrs-route-window.csv";

// ============================================================================
// Parse helpers
// ============================================================================

function parseNum(s: string): number {
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function parseJsonSafe(s: string): Record<string, unknown> {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

/** Map TOD bucket values from backend → frontend (they should match already). */
function normalizeTod(tod: string): string {
  // Backend uses same names as frontend: weekday_morning, weekday_afternoon,
  // weekday_evening, weekends, late_hours, all
  return tod;
}

/** Classify volatility from CV (coefficient of variation). */
function classifyVolatility(cv: number): string {
  if (cv < 0.03) return "very low";
  if (cv < 0.06) return "low";
  if (cv < 0.10) return "moderate";
  if (cv < 0.15) return "medium-high";
  if (cv < 0.25) return "high";
  return "very high";
}

// ============================================================================
// Fetch functions
// ============================================================================

async function fetchCsv(url: string): Promise<Record<string, string>[]> {
  const resp = await fetch(bust(url), { cache: "no-store" });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching ${url}`);
  const text = await resp.text();
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return new Promise((resolve, reject) => {
    Papa.parse(normalized, {
      header: true,
      skipEmptyLines: true,
      complete: (r) => resolve(r.data as Record<string, string>[]),
      error: (e: Error) => reject(e),
    });
  });
}

/** Fetch and parse the route-day R³S² data. */
export async function fetchRrsRouteDay(): Promise<RrsRouteDay[]> {
  const raw = await fetchCsv(RRS_ROUTE_DAY_URL);
  return raw.map((r) => ({
    date: r.date?.trim() ?? "",
    route_code: r.route_code?.trim() ?? "",
    route_label: r.route_label?.trim() ?? "",
    tod_bucket: r.tod_bucket?.trim() ?? "",
    mean_speed: parseNum(r.mean_speed),
    trip_count: parseNum(r.trip_count),
    daily_rank: parseNum(r.daily_rank),
    participating_routes: parseNum(r.participating_routes),
    rrs_daily_points: parseNum(r.rrs_daily_points),
  }));
}

/** Fetch and parse the route-window R³S² data. */
export async function fetchRrsRouteWindow(): Promise<RrsRouteWindow[]> {
  const raw = await fetchCsv(RRS_ROUTE_WINDOW_URL);
  return raw.map((r) => ({
    window_end_date: r.window_end_date?.trim() ?? "",
    route_code: r.route_code?.trim() ?? "",
    route_label: r.route_label?.trim() ?? "",
    tod_bucket: r.tod_bucket?.trim() ?? "",
    window_days: parseNum(r.window_days),
    rrs_rolling_score: parseNum(r.rrs_rolling_score),
    routes_in_window: parseNum(r.routes_in_window),
    dates_expected: parseNum(r.dates_expected),
    dates_present: parseNum(r.dates_present),
    trip_count_window: parseNum(r.trip_count_window),
    mean_speed_window: parseNum(r.mean_speed_window),
    speed_sd_window: parseNum(r.speed_sd_window),
    completeness_ratio: parseNum(r.completeness_ratio),
    score_status: r.score_status?.trim() ?? "",
    rrs_rank: parseNum(r.rrs_rank),
    speed_cv: parseNum(r.speed_cv),
    sigma_band_distribution: parseJsonSafe(r.sigma_band_distribution) as Record<string, number>,
    daily_z_scores: parseJsonSafe(r.daily_z_scores) as Record<string, { z: number; band: string }>,
  }));
}

// ============================================================================
// React hooks
// ============================================================================

/** Hook to load R³S² route-window data. Returns { data, loading, error }. */
export function useRrsData(): {
  routeDay: RrsRouteDay[];
  routeWindow: RrsRouteWindow[];
  loading: boolean;
  error: string | null;
} {
  const [routeDay, setRouteDay] = useState<RrsRouteDay[]>([]);
  const [routeWindow, setRouteWindow] = useState<RrsRouteWindow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([fetchRrsRouteDay(), fetchRrsRouteWindow()])
      .then(([day, window]) => {
        if (cancelled) return;
        setRouteDay(day);
        setRouteWindow(window);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(String(e?.message ?? e));
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  return { routeDay, routeWindow, loading, error };
}

/** Derive R³S² context for a specific route + TOD from the loaded data. */
export function useRrsContext(
  routeWindow: RrsRouteWindow[],
  routeDay: RrsRouteDay[],
  routeCode: string,
  tod: TimeOfDay,
): RrsContext | null {
  return useMemo(() => {
    if (!routeWindow.length || !routeCode) return null;

    // Find the row for this route + TOD
    // TOD mapping: frontend tod matches backend tod_bucket
    const row = routeWindow.find(
      (r) => r.route_code === routeCode && normalizeTod(r.tod_bucket) === tod,
    );

    if (!row) return null;

    // Get all routes for this TOD for the debug table
    const allRoutesForTod = routeWindow
      .filter((r) => normalizeTod(r.tod_bucket) === tod)
      .sort((a, b) => a.rrs_rank - b.rrs_rank);

    // Build daily audit for this route + TOD
    const dailyRows = routeDay
      .filter((r) => r.route_code === routeCode && normalizeTod(r.tod_bucket) === tod)
      .sort((a, b) => a.date.localeCompare(b.date));

    // Filter to the window period
    const windowStart = new Date(row.window_end_date + "T12:00:00");
    windowStart.setDate(windowStart.getDate() - row.window_days + 1);
    const windowStartStr = windowStart.toISOString().split("T")[0];

    const windowDaily = dailyRows.filter(
      (r) => r.date >= windowStartStr && r.date <= row.window_end_date,
    );

    // Build audit with cumulative points
    let cumulative = 0;
    const dailyAudit: RrsDailyAuditRow[] = windowDaily.map((d) => {
      cumulative += d.rrs_daily_points;
      const zData = row.daily_z_scores[d.date];
      return {
        date: d.date,
        meanSpeed: d.mean_speed,
        dailyRank: d.daily_rank,
        participatingRoutes: d.participating_routes,
        rrsDailyPoints: d.rrs_daily_points,
        cumulativePoints: Math.round(cumulative * 100) / 100,
        zScore: zData?.z ?? 0,
        sigmaBand: zData?.band ?? "N/A",
        tripCount: d.trip_count,
      };
    });

    return {
      rank: row.rrs_rank,
      totalRoutes: row.routes_in_window,
      score: row.rrs_rolling_score,
      windowDays: row.window_days,
      datesPresent: row.dates_present,
      datesExpected: row.dates_expected,
      meanSpeed: row.mean_speed_window,
      speedSd: row.speed_sd_window,
      completeness: row.completeness_ratio,
      scoreStatus: row.score_status,
      volatilityLabel: classifyVolatility(row.speed_cv),
      routeLabel: row.route_label || routeCode,
      windowEndDate: row.window_end_date,
      dailyAudit,
      allRoutes: allRoutesForTod,
      rawData: row,
    };
  }, [routeWindow, routeDay, routeCode, tod]);
}
