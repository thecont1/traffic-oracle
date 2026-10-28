/**
 * Calendar day-anomaly data layer — Frontend.
 *
 * Parses the pre-computed `csv-calendar-anomalies-bangalore.csv` export from
 * traffic-monitor-lizard. No scoring happens in the browser: the canonical
 * measure (same route, same weekday, same hourly slots, preceding 90 days)
 * lives in `tools/calendar_anomalies.py` upstream.
 *
 * Absent numeric results are blank in the CSV and `null` here — never `0`.
 * A missing, stale, or unsupported export surfaces as an explicit
 * `unavailable` / `unsupported` state; it never silently falls back to the old
 * city-relative colours.
 */

import { useEffect, useMemo, useState } from "react";
import * as Papa from "papaparse";
import { bust } from "./useTrafficData";
import type { TimeOfDay } from "./useTrafficData";

// ============================================================================
// Contract constants
// ============================================================================

/** Method versions this client knows how to render. */
export const SUPPORTED_METHOD_VERSIONS = ["calendar-anomaly-v1"] as const;

/** Every civil date and weekday in the export is anchored to this zone. */
export const CITY_TIMEZONE = "Asia/Kolkata";

export const ANOMALY_CSV_URL = "/api/traffic-csv/csv-calendar-anomalies-bangalore.csv";

const REQUIRED_COLUMNS = [
  "route_code",
  "date",
  "tod_bucket",
  "city_timezone",
  "method_version",
  "observed_slot_mask",
  "expected_slot_mask",
  "status",
] as const;

// ============================================================================
// Types
// ============================================================================

export type AnomalyCategory =
  | "much_better"
  | "better"
  | "usual"
  | "worse"
  | "much_worse";

export type AnomalyStatus =
  | "final"
  | "provisional"
  | "not_started"
  | "not_applicable"
  | "no_observations"
  | "incomplete_window"
  | "insufficient_history"
  | "future";

export const CATEGORY_VALUES: AnomalyCategory[] = [
  "much_better",
  "better",
  "usual",
  "worse",
  "much_worse",
];

const STATUS_VALUES: AnomalyStatus[] = [
  "final",
  "provisional",
  "not_started",
  "not_applicable",
  "no_observations",
  "incomplete_window",
  "insufficient_history",
  "future",
];

/** Categories only ever accompany these statuses. */
export const SCORABLE_STATUSES: AnomalyStatus[] = ["final", "provisional"];

/**
 * Minimum eligible reference dates before a category is emitted.
 * Mirrors MIN_HISTORY_DAYS in tools/calendar_anomalies.py for copy text only —
 * whether a colour is shown is decided by the export's `category` field.
 */
export const MIN_COMPARABLE_DAYS = 8;

export interface CalendarAnomaly {
  routeCode: string;
  /** Civil date in the city timezone, `YYYY-MM-DD`. */
  date: string;
  tod: TimeOfDay;
  methodVersion: string;
  cityTimezone: string;
  referenceClass: string;
  /** Equal-weight mean of the compared hourly slot medians, in minutes. */
  observedMinutes: number | null;
  /** Hours actually compared, in clock order. */
  observedSlots: number[];
  /** Hours a complete window requires. */
  expectedSlots: number[];
  observationCount: number;
  /** City-local collection time of the newest reading, `YYYY-MM-DDTHH:MM`. */
  lastObservedAt: string | null;
  lookbackDays: number | null;
  referenceStart: string | null;
  referenceEndExclusive: string | null;
  referenceDays: number | null;
  typicalMinutes: number | null;
  deltaMinutes: number | null;
  deltaFraction: number | null;
  rankScore: number | null;
  lessCount: number | null;
  tieCount: number | null;
  category: AnomalyCategory | null;
  status: AnomalyStatus;
  qualityFlags: string[];
  distanceMinKm: number | null;
  distanceMaxKm: number | null;
  generatedAt: string;
  sourceRevision: string;
  referenceAuditId: string;
}

export type AnomalyFeedState = "loading" | "ready" | "unavailable" | "unsupported";

export interface CalendarAnomalyFeed {
  state: AnomalyFeedState;
  /** `${routeCode}|${tod}|${date}` → record */
  byKey: Map<string, CalendarAnomaly>;
  methodVersion: string | null;
  generatedAt: string | null;
  /** First and last civil date present in the export (the published window). */
  earliestDate: string | null;
  latestDate: string | null;
  error: string | null;
}

const EMPTY_FEED: CalendarAnomalyFeed = {
  state: "loading",
  byKey: new Map(),
  methodVersion: null,
  generatedAt: null,
  earliestDate: null,
  latestDate: null,
  error: null,
};

export function anomalyKey(routeCode: string, tod: string, date: string): string {
  return `${routeCode}|${tod}|${date}`;
}

/** Records for one route + time filter, keyed by civil date. */
export function anomaliesForRoute(
  feed: CalendarAnomalyFeed,
  routeCode: string,
  tod: TimeOfDay,
): Map<string, CalendarAnomaly> {
  if (!routeCode) return new Map();
  const prefix = `${routeCode}|${tod}|`;
  const out = new Map<string, CalendarAnomaly>();
  for (const [key, record] of feed.byKey) {
    if (key.startsWith(prefix)) out.set(record.date, record);
  }
  return out;
}

// ============================================================================
// Civil-date helpers — never the viewer's timezone
// ============================================================================

export interface CivilDate {
  year: number;
  month: number;
  day: number;
  /** 0 = Sunday … 6 = Saturday, derived from the civil date itself. */
  weekday: number;
}

/** Parse `YYYY-MM-DD` without constructing a viewer-local Date. */
export function parseCivilDate(dateKey: string): CivilDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) {
    return null;
  }
  return { year, month, day, weekday: utc.getUTCDay() };
}

export function toCivilKey(year: number, month1: number, day: number): string {
  return `${year}-${String(month1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Today's civil date in the route city, independent of the viewer's zone. */
export function cityToday(timeZone: string = CITY_TIMEZONE): CivilDate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const pick = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const year = pick("year");
  const month = pick("month");
  const day = pick("day");
  const utc = new Date(Date.UTC(year, month - 1, day));
  return { year, month, day, weekday: utc.getUTCDay() };
}

export function cityTodayKey(timeZone: string = CITY_TIMEZONE): string {
  const today = cityToday(timeZone);
  return toCivilKey(today.year, today.month, today.day);
}

/** Convert an instant (e.g. a Time Traveller cutoff) to its city civil date. */
export function instantToCivilKey(value: Date, timeZone: string = CITY_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const pick = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return toCivilKey(pick("year"), pick("month"), pick("day"));
}

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/**
 * Whether a time-of-day filter covers this weekday at all.
 * Mirrors the window contract in tools/calendar_anomalies.py: weekday buckets
 * are Mon–Fri, `weekends` is Sat–Sun, and `all`/`late_hours` cover every day.
 */
export function todIncludesWeekday(tod: TimeOfDay, weekday: number): boolean {
  switch (tod) {
    case "weekday_morning":
    case "weekday_afternoon":
    case "weekday_evening":
      return weekday >= 1 && weekday <= 5;
    case "weekends":
      return weekday === 0 || weekday === 6;
    default:
      return true;
  }
}

/**
 * True when a civil date predates the export's published window.
 * The upstream file is a rolling 90-day publication, so an early date is not
 * "no observations" — it simply was not published in this file.
 */
export function isBeforePublishedWindow(
  dateKey: string,
  feed: Pick<CalendarAnomalyFeed, "earliestDate">,
): boolean {
  return !!feed.earliestDate && dateKey < feed.earliestDate;
}

/** True when a civil date is outside the selected time-of-day filter. */
export function isDateExcludedByTod(dateKey: string, tod: TimeOfDay): boolean {
  const civil = parseCivilDate(dateKey);
  if (!civil) return false;
  return !todIncludesWeekday(tod, civil.weekday);
}

/** Weekday name for a civil date, with no timezone conversion. */
export function civilWeekdayName(dateKey: string): string {
  const civil = parseCivilDate(dateKey);
  return civil ? WEEKDAY_NAMES[civil.weekday] : "";
}

/** Format a civil date for display without shifting it into the viewer zone. */
export function formatCivilDate(
  dateKey: string,
  options: Intl.DateTimeFormatOptions,
  locale = "en-IN",
): string {
  const civil = parseCivilDate(dateKey);
  if (!civil) return dateKey;
  return new Date(Date.UTC(civil.year, civil.month - 1, civil.day)).toLocaleDateString(
    locale,
    { ...options, timeZone: "UTC" },
  );
}

// ============================================================================
// Parsing
// ============================================================================

function parseNumber(value: string | undefined): number | null {
  if (value === undefined) return null;
  const text = value.trim();
  if (text === "") return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseInteger(value: string | undefined): number | null {
  const parsed = parseNumber(value);
  if (parsed === null) return null;
  return Math.trunc(parsed);
}

/** Decode the export's 24-bit hour mask into ascending hours. */
export function decodeSlotMask(mask: string | undefined): number[] {
  const text = (mask ?? "").trim();
  if (!text) return [];
  const value = Number.parseInt(text, 16);
  if (!Number.isFinite(value)) return [];
  const hours: number[] = [];
  for (let hour = 0; hour < 24; hour += 1) {
    if (value & (1 << hour)) hours.push(hour);
  }
  return hours;
}

function parseCategory(value: string | undefined): AnomalyCategory | null {
  const text = (value ?? "").trim();
  return (CATEGORY_VALUES as string[]).includes(text) ? (text as AnomalyCategory) : null;
}

function parseStatus(value: string | undefined): AnomalyStatus | null {
  const text = (value ?? "").trim();
  return (STATUS_VALUES as string[]).includes(text) ? (text as AnomalyStatus) : null;
}

export interface ParseResult {
  feed: CalendarAnomalyFeed;
}

/** Parse the export CSV into an indexed feed. Pure — used by tests. */
export function parseAnomalyCsv(csvText: string): CalendarAnomalyFeed {
  const normalized = csvText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const parsed = Papa.parse<Record<string, string>>(normalized, {
    header: true,
    skipEmptyLines: true,
  });
  const rows = (parsed.data ?? []).filter((row) => row && typeof row === "object");

  if (rows.length === 0) {
    return { ...EMPTY_FEED, state: "unavailable", error: "Export is empty" };
  }

  const columns = new Set(Object.keys(rows[0]));
  const missing = REQUIRED_COLUMNS.filter((column) => !columns.has(column));
  if (missing.length > 0) {
    return {
      ...EMPTY_FEED,
      state: "unsupported",
      error: `Export is missing columns: ${missing.join(", ")}`,
    };
  }

  const methodVersions = new Set<string>();
  const byKey = new Map<string, CalendarAnomaly>();
  let generatedAt: string | null = null;
  let earliestDate: string | null = null;
  let latestDate: string | null = null;

  for (const row of rows) {
    const methodVersion = (row.method_version ?? "").trim();
    if (methodVersion) methodVersions.add(methodVersion);

    const routeCode = (row.route_code ?? "").trim();
    const date = (row.date ?? "").trim();
    const tod = (row.tod_bucket ?? "").trim() as TimeOfDay;
    const status = parseStatus(row.status);

    if (!routeCode || !parseCivilDate(date) || !status) continue;

    const category = parseCategory(row.category);
    const scorable = SCORABLE_STATUSES.includes(status);

    const record: CalendarAnomaly = {
      routeCode,
      date,
      tod,
      methodVersion,
      cityTimezone: (row.city_timezone ?? "").trim(),
      referenceClass: (row.reference_class ?? "").trim(),
      observedMinutes: parseNumber(row.observed_minutes),
      observedSlots: decodeSlotMask(row.observed_slot_mask),
      expectedSlots: decodeSlotMask(row.expected_slot_mask),
      observationCount: parseInteger(row.observation_count) ?? 0,
      lastObservedAt: (row.last_observed_at ?? "").trim() || null,
      lookbackDays: parseInteger(row.lookback_days),
      referenceStart: (row.reference_start ?? "").trim() || null,
      referenceEndExclusive: (row.reference_end_exclusive ?? "").trim() || null,
      referenceDays: parseInteger(row.reference_days),
      typicalMinutes: parseNumber(row.typical_minutes),
      deltaMinutes: parseNumber(row.delta_minutes),
      deltaFraction: parseNumber(row.delta_fraction),
      rankScore: parseNumber(row.rank_score),
      lessCount: parseInteger(row.less_count),
      tieCount: parseInteger(row.tie_count),
      category: scorable ? category : null,
      status,
      qualityFlags: (row.quality_flags ?? "")
        .split(";")
        .map((flag) => flag.trim())
        .filter(Boolean),
      distanceMinKm: parseNumber(row.distance_min_km),
      distanceMaxKm: parseNumber(row.distance_max_km),
      generatedAt: (row.generated_at ?? "").trim(),
      sourceRevision: (row.source_revision ?? "").trim(),
      referenceAuditId: (row.reference_audit_id ?? "").trim(),
    };

    if (record.generatedAt && (!generatedAt || record.generatedAt > generatedAt)) {
      generatedAt = record.generatedAt;
    }
    if (earliestDate === null || date < earliestDate) earliestDate = date;
    if (latestDate === null || date > latestDate) latestDate = date;
    byKey.set(anomalyKey(routeCode, tod, date), record);
  }

  if (methodVersions.size === 0) {
    return { ...EMPTY_FEED, state: "unsupported", error: "Export has no method_version" };
  }
  for (const version of methodVersions) {
    if (!(SUPPORTED_METHOD_VERSIONS as readonly string[]).includes(version)) {
      return {
        ...EMPTY_FEED,
        state: "unsupported",
        methodVersion: version,
        error: `Unsupported method version: ${version}`,
      };
    }
  }
  if (byKey.size === 0) {
    return { ...EMPTY_FEED, state: "unavailable", error: "Export has no usable rows" };
  }

  return {
    state: "ready",
    byKey,
    methodVersion: [...methodVersions][0] ?? null,
    generatedAt,
    earliestDate,
    latestDate,
    error: null,
  };
}

// ============================================================================
// Fetch hook
// ============================================================================

let feedCache: { key: string; feed: CalendarAnomalyFeed } | null = null;

/**
 * Feed to keep after a failed fetch. A failed *refresh* must not erase a
 * comparison the reader can already see — the error rides along until the next
 * successful load. Only a feed with nothing loaded becomes unavailable.
 */
export function feedAfterFetchError(
  previous: CalendarAnomalyFeed,
  message: string,
): CalendarAnomalyFeed {
  if (previous.state === "ready") {
    return { ...previous, error: message };
  }
  return { ...EMPTY_FEED, state: "unavailable", error: message };
}

/**
 * Load the anomaly export. `refreshKey` should change when new traffic data
 * arrives (the provisional record for the evaluation day changes with it).
 */
export function useCalendarAnomalies(refreshKey?: string | number | null): CalendarAnomalyFeed {
  const key = String(refreshKey ?? "initial");
  const [feed, setFeed] = useState<CalendarAnomalyFeed>(() => {
    return feedCache?.key === key ? feedCache.feed : { ...EMPTY_FEED, state: "loading" };
  });

  useEffect(() => {
    if (feedCache?.key === key) {
      setFeed(feedCache.feed);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    fetch(bust(ANOMALY_CSV_URL), { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.text();
      })
      .then((text) => {
        if (cancelled) return;
        const next = parseAnomalyCsv(text);
        feedCache = { key, feed: next };
        setFeed(next);
      })
      .catch((error: unknown) => {
        if (cancelled || (error as { name?: string })?.name === "AbortError") return;
        const message = error instanceof Error ? error.message : String(error);
        // Keep a successful feed on screen; only a failed first load blanks it.
        setFeed((previous) => feedAfterFetchError(previous, message));
        // Do not cache failures — the next data refresh retries.
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [key]);

  return feed;
}

/** Reset the module cache — test helper. */
export function __clearAnomalyFeedCache(): void {
  feedCache = null;
}

// ============================================================================
// Display helpers
// ============================================================================

export const CATEGORY_LABELS: Record<AnomalyCategory, string> = {
  much_better: "Much better than usual",
  better: "Better than usual",
  usual: "Within the usual range",
  worse: "Worse than usual",
  much_worse: "Much worse than usual",
};

export const STATUS_LABELS: Record<AnomalyStatus, string> = {
  final: "",
  provisional: "Provisional",
  not_started: "Not started yet",
  not_applicable: "Not applicable",
  no_observations: "No observations",
  incomplete_window: "Incomplete coverage",
  insufficient_history: "Not enough comparable history",
  future: "Future date",
};

/** One short phrase for a cell's accessible name and tooltip badge. */
export function categoryText(record: CalendarAnomaly): string {
  if (record.category && SCORABLE_STATUSES.includes(record.status)) {
    return CATEGORY_LABELS[record.category];
  }
  return STATUS_LABELS[record.status] || "No comparable data";
}

export function isScorable(record: CalendarAnomaly | undefined | null): boolean {
  return !!record && !!record.category && SCORABLE_STATUSES.includes(record.status);
}

/** "43.5 min" / "44 min" — one decimal only when it adds information. */
export function formatMinutes(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "–";
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded} min` : `${rounded.toFixed(1)} min`;
}

/** "53%" / "2.4%" — the fraction as a percentage of the typical value. */
export function formatPercent(fraction: number | null): string {
  if (fraction === null || !Number.isFinite(fraction)) return "–";
  const percent = fraction * 100;
  const abs = Math.abs(percent);
  const digits = abs < 10 ? 1 : 0;
  // U+2212 so a negative delta reads the same here and in formatSignedMinutes.
  const sign = percent < 0 ? "−" : "";
  return `${sign}${Math.abs(percent).toFixed(digits)}%`;
}

export function formatSignedMinutes(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "–";
  const rounded = Math.round(Math.abs(value) * 10) / 10;
  const magnitude = Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1);
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${magnitude} min`;
}

/** "About 15.1 min longer, or 53%" — the effect size in people's terms. */
export function describeDelta(record: CalendarAnomaly): string | null {
  if (record.deltaMinutes === null || record.typicalMinutes === null) return null;
  // Round the magnitude, not the signed value: Math.round(-27.5) is -27.
  const magnitude = Math.round(Math.abs(record.deltaMinutes) * 10) / 10;
  const direction = record.deltaMinutes > 0 ? "longer" : "shorter";
  // Direction is already carried by the word; never print "shorter, or -11%".
  const percent = formatPercent(
    record.deltaFraction === null ? null : Math.abs(record.deltaFraction),
  );
  const minutes = Number.isInteger(magnitude) ? `${magnitude}` : magnitude.toFixed(1);
  if (percent === "–") return `About ${minutes} min ${direction}`;
  return `About ${minutes} min ${direction}, or ${percent}`;
}

/** "Longer than all 12 comparable Fridays in the preceding 90 days". */
export function describeRank(record: CalendarAnomaly): string | null {
  const n = record.referenceDays;
  if (!n || record.lessCount === null) return null;

  const weekday = civilWeekdayName(record.date);
  const noun = weekday ? `${weekday}s` : "days";
  const ties = record.tieCount ?? 0;
  const slower = record.lessCount;
  const faster = n - slower - ties;

  if (record.category === "much_worse" || record.category === "worse" || slower >= n - ties) {
    if (slower + ties >= n) {
      return `Longer than all ${n} comparable ${noun} in the preceding ${record.lookbackDays ?? 90} days`;
    }
    return `Longer than ${slower} of ${n} comparable ${noun} in the preceding ${record.lookbackDays ?? 90} days`;
  }
  if (record.category === "much_better" || record.category === "better" || faster > 0) {
    if (faster >= n) {
      return `Faster than all ${n} comparable ${noun} in the preceding ${record.lookbackDays ?? 90} days`;
    }
    return `Faster than ${faster} of ${n} comparable ${noun} in the preceding ${record.lookbackDays ?? 90} days`;
  }
  return null;
}

/** "four hourly estimates" — never a count of completed trips. */
const SAMPLE_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven"];

export function describeSample(record: CalendarAnomaly): string {
  const count = record.observedSlots.length;
  const word = SAMPLE_WORDS[count] ?? String(count);
  if (count === 1) return "one hourly estimate";
  return count > 0 ? `${word} hourly estimates` : "no estimates";
}

/** "18:00, 19:00" — the city-local hours actually compared. */
export function describeSlots(slots: number[]): string {
  return slots.map((hour) => `${String(hour).padStart(2, "0")}:00`).join(", ");
}
