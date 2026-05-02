import { useState, useEffect, useMemo } from "react";
import Papa from "papaparse";

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
  | "weekends";

function getCol(row: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && row[k] !== "") return row[k];
    const lk = k.toLowerCase();
    for (const rk of Object.keys(row)) {
      if (rk.toLowerCase() === lk) return row[rk];
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
  const mon = new Date(d);
  mon.setDate(diff);
  return mon.toISOString().slice(0, 10);
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower);
}

function matchesToD(hour: number, dow: number, tod: TimeOfDay): boolean {
  const isWeekend = dow === 0 || dow === 6;
  if (tod === "weekends") return isWeekend;
  if (isWeekend) return false;
  if (tod === "weekday_morning") return hour >= 8 && hour < 12;
  if (tod === "weekday_afternoon") return hour >= 12 && hour < 18;
  if (tod === "weekday_evening") return hour >= 18 && hour < 22;
  return false;
}

function getPeriodCutoff(period: TimePeriod): Date {
  const now = new Date();
  if (period === "1m") return new Date(now.setMonth(now.getMonth() - 1));
  if (period === "3m") return new Date(now.setMonth(now.getMonth() - 3));
  if (period === "6m") return new Date(now.setMonth(now.getMonth() - 6));
  return new Date(now.setFullYear(now.getFullYear() - 1));
}

function aggregateRows(rows: TrafficRow[]): WeeklyAggregate[] {
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
        p95Duration: Math.round(percentile(durations, 95) * 10) / 10,
        count: wrows.length,
      };
    });
}

function computeStats(rows: TrafficRow[]): StatsResult {
  if (rows.length === 0) return { mean: 0, median: 0, p95: 0, avgSpeed: 0, count: 0 };
  const durations = rows.map((r) => r.duration_min).sort((a, b) => a - b);
  const speeds = rows.map((r) => r.speed_kmh);
  return {
    mean: Math.round((durations.reduce((a, b) => a + b, 0) / durations.length) * 10) / 10,
    median: Math.round(percentile(durations, 50) * 10) / 10,
    p95: Math.round(percentile(durations, 95) * 10) / 10,
    avgSpeed: Math.round((speeds.reduce((a, b) => a + b, 0) / speeds.length) * 10) / 10,
    count: rows.length,
  };
}

export function useTrafficData() {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [allRows, setAllRows] = useState<TrafficRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rowCount, setRowCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const fetchCsv = (url: string): Promise<Record<string, string>[]> =>
      new Promise((resolve, reject) => {
        Papa.parse(url, {
          download: true,
          header: true,
          skipEmptyLines: true,
          complete: (r) => resolve(r.data as Record<string, string>[]),
          error: (e) => reject(e),
        });
      });

    Promise.all([fetchCsv(ROUTES_URL), fetchCsv(TRAFFIC_URL)])
      .then(([routesRaw, trafficRaw]) => {
        if (cancelled) return;

        const routeList: Route[] = routesRaw.map((r) => ({
          route_code: getCol(r, "route_code").trim(),
          label_full: getCol(r, "label_full").trim(),
          label_short: getCol(r, "label_short").trim(),
        }));

        const routeByCode = new Map<string, Route>();
        const routeByLabel = new Map<string, Route>();
        for (const rt of routeList) {
          if (rt.route_code) routeByCode.set(rt.route_code.toLowerCase(), rt);
          if (rt.label_short) routeByLabel.set(rt.label_short.toLowerCase(), rt);
          if (rt.label_full) routeByLabel.set(rt.label_full.toLowerCase(), rt);
        }

        const DEFAULT_DISTANCE = 10;

        const rows: TrafficRow[] = [];
        for (const r of trafficRaw) {
          const tsRaw = getCol(r, "timestamp", "datetime", "date", "time", "recorded_at", "created_at");
          if (!tsRaw) continue;
          const ts = new Date(tsRaw);
          if (isNaN(ts.getTime())) continue;

          const rcRaw = getCol(r, "route_code", "route_id").trim().toLowerCase();
          const labelRaw = getCol(r, "label_short", "label", "road", "route", "road_name").trim().toLowerCase();

          let route = routeByCode.get(rcRaw) ?? routeByLabel.get(labelRaw) ?? routeByLabel.get(rcRaw);
          if (!route && rcRaw) {
            for (const [k, v] of routeByCode) {
              if (k.includes(rcRaw) || rcRaw.includes(k)) { route = v; break; }
            }
          }
          if (!route && labelRaw) {
            for (const [k, v] of routeByLabel) {
              if (k.includes(labelRaw) || labelRaw.includes(k)) { route = v; break; }
            }
          }
          if (!route) continue;

          const durationRaw = getCol(r, "duration_min", "duration", "travel_time_min", "travel_time", "time_min", "avg_duration_min");
          const distanceRaw = getCol(r, "distance_km", "distance", "dist_km");
          const speedRaw = getCol(r, "speed_kmh", "speed", "avg_speed_kmh", "avg_speed");

          const duration_min = parseNum(durationRaw);
          const distance_km = parseNum(distanceRaw) || DEFAULT_DISTANCE;
          let speed_kmh = parseNum(speedRaw);
          if (!speed_kmh && duration_min > 0) {
            speed_kmh = distance_km / (duration_min / 60);
          }

          if (duration_min <= 0 || duration_min > 300) continue;
          if (speed_kmh <= 0 || speed_kmh > 150) continue;

          rows.push({
            timestamp: ts,
            route_code: route.route_code,
            label_short: route.label_short,
            duration_min: Math.round(duration_min * 10) / 10,
            distance_km,
            speed_kmh: Math.round(speed_kmh * 10) / 10,
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

export function useFilteredData(
  allRows: TrafficRow[],
  selectedRoute: string,
  period: TimePeriod,
  tod: TimeOfDay,
  baselineRoute: string = "Airport Expy"
) {
  return useMemo(() => {
    const cutoff = getPeriodCutoff(period);

    const filtered = allRows.filter(
      (r) =>
        r.label_short === selectedRoute &&
        r.timestamp >= cutoff &&
        matchesToD(r.hour, r.dayOfWeek, tod)
    );

    const baseline = allRows.filter(
      (r) =>
        r.label_short === baselineRoute &&
        r.timestamp >= cutoff &&
        matchesToD(r.hour, r.dayOfWeek, tod)
    );

    const selectedWeekly = aggregateRows(filtered);
    const baselineWeekly = aggregateRows(baseline);
    const selectedStats = computeStats(filtered);
    const baselineStats = computeStats(baseline);

    const merged = selectedWeekly.map((sw) => {
      const bw = baselineWeekly.find((b) => b.weekKey === sw.weekKey);
      return {
        ...sw,
        baselineSpeed: bw?.avgSpeed ?? null,
        baselineDuration: bw?.avgDuration ?? null,
      };
    });

    let trend: "improved" | "worsened" | "stable" | "insufficient" = "insufficient";
    if (selectedWeekly.length >= 4) {
      const half = Math.floor(selectedWeekly.length / 2);
      const early = selectedWeekly.slice(0, half);
      const late = selectedWeekly.slice(-half);
      const earlyAvg = early.reduce((a, b) => a + b.avgSpeed, 0) / early.length;
      const lateAvg = late.reduce((a, b) => a + b.avgSpeed, 0) / late.length;
      const diff = ((lateAvg - earlyAvg) / earlyAvg) * 100;
      if (diff > 5) trend = "improved";
      else if (diff < -5) trend = "worsened";
      else trend = "stable";
    }

    return {
      filtered,
      baseline,
      selectedWeekly,
      baselineWeekly,
      selectedStats,
      baselineStats,
      merged,
      trend,
    };
  }, [allRows, selectedRoute, period, tod, baselineRoute]);
}
