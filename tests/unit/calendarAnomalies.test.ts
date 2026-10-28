/**
 * Contract tests for the calendar anomaly data layer.
 *
 * The browser never scores days — it parses the upstream export. These tests
 * pin the parser's failure modes (blank ≠ zero, unsupported method version,
 * missing columns) and the civil-date helpers that keep the calendar from
 * shifting a day when the viewer's timezone differs from Asia/Kolkata.
 */

import { describe, it, expect } from "bun:test";
import * as Papa from "papaparse";
import {
  ANOMALY_CSV_URL,
  cityClockTime,
  cityInstant,
  cityMinutesOfDay,
  civilNoonInstant,
  feedAfterFetchError,
  formatCityStamp,
  formatCityTime12h,
  formatCityStampWithWeekday,
  weekKeyForCivil,
  isBeforePublishedWindow,
  CATEGORY_LABELS,
  SUPPORTED_METHOD_VERSIONS,
  anomaliesForRoute,
  anomalyKey,
  categoryText,
  cityToday,
  civilWeekdayName,
  decodeSlotMask,
  describeDelta,
  describeRank,
  formatCivilDate,
  formatMinutes,
  formatPercent,
  formatSignedMinutes,
  instantToCivilKey,
  isScorable,
  parseAnomalyCsv,
  parseCivilDate,
  toCivilKey,
} from "../../src/lib/calendarAnomalies";
import type { CalendarAnomaly } from "../../src/lib/calendarAnomalies";

const HEADERS = [
  "route_code", "route_label", "date", "tod_bucket", "city_timezone",
  "method_version", "reference_class", "observed_minutes", "observed_slot_mask",
  "expected_slot_mask", "observation_count", "last_observed_at", "lookback_days",
  "reference_start", "reference_end_exclusive", "reference_days", "typical_minutes",
  "delta_minutes", "delta_fraction", "rank_score", "less_count", "tie_count",
  "category", "status", "quality_flags", "distance_min_km", "distance_max_km",
  "generated_at", "source_revision", "reference_audit_id",
];

function row(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    route_code: "XMW9+G8|WMJR+V4",
    route_label: "East Outer Ring",
    date: "2025-04-10",
    tod_bucket: "weekday_evening",
    city_timezone: "Asia/Kolkata",
    method_version: "calendar-anomaly-v1",
    reference_class: "same_weekday",
    observed_minutes: "43.5",
    // bit `hour` set → 18,19,20,21 == 0x3c0000
    observed_slot_mask: "3c0000",
    expected_slot_mask: "3c0000",
    observation_count: "8",
    last_observed_at: "2025-04-10T21:05",
    lookback_days: "90",
    reference_start: "2025-01-10",
    reference_end_exclusive: "2025-04-10",
    reference_days: "12",
    typical_minutes: "28.4",
    delta_minutes: "15.1",
    delta_fraction: "0.5317",
    rank_score: "1",
    less_count: "12",
    tie_count: "0",
    category: "much_worse",
    status: "final",
    quality_flags: "",
    distance_min_km: "10.2",
    distance_max_km: "11.4",
    generated_at: "2025-04-11T02:00",
    source_revision: "abc1234",
    reference_audit_id: "ref-1",
    ...overrides,
  };
}

function csv(rows: Record<string, string>[]): string {
  return Papa.unparse(rows, { columns: HEADERS });
}

function first(csvText = csv([row()])): CalendarAnomaly {
  const feed = parseAnomalyCsvText(csvText);
  const record = [...feed.byKey.values()][0];
  if (!record) throw new Error(`no record parsed; state=${feed.state} error=${feed.error}`);
  return record;
}

const parseAnomalyCsvText = parseAnomalyCsv;

/* ── Constants ───────────────────────────────────────────────────── */

describe("contract constants", () => {
  it("keeps the csv- prefix the Worker proxy expects", () => {
    expect(ANOMALY_CSV_URL).toBe("/api/traffic-csv/csv-calendar-anomalies-bangalore.csv");
    expect(ANOMALY_CSV_URL).toContain("/csv-");
  });

  it("declares the method version it can render", () => {
    expect(SUPPORTED_METHOD_VERSIONS).toContain("calendar-anomaly-v1");
  });
});

/* ── Parsing ─────────────────────────────────────────────────────── */

describe("parseAnomalyCsv", () => {
  it("parses a full record", () => {
    const r = first();
    expect(r.routeCode).toBe("XMW9+G8|WMJR+V4");
    expect(r.date).toBe("2025-04-10");
    expect(r.observedMinutes).toBe(43.5);
    expect(r.typicalMinutes).toBe(28.4);
    expect(r.deltaMinutes).toBe(15.1);
    expect(r.category).toBe("much_worse");
    expect(r.status).toBe("final");
    expect(r.referenceDays).toBe(12);
    expect(r.observedSlots).toEqual([18, 19, 20, 21]);
    expect(r.generatedAt).toBe("2025-04-11T02:00");
  });

  it("treats blank numerics as null, never as zero", () => {
    const r = first(csv([row({
      observed_minutes: "", typical_minutes: "", delta_minutes: "", delta_fraction: "",
      rank_score: "", less_count: "", reference_days: "", distance_min_km: "",
    })]));
    expect(r.observedMinutes).toBeNull();
    expect(r.typicalMinutes).toBeNull();
    expect(r.deltaMinutes).toBeNull();
    expect(r.deltaFraction).toBeNull();
    expect(r.rankScore).toBeNull();
    expect(r.lessCount).toBeNull();
    expect(r.referenceDays).toBeNull();
    expect(r.observationCount).toBe(8);
  });

  it("suppresses a category that contradicts a non-scorable status", () => {
    const r = first(csv([row({ status: "incomplete_window", category: "much_worse" })]));
    expect(r.category).toBeNull();
    expect(isScorable(r)).toBe(false);
  });

  it("decodes quality flags and slot masks", () => {
    const r = first(csv([row({ quality_flags: "stale_feed;distance_varied", observed_slot_mask: "1c0000" })]));
    expect(r.qualityFlags).toEqual(["stale_feed", "distance_varied"]);
    expect(r.observedSlots).toEqual([18, 19, 20]);
  });

  it("exposes the published date window", () => {
    const feed = parseAnomalyCsvText(csv([
      row({ date: "2025-04-10" }),
      row({ date: "2025-04-30" }),
      row({ date: "2025-04-20" }),
    ]));
    expect(feed.earliestDate).toBe("2025-04-10");
    expect(feed.latestDate).toBe("2025-04-30");
  });

  it("keeps a loaded feed when a refresh fails", () => {
    const ready = parseAnomalyCsvText(csv([row({ date: "2025-04-10" })]));
    expect(ready.state).toBe("ready");

    // A poll that fails must not erase colours the reader can already see.
    const next = feedAfterFetchError(ready, "HTTP 503");
    expect(next.state).toBe("ready");
    expect(next.byKey).toBe(ready.byKey);
    expect(next.error).toBe("HTTP 503");
  });

  it("reports unavailable when nothing has loaded yet", () => {
    const ready = parseAnomalyCsvText(csv([row({ date: "2025-04-10" })]));
    const loading = { ...ready, state: "loading" as const, byKey: new Map() };

    const next = feedAfterFetchError(loading, "HTTP 503");
    expect(next.state).toBe("unavailable");
    expect(next.error).toBe("HTTP 503");
    expect(next.byKey.size).toBe(0);
  });

  it("keeps route identity separate from the display label", () => {
    const feed = parseAnomalyCsvText(csv([row()]));
    expect([...feed.byKey.keys()]).toEqual([anomalyKey("XMW9+G8|WMJR+V4", "weekday_evening", "2025-04-10")]);
  });

  it("indexes every route × bucket × date", () => {
    const feed = parseAnomalyCsvText(csv([
      row(),
      row({ date: "2025-04-11" }),
      row({ tod_bucket: "weekends" }),
      row({ route_code: "OTHER", route_label: "Other" }),
    ]));
    expect(feed.state).toBe("ready");
    expect(feed.byKey.size).toBe(4);
    expect(feed.generatedAt).toBe("2025-04-11T02:00");
  });

  it("skips malformed rows and dates that are not civil dates", () => {
    const feed = parseAnomalyCsvText(csv([
      row(),
      row({ date: "2025-13-01" }),
      row({ date: "not-a-date" }),
      row({ status: "teleported" }),
    ]));
    expect(feed.state).toBe("ready");
    expect(feed.byKey.size).toBe(1);
  });

  it("reports an unsupported method version instead of guessing", () => {
    const feed = parseAnomalyCsvText(csv([row({ method_version: "calendar-anomaly-v9" })]));
    expect(feed.state).toBe("unsupported");
    expect(feed.byKey.size).toBe(0);
    expect(feed.error).toContain("calendar-anomaly-v9");
  });

  it("reports missing columns instead of rendering a partial contract", () => {
    const text = "route_code,date,tod_bucket,status\nR1,2025-04-10,all,final";
    const feed = parseAnomalyCsvText(text);
    expect(feed.state).toBe("unsupported");
    expect(feed.error).toContain("method_version");
  });

  it("reports an empty export as unavailable", () => {
    const feed = parseAnomalyCsvText("");
    expect(feed.state).toBe("unavailable");
  });

  it("tolerates CRLF line endings", () => {
    const feed = parseAnomalyCsvText(csv([row()]).replace(/\n/g, "\r\n"));
    expect(feed.state).toBe("ready");
    expect(feed.byKey.size).toBe(1);
  });
});

/* ── Per-route selection ─────────────────────────────────────────── */

describe("anomaliesForRoute", () => {
  it("returns only the requested route and time bucket, keyed by date", () => {
    const feed = parseAnomalyCsvText(csv([
      row(),
      row({ date: "2025-04-11" }),
      row({ tod_bucket: "weekends" }),
      row({ route_code: "OTHER", route_label: "Other" }),
    ]));
    const records = anomaliesForRoute(feed, "XMW9+G8|WMJR+V4", "weekday_evening");
    expect([...records.keys()].sort()).toEqual(["2025-04-10", "2025-04-11"]);
  });

  it("returns an empty map for an unknown route or unloaded feed", () => {
    const feed = parseAnomalyCsvText(csv([row()]));
    expect(anomaliesForRoute(feed, "NOPE", "weekday_evening").size).toBe(0);
    expect(anomaliesForRoute(feed, "", "weekday_evening").size).toBe(0);
  });
});

/* ── Civil dates ─────────────────────────────────────────────────── */

describe("civil dates", () => {
  it("derives the weekday from the date itself", () => {
    expect(parseCivilDate("2025-04-10")).toEqual({ year: 2025, month: 4, day: 10, weekday: 4 });
    expect(civilWeekdayName("2025-04-10")).toBe("Thursday");
    expect(civilWeekdayName("2025-10-17")).toBe("Friday");
  });

  it("rejects impossible dates", () => {
    expect(parseCivilDate("2025-02-30")).toBeNull();
    expect(parseCivilDate("2025-13-01")).toBeNull();
    expect(parseCivilDate("10/04/2025")).toBeNull();
  });

  it("formats without shifting into the viewer's timezone", () => {
    expect(formatCivilDate("2025-04-10", { weekday: "long", day: "numeric", month: "long" }))
      .toBe("Thursday, 10 April");
  });

  it("converts an instant to the city's civil date, not the machine's", () => {
    // 2025-04-10T20:00Z is already 11 April in Kolkata (UTC+5:30).
    expect(instantToCivilKey(new Date("2025-04-10T20:00:00Z"))).toBe("2025-04-11");
    // 2025-04-10T18:00Z is still 10 April there.
    expect(instantToCivilKey(new Date("2025-04-10T18:00:00Z"))).toBe("2025-04-10");
  });

  it("exposes today as a city-local civil date", () => {
    const today = cityToday();
    expect(today.month).toBeGreaterThanOrEqual(1);
    expect(today.month).toBeLessThanOrEqual(12);
    expect(toCivilKey(today.year, today.month, today.day)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("distinguishes dates before the published window from empty ones", () => {
    const feed = { earliestDate: "2026-07-30" };
    expect(isBeforePublishedWindow("2026-07-29", feed)).toBe(true);
    expect(isBeforePublishedWindow("2026-07-30", feed)).toBe(false);
    expect(isBeforePublishedWindow("2026-08-01", feed)).toBe(false);
    expect(isBeforePublishedWindow("2025-01-01", { earliestDate: null })).toBe(false);
  });

  it("builds noon on a civil date in city time, not the viewer's", () => {
    // 12:00 Asia/Kolkata is 06:30 UTC, whatever the machine is set to.
    expect(civilNoonInstant("2026-10-16").toISOString()).toBe("2026-10-16T06:30:00.000Z");
    // Round-trips back to the same civil date the calendar clicked.
    expect(instantToCivilKey(civilNoonInstant("2026-10-16"))).toBe("2026-10-16");
    // A zone that observes DST: the offset has to come from the zone, not a constant.
    expect(civilNoonInstant("2026-07-01", "America/New_York").toISOString()).toBe("2026-07-01T16:00:00.000Z");
    expect(civilNoonInstant("2026-01-15", "America/New_York").toISOString()).toBe("2026-01-15T17:00:00.000Z");
    expect(() => civilNoonInstant("16/10/2026")).toThrow(RangeError);
  });

  it("formats a Time Travel stamp on the city clock", () => {
    const instant = new Date("2026-10-16T15:35:00Z");
    expect(formatCityStamp(instant)).toBe("16 Oct '26 · 21:05");
    expect(formatCityStamp(instant, "UTC")).toBe("16 Oct '26 · 15:35");
    // Midnight is 00:00, never 24:00.
    expect(formatCityStamp(new Date("2026-10-15T18:30:00Z"))).toBe("16 Oct '26 · 00:00");
    // The banner variant names the weekday, still on the city's clock.
    expect(formatCityStampWithWeekday(instant)).toBe("Fri 16 Oct '26 · 21:05");
  });

  it("builds any city wall-clock time, not just noon", () => {
    expect(cityInstant("2026-10-16", 21, 5).toISOString()).toBe("2026-10-16T15:35:00.000Z");
    expect(cityInstant("2026-10-16", 0, 0).toISOString()).toBe("2026-10-15T18:30:00.000Z");
    expect(() => cityInstant("16/10/2026", 9, 0)).toThrow(RangeError);
  });

  it("formats the daily observation time on the city clock", () => {
    expect(formatCityTime12h(new Date("2026-04-07T03:00:00Z"))).toBe("8:30 AM");
    expect(formatCityTime12h(new Date("2026-04-07T15:35:00Z"))).toBe("9:05 PM");
    expect(formatCityTime12h(new Date("2026-04-06T18:30:00Z"))).toBe("12:00 AM");
  });

  it("reads minutes-since-midnight on the city clock", () => {
    expect(cityMinutesOfDay(new Date("2026-04-07T03:00:00Z"))).toBe(510); // 08:30
    expect(cityMinutesOfDay(new Date("2026-04-07T15:35:00Z"))).toBe(1265); // 21:05
    expect(cityMinutesOfDay(new Date("2026-04-06T18:30:00Z"))).toBe(0); // midnight
  });

  it("reads the city clock time", () => {
    expect(cityClockTime(new Date("2026-10-16T15:35:00Z"))).toBe("21:05");
    expect(cityClockTime(new Date("2026-10-15T18:30:00Z"))).toBe("00:00");
  });

  it("puts a civil date in its Monday-based week", () => {
    expect(weekKeyForCivil("2026-04-06")).toBe("2026-04-06"); // Monday
    expect(weekKeyForCivil("2026-04-07")).toBe("2026-04-06"); // Tuesday
    expect(weekKeyForCivil("2026-04-12")).toBe("2026-04-06"); // Sunday
    expect(weekKeyForCivil("2026-04-13")).toBe("2026-04-13"); // next Monday
    expect(() => weekKeyForCivil("nope")).toThrow(RangeError);
  });

  it("keeps the timezone in the formatter cache key", () => {
    const ts = new Date("2026-04-07T20:00:00Z");
    expect(instantToCivilKey(ts, "Asia/Kolkata")).toBe("2026-04-08");
    expect(instantToCivilKey(ts, "America/Los_Angeles")).toBe("2026-04-07");
    // Asked again in reverse order: a cached formatter must not bleed zones.
    expect(instantToCivilKey(ts, "America/Los_Angeles")).toBe("2026-04-07");
    expect(instantToCivilKey(ts, "Asia/Kolkata")).toBe("2026-04-08");
  });

  it("gives the same answer on every row of a large batch", () => {
    const keys = new Set<string>();
    for (let i = 0; i < 500; i++) {
      keys.add(instantToCivilKey(new Date(Date.UTC(2026, 3, 7, 3, 0) + i * 60_000)));
    }
    // 08:30 → 16:50 IST, all on 7 April; a formatter reused across rows must not
    // accumulate state or drop a day.
    expect([...keys]).toEqual(["2026-04-07"]);
  });

  it("round-trips a civil key", () => {
    expect(toCivilKey(2025, 4, 9)).toBe("2025-04-09");
  });
});

/* ── Presentation ────────────────────────────────────────────────── */

describe("display helpers", () => {
  const base = first();

  it("formats minutes, percentages and signed deltas", () => {
    expect(formatMinutes(43.5)).toBe("43.5 min");
    expect(formatMinutes(44)).toBe("44 min");
    expect(formatMinutes(null)).toBe("–");
    expect(formatPercent(0.5317)).toBe("53%");
    expect(formatPercent(0.024)).toBe("2.4%");
    expect(formatPercent(null)).toBe("–");
    expect(formatSignedMinutes(15.1)).toBe("+15.1 min");
    expect(formatSignedMinutes(-0.9)).toBe("−0.9 min");
  });

  it("describes the effect size in journey terms", () => {
    expect(describeDelta(base)).toBe("About 15.1 min longer, or 53%");
    expect(describeDelta({ ...base, deltaMinutes: -3.2, deltaFraction: -0.11 }))
      .toBe("About 3.2 min shorter, or 11%");
    // Half-minutes must round away from zero, not toward it (Math.round(-27.5) = -27).
    expect(describeDelta({ ...base, deltaMinutes: -2.75, deltaFraction: -0.0948 }))
      .toBe("About 2.8 min shorter, or 9.5%");
    expect(formatSignedMinutes(-2.75)).toBe("−2.8 min");
    expect(formatPercent(-0.0948)).toBe("−9.5%");
    expect(describeDelta({ ...base, deltaMinutes: null })).toBeNull();
  });

  it("describes the rank against comparable weekdays", () => {
    expect(describeRank({ ...base, lessCount: 12, tieCount: 0, referenceDays: 12 }))
      .toBe("Longer than all 12 comparable Thursdays in the preceding 90 days");
    expect(describeRank({ ...base, lessCount: 9, tieCount: 0, referenceDays: 12 }))
      .toBe("Longer than 9 of 12 comparable Thursdays in the preceding 90 days");
    expect(describeRank({ ...base, category: "much_better", lessCount: 0, tieCount: 0, referenceDays: 12 }))
      .toBe("Faster than all 12 comparable Thursdays in the preceding 90 days");
    expect(describeRank({ ...base, lessCount: null })).toBeNull();
  });

  it("decodes slot masks", () => {
    expect(decodeSlotMask("3c0000")).toEqual([18, 19, 20, 21]);
    expect(decodeSlotMask("000001")).toEqual([0]);
    expect(decodeSlotMask("ffffff")).toHaveLength(24);
    expect(decodeSlotMask("")).toEqual([]);
    expect(decodeSlotMask(undefined)).toEqual([]);
  });

  it("keeps category and status wording separate", () => {
    expect(categoryText(base)).toBe(CATEGORY_LABELS.much_worse);
    expect(categoryText({ ...base, status: "insufficient_history", category: null }))
      .toBe("Not enough comparable history");
  });
});
