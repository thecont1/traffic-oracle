import { useState, useEffect, useMemo } from "react";
import Papa from "papaparse";
import appConfig from "../config.json";

const WORST_CASE_PCT: number =
  (appConfig as Record<string, number>).worst_case_percentile ?? 95;

const ROUTES_URL =
  "https://raw.githubusercontent.com/thecont1/blr-traffic-monitor/main/csv-routes.csv";
const TRAFFIC_URL =
  "https://raw.githubusercontent.com/thecont1/blr-traffic-monitor/main/csv-bangalore_traffic.csv";

export interface Route {
  route_code: string;
  label_full: string;
  label_short: string;
}

export interface TrafficRow {
  timestamp: Date;
  route_code: string;
  label_short: string;
  duration_min: number;
  distance_km: number;
  speed_kmh: number;
  hour: number;
  dayOfWeek: number;
  weekKey: string;
}

export interface WeeklyAggregate {
  weekKey: string;
  weekStart: Date;
  avgSpeed: number;
  avgDuration: number;
  medianDuration: number;
  p95Duration: number;
  count: number;
  baselineSpeed?: number | null;
  baselineDuration?: number | null;
}

export interface StatsResult {
  mean: number;
  median: number;
  p95: number;
  avgSpeed: number;
  count: number;
}

export type TimePeriod = "1m" | "3m" | "6m" | "1y";
export type TimeOfDay =
  | "weekday_morning"
  | "weekday_afternoon"
  | "weekday_evening"
  | "weekends"
  | "all";

function getCol(row: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && row[k] !== "") return row[k];
    const lk = k.toLowerCase().trim();
    for (const rk of Object.keys(row)) {
      if (rk.toLowerCase().trim() === lk) return row[rk];
    }
  }
  return "";
}

function parseNum(s: string): number {
  const n = parseFloat(s.replace(/,/g, "").trim());
  return isNaN(n) ? 0 : n;
}

function toWeekKey(d: Date): string {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const mon = new Date(d.getFullYear(), d.getMonth(), diff);
  const y = mon.getFullYear();
  const m = String(mon.getMonth() + 1).padStart(2, "0");
  const dd = String(mon.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower);
}

export function matchesToD(hour: number, dow: number, tod: TimeOfDay): boolean {
  if (tod === "all") return true;
  const isWeekend = dow === 0 || dow === 6;
  if (tod === "weekends") return isWeekend;
  if (isWeekend) return false;
  if (tod === "weekday_morning") return hour >= 8 && hour < 12;
  if (tod === "weekday_afternoon") return hour >= 12 && hour < 18;
  if (tod === "weekday_evening") return hour >= 18 && hour < 22;
  return false;
}

export function aggregateRows(rows: TrafficRow[]): WeeklyAggregate[] {
  const byWeek = new Map<string, TrafficRow[]>();
  for (const r of rows) {
    const arr = byWeek.get(r.weekKey) ?? [];
    arr.push(r);
    byWeek.set(r.weekKey, arr);
  }
  return Array.from(byWeek.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekKey, wrows]) => {
      const durations = wrows.map((r) => r.duration_min).sort((a, b) => a - b);
      const speeds = wrows.map((r) => r.speed_kmh);
      const avgSpeed = speeds.reduce((a, b) => a + b, 0) / speeds.length;
      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
      return {
        weekKey,
        weekStart: new Date(weekKey),
        avgSpeed: Math.round(avgSpeed * 10) / 10,
        avgDuration: Math.round(avgDuration * 10) / 10,
        medianDuration: Math.round(percentile(durations, 50) * 10) / 10,
        p95Duration: Math.round(percentile(durations, WORST_CASE_PCT) * 10) / 10,
        count: wrows.length,
      };
    });
}

function computeStats(rows: TrafficRow[]): StatsResult {
  if (rows.length === 0) return { mean: 0, median: 0, p95: 0, avgSpeed: 0, count: 0 };
  const durations = rows.map((r) => r.duration_min).sort((a, b) => a - b);
  const speeds = rows.map((r) => r.speed_kmh);
  return {
    mean:    Math.round((durations.reduce((a, b) => a + b, 0) / durations.length) * 10) / 10,
    median:  Math.round(percentile(durations, 50) * 10) / 10,
    p95:     Math.round(percentile(durations, WORST_CASE_PCT) * 10) / 10,
    avgSpeed:Math.round((speeds.reduce((a, b) => a + b, 0) / speeds.length) * 10) / 10,
    count: rows.length,
  };
}

export function useTrafficData() {
  const [routes,   setRoutes]   = useState<Route[]>([]);
  const [allRows,  setAllRows]  = useState<TrafficRow[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [rowCount, setRowCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const fetchCsv = (url: string): Promise<Record<string, string>[]> =>
      new Promise((resolve, reject) => {
        Papa.parse(url, {
          download: true, header: true, skipEmptyLines: true,
          complete: (r) => resolve(r.data as Record<string, string>[]),
          error: (e) => reject(e),
        });
      });

    Promise.all([fetchCsv(ROUTES_URL), fetchCsv(TRAFFIC_URL)])
      .then(([routesRaw, trafficRaw]) => {
        if (cancelled) return;

        const routeList: Route[] = routesRaw.map((r) => ({
          route_code:  getCol(r, "route_code").trim(),
          label_full:  getCol(r, "label_full").trim(),
          label_short: getCol(r, "label_short").trim(),
        }));

        const routeByCode = new Map<string, Route>();
        for (const rt of routeList) {
          if (rt.route_code) routeByCode.set(rt.route_code, rt);
        }

        const rows: TrafficRow[] = [];
        for (const r of trafficRaw) {
          const dateRaw = getCol(r, "date").trim();
          const timeRaw = getCol(r, "time").trim();
          if (!dateRaw) continue;

          const tsString = timeRaw
            ? `${dateRaw}T${timeRaw}:00`
            : `${dateRaw}T12:00:00`;
          const ts = new Date(tsString);
          if (isNaN(ts.getTime())) continue;

          const rcRaw = getCol(r, "route_code").trim();
          const route = routeByCode.get(rcRaw);
          if (!route) continue;

          const duration_min = parseNum(getCol(r, "duration"));
          const distance_km  = parseNum(getCol(r, "distance")) || 10;

          if (duration_min <= 0 || duration_min > 300) continue;

          const speed_kmh =
            Math.round((distance_km / (duration_min / 60)) * 10) / 10;
          if (speed_kmh <= 0 || speed_kmh > 150) continue;

          rows.push({
            timestamp: ts,
            route_code: route.route_code,
            label_short: route.label_short,
            duration_min: Math.round(duration_min * 10) / 10,
            distance_km,
            speed_kmh,
            hour: ts.getHours(),
            dayOfWeek: ts.getDay(),
            weekKey: toWeekKey(ts),
          });
        }

        setRoutes(routeList);
        setAllRows(rows);
        setRowCount(rows.length);
        setLoading(false);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(String(e?.message ?? e));
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, []);

  return { routes, allRows, loading, error, rowCount };
}

export interface DayStats {
  dateKey: string;
  avgSpeed: number;
  medianDuration: number;
  p95Duration: number;
  count: number;
}

/** Daily aggregates for a route + tod — used by the calendar widget. */
export function useDailyStats(
  allRows: TrafficRow[],
  selectedRoute: string,
  tod: TimeOfDay,
): Map<string, DayStats> {
  return useMemo(() => {
    const rows = allRows.filter(
      (r) => r.label_short === selectedRoute && matchesToD(r.hour, r.dayOfWeek, tod),
    );
    const byDay = new Map<string, TrafficRow[]>();
    for (const r of rows) {
      const d = r.timestamp;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const arr = byDay.get(key) ?? [];
      arr.push(r);
      byDay.set(key, arr);
    }
    const result = new Map<string, DayStats>();
    for (const [dateKey, dayRows] of byDay.entries()) {
      const speeds    = dayRows.map((r) => r.speed_kmh);
      const durations = dayRows.map((r) => r.duration_min).sort((a, b) => a - b);
      result.set(dateKey, {
        dateKey,
        avgSpeed:        Math.round((speeds.reduce((a, b) => a + b, 0) / speeds.length) * 10) / 10,
        medianDuration:  Math.round(percentile(durations, 50) * 10) / 10,
        p95Duration:     Math.round(percentile(durations, WORST_CASE_PCT) * 10) / 10,
        count: dayRows.length,
      });
    }
    return result;
  }, [allRows, selectedRoute, tod]);
}

/** Daily aggregates for a route across ALL time-of-day slots — used by the
 *  calendar widget so it shows a holistic daily snapshot independent of the
 *  Question's ToD filter. */
export function useDailyStatsAllDay(
  allRows: TrafficRow[],
  selectedRoute: string,
): Map<string, DayStats> {
  return useMemo(() => {
    const rows = allRows.filter((r) => r.label_short === selectedRoute);
    const byDay = new Map<string, TrafficRow[]>();
    for (const r of rows) {
      const d = r.timestamp;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const arr = byDay.get(key) ?? [];
      arr.push(r);
      byDay.set(key, arr);
    }
    const result = new Map<string, DayStats>();
    for (const [dateKey, dayRows] of byDay.entries()) {
      const speeds    = dayRows.map((r) => r.speed_kmh);
      const durations = dayRows.map((r) => r.duration_min).sort((a, b) => a - b);
      result.set(dateKey, {
        dateKey,
        avgSpeed:        Math.round((speeds.reduce((a, b) => a + b, 0) / speeds.length) * 10) / 10,
        medianDuration:  Math.round(percentile(durations, 50) * 10) / 10,
        p95Duration:     Math.round(percentile(durations, WORST_CASE_PCT) * 10) / 10,
        count: dayRows.length,
      });
    }
    return result;
  }, [allRows, selectedRoute]);
}

/** Full dataset weekly aggregates for a route + tod — no period cutoff.
 *  Used by the baseline slider so it always spans all available history. */
export function useAllRouteWeeks(
  allRows: TrafficRow[],
  selectedRoute: string,
  tod: TimeOfDay,
): WeeklyAggregate[] {
  return useMemo(() => {
    const rows = allRows.filter(
      (r) =>
        r.label_short === selectedRoute &&
        matchesToD(r.hour, r.dayOfWeek, tod),
    );
    return aggregateRows(rows);
  }, [allRows, selectedRoute, tod]);
}

export function useFilteredData(
  allRows: TrafficRow[],
  selectedRoute: string,
  period: TimePeriod,
  tod: TimeOfDay,
  baselineRoute: string = "Hosur Road",
) {
  return useMemo(() => {
    const now = new Date();
    const cutoff = new Date(now);
    if (period === "1m") cutoff.setMonth(cutoff.getMonth() - 1);
    else if (period === "3m") cutoff.setMonth(cutoff.getMonth() - 3);
    else if (period === "6m") cutoff.setMonth(cutoff.getMonth() - 6);
    else cutoff.setFullYear(cutoff.getFullYear() - 1);

    const filtered = allRows.filter(
      (r) =>
        r.label_short === selectedRoute &&
        r.timestamp >= cutoff &&
        matchesToD(r.hour, r.dayOfWeek, tod),
    );

    const baseline = allRows.filter(
      (r) =>
        r.label_short === baselineRoute &&
        r.label_short !== selectedRoute &&
        r.timestamp >= cutoff &&
        matchesToD(r.hour, r.dayOfWeek, tod),
    );

    const selectedWeekly = aggregateRows(filtered);
    const baselineWeekly = aggregateRows(baseline);
    const selectedStats  = computeStats(filtered);
    const baselineStats  = computeStats(baseline);

    const merged: WeeklyAggregate[] = selectedWeekly.map((sw) => {
      const bw = baselineWeekly.find((b) => b.weekKey === sw.weekKey);
      return {
        ...sw,
        baselineSpeed:    bw?.avgSpeed    ?? null,
        baselineDuration: bw?.avgDuration ?? null,
      };
    });

    return {
      filtered, baseline,
      selectedWeekly, baselineWeekly,
      selectedStats, baselineStats,
      merged,
    };
  }, [allRows, selectedRoute, period, tod, baselineRoute]);
}
