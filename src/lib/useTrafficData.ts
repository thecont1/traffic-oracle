/// <reference types="vite/client" />
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import * as Papa from "papaparse";
import appConfig from "../config.json";
import type { AppConfig } from "./config";

const cfg = appConfig as AppConfig;
const WORST_CASE_PCT: number = cfg.percentile.worst_case;
const defaultCity = cfg.cities.find(c => c.data_source) ?? cfg.cities[0];
/** Extract the bare filename from a GitHub raw URL and return a same-origin
 *  proxy path.  Works in both dev (Vite proxy) and prod (Worker). */
function toProxyPath(url: string): string {
  try {
    const file = new URL(url).pathname.split('/').pop();
    return file ? `/api/traffic-csv/${file}` : url;
  } catch { return url; }
}

const defaultRoutes  = defaultCity.data_source?.routes_csv  ?? "";
const defaultTraffic = defaultCity.data_source?.traffic_csv ?? "";
const ROUTES_URL  = toProxyPath(defaultRoutes);
const TRAFFIC_URL = toProxyPath(defaultTraffic);

/** Append a cache-busting query param so CDNs never serve a stale copy. */
export function bust(url: string): string {
  return `${url}?t=${Date.now()}`;
}

export interface Route {
  route_code: string;
  label_full: string;
  label_short: string;
  map_link?: string;
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
  /* optional weather snapshot fields — present when the CSV contains them */
  temp_c?: number | null;
  realfeel_c?: number | null;
  humidity_pct?: number | null;
  rsi_flag?: string;
  aqi?: number | null;
}

export interface WeeklyAggregate {
  weekKey: string;
  weekStart: Date;
  /** Actual last timestamp of any row in this week — may be later than weekStart
   *  (e.g. weekKey "2026-05-04" runs Mon–Sun but the last data row could be Friday).
   *  Used for display so the slider shows the real data boundary, not the ISO week start. */
  lastDate: Date;
  avgSpeed: number;
  p05Speed: number; // best typical speed (p05 of weekly speeds — fast end of envelope)
  p95Speed: number; // worst typical speed (p95 of weekly speeds — slow end of envelope)
  avgDuration: number;
  p05Duration: number;
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

export type TimePeriod = "1m" | "1.5m" | "2m" | "3m" | "6m" | "1y";
export type TimeOfDay =
  | "weekday_morning"
  | "weekday_afternoon"
  | "weekday_evening"
  | "weekends"
  | "all";

export function getCol(row: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && row[k] !== "") return row[k];
    const lk = k.toLowerCase().trim();
    for (const rk of Object.keys(row)) {
      if (rk.toLowerCase().trim() === lk && row[rk] !== "") return row[rk];
    }
  }
  return "";
}

export function parseNum(s: string): number {
  const n = parseFloat(s.replace(/,/g, "").trim());
  return isNaN(n) ? 0 : n;
}

export function toWeekKey(d: Date): string {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const mon = new Date(d.getFullYear(), d.getMonth(), diff);
  const y = mon.getFullYear();
  const m = String(mon.getMonth() + 1).padStart(2, "0");
  const dd = String(mon.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export function percentile(sorted: number[], p: number): number {
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
      const speeds = wrows.map((r) => r.speed_kmh).sort((a, b) => a - b);
      const avgSpeed = speeds.reduce((a, b) => a + b, 0) / speeds.length;
      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
      return {
        weekKey,
        weekStart: new Date(weekKey),
        lastDate: new Date(wrows.reduce((max, r) => Math.max(max, r.timestamp.getTime()), 0)),
        avgSpeed: Math.round(avgSpeed * 10) / 10,
        p05Speed: Math.round(percentile(speeds, 5) * 10) / 10,
        p95Speed: Math.round(percentile(speeds, 95) * 10) / 10,
        avgDuration: Math.round(avgDuration * 10) / 10,
        p05Duration: Math.round(percentile(durations, 5) * 10) / 10,
        medianDuration: Math.round(percentile(durations, 50) * 10) / 10,
        p95Duration: Math.round(percentile(durations, WORST_CASE_PCT) * 10) / 10,
        count: wrows.length,
      };
    });
}

export function computeStats(rows: TrafficRow[]): StatsResult {
  if (rows.length === 0)
    return { mean: 0, median: 0, p95: 0, avgSpeed: 0, count: 0 };
  const durations = rows.map((r) => r.duration_min).sort((a, b) => a - b);
  const speeds = rows.map((r) => r.speed_kmh);
  return {
    mean: Math.round((durations.reduce((a, b) => a + b, 0) / durations.length) * 10) / 10,
    median: Math.round(percentile(durations, 50) * 10) / 10,
    p95: Math.round(percentile(durations, WORST_CASE_PCT) * 10) / 10,
    avgSpeed: Math.round((speeds.reduce((a, b) => a + b, 0) / speeds.length) * 10) / 10,
    count: rows.length,
  };
}

/* ── Core fetch — uses fetch() with cache:'no-store' so browsers,
 * CDNs and proxies can never serve a stale CSV response. ──────────── */
export interface CitySource {
  routes_csv: string;
  traffic_csv: string;
}

export function fetchTrafficData(
  signal: AbortSignal | undefined,
  source?: CitySource,
): Promise<{ routes: Route[]; allRows: TrafficRow[]; rowCount: number }> {
  const routesUrl  = source?.routes_csv  ? toProxyPath(source.routes_csv)  : ROUTES_URL;
  const trafficUrl = source?.traffic_csv ? toProxyPath(source.traffic_csv) : TRAFFIC_URL;
  const fetchCsv = async (url: string): Promise<Record<string, string>[]> => {
    const resp = await fetch(bust(url), {
      cache: "no-store",
      signal,
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching ${url}`);
    const text = await resp.text();
    // Normalize Windows line endings (\r\n → \n) so Papa.parse doesn't
    // embed \r into the last field of each row, which corrupts parsing
    // of the final ~1400 rows of the CSV.
    const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    return new Promise<Record<string, string>[]>((resolve, reject) => {
      Papa.parse(normalized, {
        header: true,
        skipEmptyLines: true,
        complete: (r) => resolve(r.data as Record<string, string>[]),
        error: (e: Error) => reject(e),
      });
    });
  };

  let cancelled = false;
  return Promise.all([fetchCsv(routesUrl), fetchCsv(trafficUrl)]).then(
    ([routesRaw, trafficRaw]) => {
      if (cancelled) throw new Error("cancelled");

      const routeList: Route[] = routesRaw.map((r) => ({
        route_code: getCol(r, "route_code").trim(),
        label_full: getCol(r, "label_full").trim(),
        label_short: getCol(r, "label_short").trim(),
        map_link: getCol(r, "map_link").trim() || undefined,
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
        const distance_km = parseNum(getCol(r, "distance")) || 10;

        if (duration_min <= 0 || duration_min > 300) continue;

        const speed_kmh =
          Math.round((distance_km / (duration_min / 60)) * 10) / 10;
        if (speed_kmh <= 0 || speed_kmh > 150) continue;

        const numOrNull = (k: string) => { const v = parseFloat(r[k]); return isNaN(v) ? null : v; };
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
          temp_c: numOrNull("temp"),
          realfeel_c: numOrNull("realfeel"),
          humidity_pct: numOrNull("humidity"),
          rsi_flag: getCol(r, "rsi_flag").trim() || undefined,
          aqi: numOrNull("aqi"),
        });
      }

      return { routes: routeList, allRows: rows, rowCount: rows.length };
    },
  );
}

/* ── Conditional refresh — polls traffic CSV only ───────────────── */
export { toProxyPath as toProxy };

export interface RefreshResult {
  allRows: TrafficRow[];
  rowCount: number;
  dataTimestamp: Date | null;
}

/** Re-fetch just the traffic CSV. Always fetches a fresh copy via cache-busting URL.
 *  `routeByCode` is the existing route lookup from the initial load. */
export async function refreshTrafficData(
  routeByCode: Map<string, Route>,
  signal?: AbortSignal,
  source?: CitySource,
): Promise<RefreshResult> {
  const trafficUrl = source?.traffic_csv
    ? toProxyPath(source.traffic_csv)
    : TRAFFIC_URL;
  const resp = await fetch(bust(trafficUrl), {
    cache: "no-store",
    signal,
  });

  if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching traffic CSV`);

  const text = await resp.text();
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const trafficRaw: Record<string, string>[] = await new Promise(
    (resolve, reject) => {
      Papa.parse(normalized, {
        header: true,
        skipEmptyLines: true,
        complete: (r) => resolve(r.data as Record<string, string>[]),
        error: (e: Error) => reject(e),
      });
    },
  );

  // Parse into TrafficRow[]
  const newRows: TrafficRow[] = [];
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
    const distance_km = parseNum(getCol(r, "distance")) || 10;
    if (duration_min <= 0 || duration_min > 300) continue;

    const speed_kmh =
      Math.round((distance_km / (duration_min / 60)) * 10) / 10;
    if (speed_kmh <= 0 || speed_kmh > 150) continue;

    const numOrNull2 = (k: string) => { const v = parseFloat(r[k]); return isNaN(v) ? null : v; };
    newRows.push({
      timestamp: ts,
      route_code: route.route_code,
      label_short: route.label_short,
      duration_min: Math.round(duration_min * 10) / 10,
      distance_km,
      speed_kmh,
      hour: ts.getHours(),
      dayOfWeek: ts.getDay(),
      weekKey: toWeekKey(ts),
      temp_c: numOrNull2("temp"),
      realfeel_c: numOrNull2("realfeel"),
      humidity_pct: numOrNull2("humidity"),
      rsi_flag: getCol(r, "rsi_flag").trim() || undefined,
      aqi: numOrNull2("aqi"),
    });
  }

  // Sort by timestamp for consistency
  newRows.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  // Compute latest data timestamp
  let maxTs = 0;
  for (const r of newRows) {
    const t = r.timestamp.getTime();
    if (t > maxTs) maxTs = t;
  }

  return {
    allRows: newRows,
    rowCount: newRows.length,
    dataTimestamp: maxTs > 0 ? new Date(maxTs) : null,
  };
}

export function useTrafficData(citySource?: CitySource | null, timeTravelDate?: Date | null) {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [allRows, setAllRows] = useState<TrafficRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rowCount, setRowCount] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [dataTimestamp, setDataTimestamp] = useState<Date | null>(null);

  /* Refs for polling — values persist across renders without triggering re-renders */
  const routeByCodeRef = useRef<Map<string, Route>>(new Map());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollingActiveRef = useRef(false);

  const fetchData = useCallback(
    (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      setRowCount(0);

      fetchTrafficData(signal, citySource ?? undefined)
        .then(({ routes: rl, allRows: ar, rowCount: rc }) => {
          setRoutes(rl);
          setAllRows(ar);
          setRowCount(rc);
          setLastUpdated(new Date());

          // Build routeByCode lookup for future conditional refreshes
          const byCode = new Map<string, Route>();
          for (const rt of rl) {
            if (rt.route_code) byCode.set(rt.route_code, rt);
          }
          routeByCodeRef.current = byCode;

          // Compute the actual latest data timestamp
          let maxTs = 0;
          for (const row of ar) {
            const t = row.timestamp.getTime();
            if (t > maxTs) maxTs = t;
          }
          setDataTimestamp(maxTs > 0 ? new Date(maxTs) : null);
          setLoading(false);
        })
        .catch((e) => {
          if (e?.name === "AbortError" || e?.message === "cancelled") return;
          setError(String(e?.message ?? e));
          setLoading(false);
        });
    },
    [citySource],
  );

  /* ── Silent background poll ─────────────────────────────────────── */
  const doPoll = useCallback(() => {
    // Don't poll if initial load hasn't finished, or route data isn't ready
    if (routeByCodeRef.current.size === 0) return;
    // Don't poll if the tab is hidden (Page Visibility API)
    if (typeof document !== "undefined" && document.hidden) return;

    const ctrl = new AbortController();
    refreshTrafficData(
      routeByCodeRef.current,
      ctrl.signal,
      citySource ?? undefined,
    )
      .then((result) => {
        setAllRows(result.allRows);
        setRowCount(result.rowCount);
        setDataTimestamp(result.dataTimestamp);
        setLastUpdated(new Date());
        pollingActiveRef.current = true;
      })
      .catch(() => {
        // Silently swallow errors from background polls —
        // keep showing the last known data. Network hiccup or
        // GitHub rate limit is not user-facing.
      });
  }, [citySource]);

  /* Page Visibility: skip ticks when tab is hidden */
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden) {
        // Tab hidden — clear interval to avoid wasted requests
        if (intervalRef.current !== null) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      } else {
        // Tab visible again — do an immediate poll, then restart interval
        doPoll();
        const intervalMs = (cfg.route_pane.polling_interval_min ?? 10) * 60 * 1000;
        intervalRef.current = setInterval(doPoll, intervalMs);
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [doPoll]);

  /* Initial load on mount */
  useEffect(() => {
    const ctrl = new AbortController();
    fetchData(ctrl.signal);
    return () => {
      ctrl.abort();
    };
  }, [fetchData]);

  /* Start polling interval after initial data load completes — skip when time-travelling */
  useEffect(() => {
    if (timeTravelDate) {
      // Clear any running interval when time travel is active
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }
    if (!loading && routeByCodeRef.current.size > 0 && intervalRef.current === null) {
      const intervalMs = (cfg.route_pane.polling_interval_min ?? 10) * 60 * 1000;
      intervalRef.current = setInterval(doPoll, intervalMs);
    }
  }, [loading, doPoll, timeTravelDate]);

  /* Manual refresh — exposed to the caller */
  const refresh = useCallback(() => {
    const ctrl = new AbortController();
    fetchData(ctrl.signal);
    return () => {
      ctrl.abort();
    };
  }, [fetchData]);

  return { routes, allRows, loading, error, rowCount, lastUpdated, dataTimestamp, refresh };
}

/** Build a WeatherRow map from historical TrafficRow data — used during time
 *  travel so the right pane shows weather values from the travel date rather
 *  than the live weather snapshot CSV. */
export function buildWeatherMapFromRows(rows: TrafficRow[]): Map<string, WeatherRow> {
  const map = new Map<string, WeatherRow>();
  /* pick the most recent row per route_code that has at least one weather field */
  const best = new Map<string, TrafficRow>();
  for (const r of rows) {
    if (r.temp_c == null && r.humidity_pct == null && r.aqi == null) continue;
    const prev = best.get(r.route_code);
    if (!prev || r.timestamp > prev.timestamp) best.set(r.route_code, r);
  }
  for (const [rc, r] of best.entries()) {
    map.set(rc, {
      route_code: rc,
      aqi: r.aqi ?? null,
      aqi_category: "",
      condition: r.rsi_flag ?? "",
      temp_c: r.temp_c ?? null,
      temp_flag: "",
      realfeel_c: r.realfeel_c ?? null,
      realfeel_word: "",
      humidity_pct: r.humidity_pct ?? null,
      wind_gust_kmh: null,
      uv_index: null,
    });
  }
  return map;
}

/* ── Weather snapshot ──────────────────────────────────────────── */
export interface WeatherRow {
  route_code: string;
  aqi: number | null;
  aqi_category: string;
  condition: string;
  temp_c: number | null;
  temp_flag: string;
  realfeel_c: number | null;
  realfeel_word: string;
  humidity_pct: number | null;
  wind_gust_kmh: number | null;
  uv_index: number | null;
}

const WEATHER_URL = "/api/traffic-csv/csv-weather-snapshot.csv";

async function fetchWeatherData(signal?: AbortSignal): Promise<Map<string, WeatherRow>> {
  const resp = await fetch(bust(WEATHER_URL), { cache: "no-store", signal });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching weather CSV`);
  const text = await resp.text();
  const raw: Record<string, string>[] = await new Promise((resolve, reject) => {
    Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      complete: (r) => resolve(r.data as Record<string, string>[]),
      error: (e: Error) => reject(e),
    });
  });
  const map = new Map<string, WeatherRow>();
  for (const r of raw) {
    const rc = (r["route_code"] ?? "").trim();
    if (!rc) continue;
    const num = (k: string) => { const v = parseFloat(r[k]); return isNaN(v) ? null : v; };
    map.set(rc, {
      route_code: rc,
      aqi: num("aqi"),
      aqi_category: (r["aqi_flag"] ?? "").trim(),
      condition: (r["rsi_flag"] ?? "").trim(),
      temp_c: num("temp"),
      temp_flag: (r["temp_flag"] ?? "").trim(),
      realfeel_c: num("realfeel"),
      realfeel_word: (r["realfeel_flag"] ?? "").trim(),
      humidity_pct: num("humidity"),
      wind_gust_kmh: null,
      uv_index: null,
    });
  }
  return map;
}

export function useWeatherData(): Map<string, WeatherRow> {
  const [weatherMap, setWeatherMap] = useState<Map<string, WeatherRow>>(new Map());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inflightRef = useRef<AbortController | null>(null);

  const load = useCallback((signal?: AbortSignal) => {
    fetchWeatherData(signal)
      .then(setWeatherMap)
      .catch((e) => {
        if (e?.name === "AbortError") return;
        console.warn("[useWeatherData] fetch failed:", e?.message ?? e);
      });
  }, []);

  const doPoll = useCallback(() => {
    if (typeof document !== "undefined" && document.hidden) return;
    // Abort any in-flight request before starting a new one
    if (inflightRef.current) inflightRef.current.abort();
    const ctrl = new AbortController();
    inflightRef.current = ctrl;
    load(ctrl.signal);
  }, [load]);

  useEffect(() => {
    // Initial load
    const ctrl = new AbortController();
    inflightRef.current = ctrl;
    load(ctrl.signal);

    const intervalMs = (cfg.route_pane.polling_interval_min ?? 10) * 60 * 1000;
    intervalRef.current = setInterval(doPoll, intervalMs);

    // Page Visibility: pause when hidden, immediately poll when visible again
    const onVisibilityChange = () => {
      if (document.hidden) {
        if (intervalRef.current !== null) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      } else {
        doPoll();
        intervalRef.current = setInterval(doPoll, intervalMs);
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      if (inflightRef.current) inflightRef.current.abort();
      if (intervalRef.current !== null) clearInterval(intervalRef.current);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [load, doPoll]);

  return weatherMap;
}

export interface DayStats {
  dateKey: string;
  avgSpeed: number;
  p05Speed: number;
  p95Speed: number;
  avgDuration: number;
  p05Duration: number;
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
      const speeds = dayRows.map((r) => r.speed_kmh);
      const durations = dayRows.map((r) => r.duration_min).sort((a, b) => a - b);
      const sortedSpeeds = [...speeds].sort((a, b) => a - b);
      result.set(dateKey, {
        dateKey,
        avgSpeed: Math.round((speeds.reduce((a, b) => a + b, 0) / speeds.length) * 10) / 10,
        p05Speed: Math.round(percentile(sortedSpeeds, 5) * 10) / 10,
        p95Speed: Math.round(percentile(sortedSpeeds, 95) * 10) / 10,
        avgDuration: Math.round((durations.reduce((a, b) => a + b, 0) / durations.length) * 10) / 10,
        p05Duration: Math.round(percentile(durations, 5) * 10) / 10,
        medianDuration: Math.round(percentile(durations, 50) * 10) / 10,
        p95Duration: Math.round(percentile(durations, WORST_CASE_PCT) * 10) / 10,
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
      const speeds = dayRows.map((r) => r.speed_kmh);
      const durations = dayRows.map((r) => r.duration_min).sort((a, b) => a - b);
      const sortedSpeeds = [...speeds].sort((a, b) => a - b);
      result.set(dateKey, {
        dateKey,
        avgSpeed: Math.round((speeds.reduce((a, b) => a + b, 0) / speeds.length) * 10) / 10,
        p05Speed: Math.round(percentile(sortedSpeeds, 5) * 10) / 10,
        p95Speed: Math.round(percentile(sortedSpeeds, 95) * 10) / 10,
        avgDuration: Math.round((durations.reduce((a, b) => a + b, 0) / durations.length) * 10) / 10,
        p05Duration: Math.round(percentile(durations, 5) * 10) / 10,
        medianDuration: Math.round(percentile(durations, 50) * 10) / 10,
        p95Duration: Math.round(percentile(durations, WORST_CASE_PCT) * 10) / 10,
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
    const lastDataMs = allRows.reduce(
      (max, r) => Math.max(max, r.timestamp.getTime()),
      0,
    );

    // Cutoff date for the Question's selected time window.
    // NOTE: PERIOD_LIST includes 1.5m and 2m (45/60 days) so we must
    // handle those explicitly; otherwise we'd fall back to the 1-year window.
    const cutoff = new Date(lastDataMs || Date.now());
    if      (period === "1m")   cutoff.setDate(cutoff.getDate() - 30);
    else if (period === "1.5m") cutoff.setDate(cutoff.getDate() - 45);
    else if (period === "2m")   cutoff.setDate(cutoff.getDate() - 60);
    else if (period === "3m")   cutoff.setMonth(cutoff.getMonth() - 3);
    else if (period === "6m")   cutoff.setMonth(cutoff.getMonth() - 6);
    else                         cutoff.setFullYear(cutoff.getFullYear() - 1);

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
    const selectedStats = computeStats(filtered);
    const baselineStats = computeStats(baseline);

    const merged: WeeklyAggregate[] = selectedWeekly.map((sw) => {
      const bw = baselineWeekly.find((b) => b.weekKey === sw.weekKey);
      return {
        ...sw,
        baselineSpeed: bw?.avgSpeed ?? null,
        baselineDuration: bw?.avgDuration ?? null,
      };
    });

    // Daily aggregation for the chart
    const byDay = new Map<string, TrafficRow[]>();
    for (const r of filtered) {
      const d = r.timestamp;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const arr = byDay.get(key) ?? [];
      arr.push(r);
      byDay.set(key, arr);
    }
    const dailyData: DayStats[] = Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dateKey, dayRows]) => {
        const speeds = dayRows.map((r) => r.speed_kmh);
        const durations = dayRows.map((r) => r.duration_min).sort((a, b) => a - b);
        const sortedSpeeds = [...speeds].sort((a, b) => a - b);
        return {
          dateKey,
          avgSpeed: Math.round((speeds.reduce((a, b) => a + b, 0) / speeds.length) * 10) / 10,
          p05Speed: Math.round(percentile(sortedSpeeds, 5) * 10) / 10,
          p95Speed: Math.round(percentile(sortedSpeeds, 95) * 10) / 10,
          avgDuration: Math.round((durations.reduce((a, b) => a + b, 0) / durations.length) * 10) / 10,
          p05Duration: Math.round(percentile(durations, 5) * 10) / 10,
          medianDuration: Math.round(percentile(durations, 50) * 10) / 10,
          p95Duration: Math.round(percentile(durations, WORST_CASE_PCT) * 10) / 10,
          count: dayRows.length,
        };
      });

    return {
      filtered,
      baseline,
      selectedWeekly,
      baselineWeekly,
      selectedStats,
      baselineStats,
      merged,
      dailyData,
    };
  }, [allRows, selectedRoute, period, tod, baselineRoute]);
}