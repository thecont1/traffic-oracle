/**
 * Integration tests for CalendarWidget (bar-based design).
 *
 * Renders the component inside a ThemeProvider with known fixture data
 * and asserts:
 *   1. 42 cells rendered (6 rows × 7 cols).
 *   2. Day headers (Mon–Sun) are present.
 *   3. Legend shows Fast/Slow labels.
 *   4. Dates with enough readings (≥15) render a bar with marks.
 *   5. Dates with fewer than 15 readings get dashed outline.
 *   6. Clicking a date with enough data fires onDateClick.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { CalendarWidget } from "../../src/components/CalendarWidget";
import { ThemeProvider } from "../../src/lib/ThemeContext";
import type { DayStats } from "../../src/lib/useTrafficData";

/* ── Helpers ─────────────────────────────────────────────────────── */

function ds(avgSpeed: number): DayStats {
  return {
    dateKey: "",
    avgSpeed,
    minSpeed: avgSpeed - 5,
    maxSpeed: avgSpeed + 5,
    minTime: "8:00 AM",
    maxTime: "10:00 PM",
    p05Speed: avgSpeed - 8,
    p95Speed: avgSpeed + 8,
    avgDuration: 0,
    p05Duration: 0,
    medianDuration: 0,
    p95Duration: 0,
    count: 20,
  };
}

/** Build a daySpeeds Map with N readings per day spread over 30 days. */
function buildDaySpeeds(
  baseSpeed: number,
  readingsPerDay: number,
  year: number,
  month: number,
): Map<string, number[]> {
  const map = new Map<string, number[]>();
  const base = new Date(year, month, 15).getTime();
  for (let i = 1; i <= 30; i++) {
    const d = new Date(base - i * 86400000);
    const key = d.toISOString().slice(0, 10);
    const speeds: number[] = [];
    for (let j = 0; j < readingsPerDay; j++) {
      speeds.push(baseSpeed + (j % 10) - 5); // spread ±5 around base
    }
    map.set(key, speeds);
  }
  return map;
}

/** Build allDayStats from daySpeeds for globalScale. */
function buildAllDayStats(daySpeeds: Map<string, number[]>): Map<string, DayStats> {
  const map = new Map<string, DayStats>();
  for (const [key, speeds] of daySpeeds) {
    const sorted = speeds.slice().sort((a, b) => a - b);
    const avg = speeds.reduce((a, b) => a + b, 0) / speeds.length;
    map.set(key, {
      ...ds(avg),
      dateKey: key,
      minSpeed: sorted[0],
      maxSpeed: sorted[sorted.length - 1],
      avgSpeed: avg,
      count: speeds.length,
    });
  }
  return map;
}

/** Render CalendarWidget wrapped in ThemeProvider. */
function renderCal(
  daySpeeds: Map<string, number[]>,
  allDayStats?: Map<string, DayStats>,
  year?: number,
  month?: number,
  onDateClick?: (dk: string) => void,
) {
  const now = new Date();
  return render(
    <ThemeProvider initialTheme="colour">
      <CalendarWidget
        daySpeeds={daySpeeds}
        allDayStats={allDayStats ?? buildAllDayStats(daySpeeds)}
        fmtDur={(n: number) => `${Math.round(n)} min`}
        widgetCalYear={year ?? now.getFullYear()}
        widgetCalMonth={month ?? now.getMonth()}
        onDateClick={onDateClick}
      />
    </ThemeProvider>,
  );
}

/* ── Tests ───────────────────────────────────────────────────────── */

describe("CalendarWidget integration (bar design)", () => {
  beforeEach(() => cleanup());

  it("renders 42 cells in the calendar grid", () => {
    const speeds = buildDaySpeeds(30, 20, 2025, 3); // April 2025, 20 readings each
    const { container } = renderCal(speeds, undefined, 2025, 3);

    // Find the grid that contains day cells
    const dayNums = container.querySelectorAll("span");
    const cellParents: Element[] = [];
    dayNums.forEach(span => {
      const num = parseInt(span.textContent || "", 10);
      if (num >= 1 && num <= 31) {
        const wrapper = span.parentElement;
        if (wrapper && wrapper.parentElement) cellParents.push(wrapper);
      }
    });
    const grids = new Set(cellParents.map(el => el.parentElement));
    expect(grids.size).toBe(1);
    const grid = grids.values().next().value!;
    expect(grid.children.length).toBe(42);
  });

  it("renders day headers Mon–Sun", () => {
    const speeds = buildDaySpeeds(30, 20, 2025, 3);
    renderCal(speeds, undefined, 2025, 3);
    for (const day of ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]) {
      expect(screen.getByText(day)).toBeTruthy();
    }
  });

  it("shows legend with Fast/Slow labels", () => {
    const speeds = buildDaySpeeds(30, 20, 2025, 3);
    renderCal(speeds, undefined, 2025, 3);
    expect(screen.getByText("Fast")).toBeTruthy();
    expect(screen.getByText("Slow")).toBeTruthy();
  });

  it("dates with ≥15 readings get data-dk attribute (tooltip target)", () => {
    const speeds = buildDaySpeeds(30, 20, 2025, 3);
    speeds.set("2025-04-10", Array.from({ length: 20 }, (_, i) => 25 + i));
    renderCal(speeds, undefined, 2025, 3);

    const cell = document.querySelector('[data-dk="2025-04-10"]');
    expect(cell).toBeTruthy();
  });

  it("dates with <15 readings get no data-dk (dashed outline)", () => {
    const speeds = buildDaySpeeds(30, 20, 2025, 3);
    // Override April 10 with only 5 readings — below threshold
    speeds.set("2025-04-10", [20, 21, 22, 23, 24]);
    renderCal(speeds, undefined, 2025, 3);

    const cell = document.querySelector('[data-dk="2025-04-10"]');
    expect(cell).toBeNull(); // no data-dk because < 15 readings
  });

  it("fires onDateClick when clicking a date with enough data", () => {
    const clicked: string[] = [];
    const speeds = buildDaySpeeds(30, 20, 2025, 3);
    speeds.set("2025-04-10", Array.from({ length: 20 }, () => 30));
    renderCal(speeds, undefined, 2025, 3, (dk) => clicked.push(dk));

    const cell = document.querySelector('[data-dk="2025-04-10"]');
    expect(cell).toBeTruthy();
    fireEvent.click(cell!);
    expect(clicked).toEqual(["2025-04-10"]);
  });

  it("future dates get dashed outline with no data-dk", () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const speeds = buildDaySpeeds(30, 20, year, month);
    renderCal(speeds, undefined, year, month);

    // Find a future date — day number > today
    const today = now.getDate();
    if (today < 28) {
      const futureDay = today + 1;
      const spans = document.querySelectorAll("span");
      let futureCell: HTMLElement | null = null;
      spans.forEach(span => {
        if (span.textContent === String(futureDay)) {
          futureCell = span.parentElement as HTMLElement;
        }
      });
      expect(futureCell).toBeTruthy();
      // Future dates should have no data-dk
      expect(futureCell!.getAttribute("data-dk")).toBeNull();
    }
  });
});
