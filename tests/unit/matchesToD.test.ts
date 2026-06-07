import { describe, it, expect } from "bun:test";
import { matchesToD } from "../../src/lib/useTrafficData";

/* ══════════════════════════════════════════════════════════════════ */
/* matchesToD — late_hours + boundary coverage for all tod values    */
/* ══════════════════════════════════════════════════════════════════ */

describe("matchesToD — late_hours (22–5)", () => {
  /* ── hours that must match ─────────────────────────────────────── */
  it("matches h=22 on weekday (Mon)", () => expect(matchesToD(22, 1, "late_hours")).toBe(true));
  it("matches h=23 on weekday (Tue)", () => expect(matchesToD(23, 2, "late_hours")).toBe(true));
  it("matches h=0  on weekday (Wed)", () => expect(matchesToD(0, 3, "late_hours")).toBe(true));
  it("matches h=1  on weekday (Thu)", () => expect(matchesToD(1, 4, "late_hours")).toBe(true));
  it("matches h=4  on weekday (Fri)", () => expect(matchesToD(4, 5, "late_hours")).toBe(true));

  /* ── late_hours must include weekends too ──────────────────────── */
  it("matches h=22 on Saturday", () => expect(matchesToD(22, 6, "late_hours")).toBe(true));
  it("matches h=0  on Sunday",   () => expect(matchesToD(0, 0, "late_hours")).toBe(true));
  it("matches h=4  on Sunday",   () => expect(matchesToD(4, 0, "late_hours")).toBe(true));

  /* ── hours that must NOT match ─────────────────────────────────── */
  it("does NOT match h=5  (first excluded hour)", () => expect(matchesToD(5, 1, "late_hours")).toBe(false));
  it("does NOT match h=6  on weekday",            () => expect(matchesToD(6, 1, "late_hours")).toBe(false));
  it("does NOT match h=21 on weekday",            () => expect(matchesToD(21, 3, "late_hours")).toBe(false));
  it("does NOT match h=5  on weekend",            () => expect(matchesToD(5, 0, "late_hours")).toBe(false));
  it("does NOT match h=12 on Saturday",           () => expect(matchesToD(12, 6, "late_hours")).toBe(false));
});

describe("matchesToD — weekday_morning boundary (8–12)", () => {
  it("matches h=8  on Mon",  () => expect(matchesToD(8,  1, "weekday_morning")).toBe(true));
  it("matches h=11 on Thu",  () => expect(matchesToD(11, 4, "weekday_morning")).toBe(true));
  it("does NOT match h=7",   () => expect(matchesToD(7,  2, "weekday_morning")).toBe(false));
  it("does NOT match h=12",  () => expect(matchesToD(12, 2, "weekday_morning")).toBe(false));
  it("does NOT match Sunday", () => expect(matchesToD(9, 0, "weekday_morning")).toBe(false));
});

describe("matchesToD — weekday_afternoon boundary (12–18)", () => {
  it("matches h=12 on Tue",    () => expect(matchesToD(12, 2, "weekday_afternoon")).toBe(true));
  it("matches h=17 on Fri",    () => expect(matchesToD(17, 5, "weekday_afternoon")).toBe(true));
  it("does NOT match h=11",    () => expect(matchesToD(11, 3, "weekday_afternoon")).toBe(false));
  it("does NOT match h=18",    () => expect(matchesToD(18, 3, "weekday_afternoon")).toBe(false));
  it("does NOT match Saturday", () => expect(matchesToD(14, 6, "weekday_afternoon")).toBe(false));
});

describe("matchesToD — weekday_evening boundary (18–22)", () => {
  it("matches h=18 on Mon",    () => expect(matchesToD(18, 1, "weekday_evening")).toBe(true));
  it("matches h=21 on Wed",    () => expect(matchesToD(21, 3, "weekday_evening")).toBe(true));
  it("does NOT match h=17",    () => expect(matchesToD(17, 2, "weekday_evening")).toBe(false));
  it("does NOT match h=22",    () => expect(matchesToD(22, 2, "weekday_evening")).toBe(false));
  it("does NOT match Sunday",  () => expect(matchesToD(19, 0, "weekday_evening")).toBe(false));
});

describe("matchesToD — weekends", () => {
  it("matches Sunday  any hour", () => expect(matchesToD(14, 0, "weekends")).toBe(true));
  it("matches Saturday any hour", () => expect(matchesToD(9, 6, "weekends")).toBe(true));
  it("does NOT match Monday",    () => expect(matchesToD(10, 1, "weekends")).toBe(false));
  it("does NOT match Friday",    () => expect(matchesToD(10, 5, "weekends")).toBe(false));
});

describe("matchesToD — all", () => {
  it("always true: weekday morning", () => expect(matchesToD(8,  1, "all")).toBe(true));
  it("always true: weekend midnight", () => expect(matchesToD(0, 0, "all")).toBe(true));
  it("always true: late weekday",    () => expect(matchesToD(23, 4, "all")).toBe(true));
});
