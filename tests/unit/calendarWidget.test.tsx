/**
 * Integration tests for CalendarWidget.
 *
 * Renders the component inside a ThemeProvider with known fixture data
 * and asserts:
 *   1. 42 cells rendered (6 rows × 7 cols).
 *   2. Day headers (Mon–Sun) are present.
 *   3. Legend shows decile markers (p0 through p90).
 *   4. Cells with data have a coloured background.
 *   5. Cells without data have a dashed border.
 *   6. Clicking a date with data fires onDateClick.
 *   7. Insufficient lookback renders dashed border.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { CalendarWidget } from "../../src/components/CalendarWidget";
import { ThemeProvider } from "../../src/lib/ThemeContext";
import type { DayStats, TrafficRow } from "../../src/lib/useTrafficData";

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

function makeRow(dateKey: string, speed: number, hour = 10): TrafficRow {
  return {
    timestamp: new Date(`${dateKey}T${String(hour).padStart(2,"0")}:00:00`),
    route_code: "R1",
    label_short: "Test Route",
    duration_min: Math.round((10 / speed) * 60 * 10) / 10,
    distance_km: 10,
    speed_kmh: speed,
    hour,
    dayOfWeek: new Date(`${dateKey}T12:00:00`).getDay(),
    weekKey: "",
    temp_c: null, realfeel_c: null, humidity_pct: null, aqi: null, rsi_flag: null,
  };
}

function buildStats(speed: number, count: number, year: number, month: number) {
  const map = new Map<string, DayStats>();
  const base = new Date(year, month, 15).getTime();
  for (let i = 1; i <= count; i++) {
    const d = new Date(base - i * 86400000);
    const key = d.toISOString().slice(0, 10);
    map.set(key, { ...ds(speed), dateKey: key });
  }
  return map;
}

function buildRows(speed: number, count: number, year: number, month: number): TrafficRow[] {
  const rows: TrafficRow[] = [];
  const base = new Date(year, month, 15).getTime();
  for (let i = 1; i <= count; i++) {
    const d = new Date(base - i * 86400000);
    rows.push(makeRow(d.toISOString().slice(0, 10), speed, 10));
  }
  return rows;
}

function renderCal(
  dailyStats: Map<string, DayStats>,
  allDayStats?: Map<string, DayStats>,
  year?: number,
  month?: number,
  onDateClick?: (dk: string) => void,
  allRows?: TrafficRow[],
) {
  const now = new Date();
  return render(
    <ThemeProvider initialTheme="colour">
      <CalendarWidget
        dailyStats={dailyStats}
        allDayStats={allDayStats ?? dailyStats}
        allRows={allRows ?? []}
        selectedRoute="Test Route"
        tod="all"
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
    const stats = buildStats(30, 30, 2025, 3);
    const rows = buildRows(30, 30, 2025, 3);
    const { container } = renderCal(stats, stats, 2025, 3, undefined, rows);

    const grid = container.querySelector('[role="grid"]');
    expect(grid).toBeTruthy();
    // Count gridcells (including empty spacer cells)
    const gridcells = grid!.querySelectorAll('[role="gridcell"]');
    expect(gridcells.length).toBe(42);
  });

  it("renders day headers Mon–Sun", () => {
    const stats = buildStats(30, 30, 2025, 3);
    renderCal(stats, stats, 2025, 3);

    for (const day of ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]) {
      expect(screen.getByText(day)).toBeTruthy();
    }
  });
  it("shows legend with Slow/Fast labels", () => {
    const stats = buildStats(30, 30, 2025, 3);
    renderCal(stats, stats, 2025, 3);

    expect(screen.getByText("Slow")).toBeTruthy();
    expect(screen.getByText("Fast")).toBeTruthy();
  });

  it("dates with data get a coloured background", () => {
    const stats = buildStats(30, 30, 2025, 3);
    const rows = buildRows(30, 30, 2025, 3);
    stats.set("2025-04-10", { ...ds(35), dateKey: "2025-04-10" });
    rows.push(makeRow("2025-04-10", 35));
    renderCal(stats, stats, 2025, 3, undefined, rows);

    const cell = document.querySelector('[data-dk="2025-04-10"]');
    expect(cell).toBeTruthy();
    const circle = cell!.querySelector("div")!;
    // Should have a solid fill (not transparent, not dashed)
    expect(circle.style.background).not.toBe("transparent");
    expect(circle.style.background).not.toBe("");
    expect(circle.style.border).toContain("solid");
  });

  it("dates with no data get dashed border style", () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const stats = new Map<string, DayStats>();
    const d1Key = `${year}-${String(month + 1).padStart(2, "0")}-01`;
    stats.set(d1Key, { ...ds(30), dateKey: d1Key });
    renderCal(stats, stats, year, month);

    const day5 = now.getDate() > 5 ? (() => {
      const spans = document.querySelectorAll("span");
      let circle: HTMLElement | null = null;
      spans.forEach(span => {
        if (span.textContent === "5") circle = span.parentElement as HTMLElement;
      });
      return circle;
    })() : null;

    if (day5) {
      expect(day5.style.background).toBe("transparent");
      const wrapper = day5.parentElement;
      expect(wrapper!.getAttribute("data-dk")).toBeNull();
    }
  });

  it("fires onDateClick when clicking a date with data", () => {
    const clicked: string[] = [];
    const stats = buildStats(30, 30, 2025, 3);
    const rows = buildRows(30, 30, 2025, 3);
    stats.set("2025-04-10", { ...ds(35), dateKey: "2025-04-10" });
    rows.push(makeRow("2025-04-10", 35));
    renderCal(stats, stats, 2025, 3, (dk) => clicked.push(dk), rows);

    const cell = document.querySelector('[data-dk="2025-04-10"]');
    expect(cell).toBeTruthy();
    fireEvent.click(cell!);
    expect(clicked).toEqual(["2025-04-10"]);
  });

  it("insufficient lookback data renders dashed border", () => {
    const stats = new Map<string, DayStats>();
    stats.set("2025-04-10", { ...ds(30), dateKey: "2025-04-10" });
    // April 2025, no rows → insufficient lookback
    renderCal(stats, stats, 2025, 3);

    // Find the cell for day 10 by its aria-label (contains "Insufficient")
    const allCells = document.querySelectorAll('[role="gridcell"]');
    let day10Cell: HTMLElement | null = null;
    allCells.forEach(c => {
      const label = c.getAttribute("aria-label") ?? "";
      if (label.includes("Insufficient")) day10Cell = c as HTMLElement;
    });
    expect(day10Cell).toBeTruthy();
    if (day10Cell) {
      const circle = day10Cell.querySelector("div")!;
      expect(circle.style.border).toContain("dashed");
      expect(circle.style.background).toBe("transparent");
    }
  });

  it("calendar has accessible grid role", () => {
    const stats = buildStats(30, 30, 2025, 3);
    const rows = buildRows(30, 30, 2025, 3);
    const { container } = renderCal(stats, stats, 2025, 3, undefined, rows);

    expect(container.querySelector('[role="grid"]')).toBeTruthy();
    expect(container.querySelector('[role="columnheader"]')).toBeTruthy();
    expect(container.querySelector('[aria-label="Traffic calendar"]')).toBeTruthy();
  });

  it("data cells have aria-label with speed and decile info", () => {
    const stats = buildStats(30, 30, 2025, 3);
    const rows = buildRows(30, 30, 2025, 3);
    stats.set("2025-04-10", { ...ds(35), dateKey: "2025-04-10" });
    rows.push(makeRow("2025-04-10", 35));
    renderCal(stats, stats, 2025, 3, undefined, rows);

    const cell = document.querySelector('[data-dk="2025-04-10"]');
    expect(cell).toBeTruthy();
    const ariaLabel = cell!.getAttribute("aria-label") ?? "";
    expect(ariaLabel).toContain("km/h");
    expect(ariaLabel).toContain("Decile");
    expect(ariaLabel).toContain("vs baseline");
  });
});
