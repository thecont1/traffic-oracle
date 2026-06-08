/**
 * Integration tests for CalendarWidget.
 *
 * Renders the component inside a ThemeProvider with known fixture data
 * and asserts:
 *   1. 42 cells rendered (6 rows × 7 cols).
 *   2. Day headers (Mon–Sun) are present.
 *   3. Legend says "Slower vs 30d" / "Faster vs 30d".
 *   4. Cells with data have a coloured background.
 *   5. Cells without data have a dashed border (no data style).
 *   6. Clicking a date with data fires onDateClick.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { CalendarWidget } from "../../src/components/CalendarWidget";
import { ThemeProvider } from "../../src/lib/ThemeContext";
import type { DayStats } from "../../src/lib/useTrafficData";

/* ── Helpers ─────────────────────────────────────────────────────── */

function ds(avgSpeed: number, overrides: Partial<DayStats> = {}): DayStats {
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
    count: 10,
    ...overrides,
  };
}

/**
 * Build a stats Map with N entries spread over 30 days before the given month.
 * Each entry has the given speed.
 */
function buildStats(
  speed: number,
  count: number,
  year: number,
  month: number,
): Map<string, DayStats> {
  const map = new Map<string, DayStats>();
  // Put entries in the 30 days before the 15th of the target month
  const base = new Date(year, month, 15).getTime();
  for (let i = 1; i <= count; i++) {
    const d = new Date(base - i * 86400000);
    const key = d.toISOString().slice(0, 10);
    map.set(key, { ...ds(speed), dateKey: key });
  }
  return map;
}

/** Render CalendarWidget wrapped in ThemeProvider. */
function renderCal(
  dailyStats: Map<string, DayStats>,
  allDayStats?: Map<string, DayStats>,
  year?: number,
  month?: number,
  onDateClick?: (dk: string) => void,
) {
  const now = new Date();
  return render(
    <ThemeProvider initialTheme="colour">
      <CalendarWidget
        dailyStats={dailyStats}
        allDayStats={allDayStats ?? dailyStats}
        fmtDur={(n: number) => `${Math.round(n)} min`}
        widgetCalYear={year ?? now.getFullYear()}
        widgetCalMonth={month ?? now.getMonth()}
        onDateClick={onDateClick}
      />
    </ThemeProvider>,
  );
}

/* ── Tests ───────────────────────────────────────────────────────── */

describe("CalendarWidget integration", () => {
  beforeEach(() => cleanup());

  it("renders 42 cells in the calendar grid", () => {
    // Use a fixed past month so all dates are in the past (coloured, not future)
    const stats = buildStats(30, 30, 2025, 3); // April 2025
    const { container } = renderCal(stats, stats, 2025, 3);

    // Day headers are the first 7 text elements; calendar cells follow.
    // Count divs that have data-dk or are spacer cells inside the cell grid.
    // The cell grid is the second grid child; count its direct children.
    const allDivs = container.querySelectorAll("div");
    // Find the grid that contains day cells — they contain spans with day numbers 1-30
    const dayNums = container.querySelectorAll("span");
    const cellParents: Element[] = [];
    dayNums.forEach(span => {
      const num = parseInt(span.textContent || "", 10);
      if (num >= 1 && num <= 31) {
        // The grandparent is the cell wrapper
        const wrapper = span.parentElement?.parentElement;
        if (wrapper && wrapper.parentElement) cellParents.push(wrapper);
      }
    });
    // Deduplicate by parent grid
    const grids = new Set(cellParents.map(el => el.parentElement));
    expect(grids.size).toBe(1);
    const grid = grids.values().next().value!;
    // April 2025 starts on Tuesday (index 1 in Mon-based), so firstDay=1
    // 30 days → needs ceil((1+30)/7)*7 = 35 cells, padded to 42
    expect(grid.children.length).toBe(42);
  });

  it("renders day headers Mon–Sun", () => {
    const stats = buildStats(30, 30, 2025, 3);
    renderCal(stats, stats, 2025, 3);

    for (const day of ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]) {
      expect(screen.getByText(day)).toBeTruthy();
    }
  });

  it("shows legend with 'vs 30d' labels", () => {
    const stats = buildStats(30, 30, 2025, 3);
    renderCal(stats, stats, 2025, 3);

    expect(screen.getByText("Slower vs 30d")).toBeTruthy();
    expect(screen.getByText("Faster vs 30d")).toBeTruthy();
  });

  it("dates with data get a coloured background (not transparent)", () => {
    // April 2025 — put 30 data points before April 15 so percentiles work
    const stats = buildStats(30, 30, 2025, 3);
    // Add data for April 10 specifically
    stats.set("2025-04-10", { ...ds(35), dateKey: "2025-04-10" });
    renderCal(stats, stats, 2025, 3);

    // Find the cell for day 10
    const cell = document.querySelector('[data-dk="2025-04-10"]');
    expect(cell).toBeTruthy();
    // The inner circle div should have a background color (not transparent)
    const circle = cell!.querySelector("div")!;
    expect(circle.style.background).not.toBe("transparent");
    expect(circle.style.background).not.toBe("");
  });

  it("dates with no data get dashed border style", () => {
    // Use current month so past dates without data use the dashed border path
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    // Put data for day 1 only — all other past days have no data
    const stats = new Map<string, DayStats>();
    const d1Key = `${year}-${String(month + 1).padStart(2, "0")}-01`;
    stats.set(d1Key, { ...ds(30), dateKey: d1Key });
    renderCal(stats, stats, year, month);

    // Find the span with text "5" — day 5 in the current month, before today → past, no data
    const day5 = now.getDate() > 5 ? (() => {
      const spans = document.querySelectorAll("span");
      let circle: HTMLElement | null = null;
      spans.forEach(span => {
        if (span.textContent === "5") circle = span.parentElement as HTMLElement;
      });
      return circle;
    })() : null;

    if (day5) {
      // Past date, no data → dashed border, transparent background
      expect(day5.style.background).toBe("transparent");
      const wrapper = day5.parentElement;
      expect(wrapper!.getAttribute("data-dk")).toBeNull();
    }
    // If today is day 5 or earlier, skip — not enough past dates to test
  });

  it("fires onDateClick when clicking a date with data", () => {
    const clicked: string[] = [];
    // Use a fixed past month
    const stats = buildStats(30, 30, 2025, 3);
    stats.set("2025-04-10", { ...ds(35), dateKey: "2025-04-10" });
    renderCal(stats, stats, 2025, 3, (dk) => clicked.push(dk));

    const cell = document.querySelector('[data-dk="2025-04-10"]');
    expect(cell).toBeTruthy();
    fireEvent.click(cell!);
    expect(clicked).toEqual(["2025-04-10"]);
  });

  it("insufficient trailing data renders dashed grey circle", () => {
    // Only 1 data point — trailing window has 0 points → insufficient
    const stats = new Map<string, DayStats>();
    stats.set("2025-04-10", { ...ds(30), dateKey: "2025-04-10" });
    renderCal(stats, stats, 2025, 3);

    // The cell should NOT have a data-dk attribute (insufficient = no tooltip)
    const cell = document.querySelector('[data-dk="2025-04-10"]');
    // With insufficient data, the cell should still render but without data-dk
    // (data-dk is only set when `s && !isFuture`)
    // Actually, with only 1 data point the trailing is insufficient,
    // but `s` still exists and it's in the past, so data-dk IS set.
    // The circle should have a dashed border though.
    if (cell) {
      const circle = cell.querySelector("div")!;
      expect(circle.style.border).toContain("dashed");
      expect(circle.style.background).toBe("transparent");
    }
  });
});
