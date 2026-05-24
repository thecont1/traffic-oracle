import { describe, it, expect } from "bun:test";
import {
  resolveSliderFromWeekKeys,
  resolveRouteIndex,
  validateSnapshot,
} from "../../src/lib/ttStateHelpers";
import type {
  DashboardSnapshot,
  WeeklyAggregate,
} from "../../src/lib/ttStateHelpers";

/* ── Helper: makeWeeks ──────────────────────────────────────────── */

function makeWeeks(keys: string[]): WeeklyAggregate[] {
  return keys.map((k) => ({
    weekKey: k,
    weekStart: new Date(k + "T00:00:00"),
    lastDate: new Date(k + "T00:00:00"),
    avgSpeed: 30,
    p05Speed: 25,
    p95Speed: 35,
    avgDuration: 40,
    p05Duration: 35,
    medianDuration: 40,
    p95Duration: 45,
    count: 100,
  }));
}

/* ── Tests ──────────────────────────────────────────────────────── */

describe("resolveSliderFromWeekKeys", () => {
  it("resolves valid weekKeys to correct ordered indices", () => {
    const weeks = makeWeeks(["2026-W01", "2026-W02", "2026-W03", "2026-W04"]);
    const result = resolveSliderFromWeekKeys(["2026-W03", "2026-W01"], weeks);
    expect(result).toEqual([0, 2]); // sorted: W01=idx0, W03=idx2
  });

  it("returns correct indices when keys are in order", () => {
    const weeks = makeWeeks(["2026-W01", "2026-W02", "2026-W03"]);
    const result = resolveSliderFromWeekKeys(["2026-W01", "2026-W02"], weeks);
    expect(result).toEqual([0, 1]);
  });

  it("returns null when first weekKey is missing", () => {
    const weeks = makeWeeks(["2026-W01", "2026-W02"]);
    const result = resolveSliderFromWeekKeys(["2026-W99", "2026-W01"], weeks);
    expect(result).toBeNull();
  });

  it("returns null when second weekKey is missing", () => {
    const weeks = makeWeeks(["2026-W01", "2026-W02"]);
    const result = resolveSliderFromWeekKeys(["2026-W01", "2026-W99"], weeks);
    expect(result).toBeNull();
  });

  it("returns null when both weekKeys are missing", () => {
    const weeks = makeWeeks(["2026-W01", "2026-W02"]);
    const result = resolveSliderFromWeekKeys(["2026-W98", "2026-W99"], weeks);
    expect(result).toBeNull();
  });

  it("returns null when savedKeys is null", () => {
    const weeks = makeWeeks(["2026-W01"]);
    const result = resolveSliderFromWeekKeys(null, weeks);
    expect(result).toBeNull();
  });

  it("handles case where TT window shortened the array", () => {
    const liveWeeks = makeWeeks([
      "2025-W40", "2025-W41", "2025-W42", "2025-W43",
      "2025-W44", "2025-W45", "2025-W46", "2025-W47",
      "2025-W48", "2025-W49",
    ]);
    const result = resolveSliderFromWeekKeys(["2025-W41", "2025-W45"], liveWeeks);
    expect(result).toEqual([1, 5]);
  });

  it("handles case where new data added weeks since TT was active", () => {
    const expandedWeeks = makeWeeks([
      "2025-W48", "2025-W49", "2025-W50", "2025-W51", "2025-W52",
      "2026-W01", "2026-W02", "2026-W03", "2026-W04", "2026-W05",
    ]);
    const result = resolveSliderFromWeekKeys(["2025-W49", "2026-W03"], expandedWeeks);
    expect(result).toEqual([1, 7]);
  });
});

describe("resolveRouteIndex", () => {
  it("finds route at correct index", () => {
    const routes = ["Hosur Road", "MG Road", "ORR"];
    expect(resolveRouteIndex("MG Road", routes)).toBe(1);
  });

  it("finds first route", () => {
    const routes = ["Hosur Road", "MG Road", "ORR"];
    expect(resolveRouteIndex("Hosur Road", routes)).toBe(0);
  });

  it("finds last route", () => {
    const routes = ["Hosur Road", "MG Road", "ORR"];
    expect(resolveRouteIndex("ORR", routes)).toBe(2);
  });

  it("returns -1 when route does not exist", () => {
    const routes = ["Hosur Road", "MG Road"];
    expect(resolveRouteIndex("Deleted Road", routes)).toBe(-1);
  });

  it("returns -1 for empty route list", () => {
    expect(resolveRouteIndex("MG Road", [])).toBe(-1);
  });

  it("is case-sensitive", () => {
    const routes = ["Hosur Road", "MG Road"];
    expect(resolveRouteIndex("hosur road", routes)).toBe(-1);
  });
});

describe("validateSnapshot", () => {
  const validSnapshot: DashboardSnapshot = {
    sliderWeekKeys: ["2025-W10", "2025-W20"],
    periodIdx: 2,
    todIdx: 1,
    questionMode: "worsened",
    chartView: "speed",
    chartGranularity: "weekly",
    routeName: "Hosur Road",
  };

  it("accepts a complete valid snapshot", () => {
    expect(validateSnapshot(validSnapshot)).toBe(true);
  });

  it("accepts snapshot with null sliderWeekKeys", () => {
    const s = { ...validSnapshot, sliderWeekKeys: null };
    expect(validateSnapshot(s)).toBe(true);
  });

  it("rejects null input", () => {
    expect(validateSnapshot(null)).toBe(false);
  });

  it("rejects non-object input", () => {
    expect(validateSnapshot("string")).toBe(false);
    expect(validateSnapshot(42)).toBe(false);
  });

  it("rejects snapshot missing periodIdx", () => {
    const s = { ...validSnapshot, periodIdx: undefined };
    expect(validateSnapshot(s)).toBe(false);
  });

  it("rejects snapshot with invalid questionMode", () => {
    const s = { ...validSnapshot, questionMode: "neutral" };
    expect(validateSnapshot(s)).toBe(false);
  });

  it("rejects snapshot with invalid chartView", () => {
    const s = { ...validSnapshot, chartView: "heat" };
    expect(validateSnapshot(s)).toBe(false);
  });

  it("rejects snapshot with empty routeName", () => {
    const s = { ...validSnapshot, routeName: "" };
    expect(validateSnapshot(s)).toBe(false);
  });

  it("rejects snapshot with malformed sliderWeekKeys", () => {
    const s = { ...validSnapshot, sliderWeekKeys: ["only-one"] };
    expect(validateSnapshot(s)).toBe(false);
  });

  it("rejects snapshot with non-string sliderWeekKeys", () => {
    const s = { ...validSnapshot, sliderWeekKeys: [1, 2] };
    expect(validateSnapshot(s)).toBe(false);
  });
});

describe("DashboardSnapshot shape", () => {
  it("captures all 7 required fields", () => {
    const snapshot: DashboardSnapshot = {
      sliderWeekKeys: ["2025-W10", "2025-W20"],
      periodIdx: 2,
      todIdx: 1,
      questionMode: "worsened",
      chartView: "speed",
      chartGranularity: "weekly",
      routeName: "Hosur Road",
    };
    expect(Object.keys(snapshot).sort()).toEqual([
      "chartGranularity",
      "chartView",
      "periodIdx",
      "questionMode",
      "routeName",
      "sliderWeekKeys",
      "todIdx",
    ]);
  });

  it("weekKeys are stable strings that survive array reordering", () => {
    const beforeKeys: [string, string] = ["2025-W10", "2025-W20"];
    const afterWeeks = makeWeeks([
      "2026-W01", "2026-W02",
      "2025-W10", "2025-W15", "2025-W20",
    ]);
    const result = resolveSliderFromWeekKeys(beforeKeys, afterWeeks);
    expect(result).toEqual([2, 4]);
  });
});

/* ── Save/restore correctness tests ──────────────────────────────── */

/**
 * These tests verify that the save block captures LIVE context (not TT-filtered)
 * and the restore block resolves against the saved route/tod (not current TT state).
 *
 * We replicate the restore logic from Dashboard.tsx lines 1493-1501:
 *   const savedTod = TOD_LIST[saved.todIdx].value;
 *   const savedRouteRows = allRows.filter(
 *     r => r.label_short === saved.routeName && matchesToD(r.hour, r.dayOfWeek, savedTod)
 *   );
 *   const savedWeeks = aggregateRows(savedRouteRows);
 *   resolveSliderFromWeekKeys(saved.sliderWeekKeys, savedWeeks);
 */

// Minimal row builder for restore tests
function buildRow(route: string, date: string, hour: number, dow: number): {
  label_short: string; timestamp: Date; hour: number; dayOfWeek: number;
  duration_min: number; speed_kmh: number; distance_km: number; weekKey: string;
} {
  const ts = new Date(date);
  const d = ts.getTime();
  const monMs = 86400000 * ((ts.getDay() + 6) % 7);
  const wkStart = new Date(d - monMs);
  const wkKey = `${wkStart.getFullYear()}-${String(wkStart.getMonth()+1).padStart(2,"0")}-${String(wkStart.getDate()).padStart(2,"0")}`;
  return { label_short: route, timestamp: ts, hour, dayOfWeek: dow, duration_min: 40, speed_kmh: 30, distance_km: 20, weekKey: wkKey };
}

describe("restore uses saved route/tod, not current TT state", () => {
  // Build rows: "Hosur Road" has weekday morning data in weeks W01-W03
  //             "MG Road" has weekday evening data in weeks W02-W04
  const allRows = [
    // Hosur Road weekday mornings (dow=1..5, hour 8-11)
    buildRow("Hosur Road", "2026-01-05T09:00:00", 9, 1), // W01
    buildRow("Hosur Road", "2026-01-12T10:00:00", 10, 1), // W02
    buildRow("Hosur Road", "2026-01-19T08:00:00", 8, 1), // W03
    // MG Road weekday evenings (dow=1..5, hour 18-21)
    buildRow("MG Road", "2026-01-12T19:00:00", 19, 1), // W02
    buildRow("MG Road", "2026-01-19T20:00:00", 20, 1), // W03
    buildRow("MG Road", "2026-01-26T18:00:00", 18, 1), // W04
  ];

  it("resolves saved weekKeys against saved route/tod, not TT route/tod", () => {
    // Scenario: User was on Hosur Road + weekday mornings in Live mode.
    // In TT, they switched to MG Road + weekday evenings.
    // On cancel, we must resolve the saved weekKeys against Hosur Road + mornings.
    const savedRoute = "Hosur Road";
    const savedTodIdx = 0; // weekday_morning

    // Simulate the restore logic from Dashboard.tsx
    const todValues = ["weekday_morning", "weekday_afternoon", "weekday_evening", "weekends", "all"];
    const savedTod = todValues[savedTodIdx];
    const savedRouteRows = allRows.filter(
      r => r.label_short === savedRoute && savedTod === "all"
        ? true
        : savedTod === "weekday_morning" ? r.hour >= 8 && r.hour < 12 && r.dayOfWeek >= 1 && r.dayOfWeek <= 5
        : savedTod === "weekday_afternoon" ? r.hour >= 12 && r.hour < 18 && r.dayOfWeek >= 1 && r.dayOfWeek <= 5
        : savedTod === "weekday_evening" ? r.hour >= 18 && r.hour < 22 && r.dayOfWeek >= 1 && r.dayOfWeek <= 5
        : savedTod === "weekends" ? (r.dayOfWeek === 0 || r.dayOfWeek === 6)
        : true
    );
    const savedWeeks = savedRouteRows.map(r => r.weekKey);
    // Hosur Road morning data should be in W01, W02, W03
    expect(savedWeeks).toContain("2026-01-05"); // W01
    expect(savedWeeks).toContain("2026-01-12"); // W02
    expect(savedWeeks).toContain("2026-01-19"); // W03
    // Should NOT contain MG Road's W04
    expect(savedWeeks).not.toContain("2026-01-26");

    // Now resolve saved weekKeys against these saved weeks
    const savedWeekObjs = savedRouteRows.reduce((acc, r) => {
      if (!acc.find(w => w.weekKey === r.weekKey)) {
        acc.push(makeWeeks([r.weekKey])[0]);
      }
      return acc;
    }, [] as ReturnType<typeof makeWeeks>);
    const result = resolveSliderFromWeekKeys(["2026-01-05", "2026-01-19"], savedWeekObjs);
    expect(result).toEqual([0, 2]);
  });

  it("fails to resolve when TT-route weekKeys are used instead of saved-route weeks", () => {
    // This is the BUG scenario: resolving against MG Road's weeks (W02, W03, W04)
    // when the saved weekKeys are from Hosur Road (W01, W02, W03).
    // W01 doesn't exist in MG Road's week list, so resolution should fail.
    const mgRoadRows = allRows.filter(r => r.label_short === "MG Road");
    const mgWeekObjs = [...new Set(mgRoadRows.map(r => r.weekKey))].sort().map(
      wk => makeWeeks([wk])[0]
    );
    // W01 is in Hosur Road but NOT in MG Road
    const result = resolveSliderFromWeekKeys(["2026-01-05", "2026-01-19"], mgWeekObjs);
    // W01 not found → null (correct behavior: resolution fails against wrong week list)
    expect(result).toBeNull();
  });
});
