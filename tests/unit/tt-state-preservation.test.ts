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
