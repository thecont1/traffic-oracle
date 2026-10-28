/**
 * Integration tests for the anomaly-driven CalendarWidget.
 *
 * The widget no longer computes anything: it renders the records the upstream
 * export supplied. These tests therefore assert the *contract* with those
 * records — which statuses get a fill, which get an outline, what the
 * accessible name says, and that an unavailable or unsupported feed produces no
 * colours at all rather than falling back to a different comparison.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { CalendarWidget, CalendarLegend, categoryColor } from "../../src/components/CalendarWidget";
import { ThemeProvider } from "../../src/lib/ThemeContext";
import type { CalendarAnomaly } from "../../src/lib/calendarAnomalies";

/* ── Fixtures ────────────────────────────────────────────────────── */

function anomaly(date: string, overrides: Partial<CalendarAnomaly> = {}): CalendarAnomaly {
  return {
    routeCode: "R1",
    date,
    tod: "all",
    methodVersion: "calendar-anomaly-v1",
    cityTimezone: "Asia/Kolkata",
    referenceClass: "same_weekday",
    observedMinutes: 30,
    observedSlots: [18, 19, 20, 21],
    expectedSlots: [18, 19, 20, 21],
    observationCount: 8,
    lastObservedAt: `${date}T21:05`,
    lookbackDays: 90,
    referenceStart: "2025-01-01",
    referenceEndExclusive: "2025-04-09",
    referenceDays: 12,
    typicalMinutes: 29,
    deltaMinutes: 1,
    deltaFraction: 0.034,
    rankScore: 0.6,
    lessCount: 4,
    tieCount: 0,
    category: "usual",
    status: "final",
    qualityFlags: [],
    distanceMinKm: 10,
    distanceMaxKm: 10,
    generatedAt: "2025-04-11T02:00",
    sourceRevision: "abc123",
    referenceAuditId: "ref-2025-04-10",
    ...overrides,
  };
}

function recordMap(records: CalendarAnomaly[]): Map<string, CalendarAnomaly> {
  const map = new Map<string, CalendarAnomaly>();
  for (const record of records) map.set(record.date, record);
  return map;
}

function renderCal(
  records: CalendarAnomaly[],
  options: {
    year?: number;
    month?: number;
    onDateClick?: (dk: string) => void;
    feedState?: "ready" | "loading" | "unavailable" | "unsupported";
    cutoffDate?: Date | null;
    theme?: "colour" | "gray" | "pastel";
    tod?: CalendarAnomaly["tod"];
    publishedFrom?: string | null;
  } = {},
) {
  const { year = 2025, month = 3, onDateClick, feedState = "ready", cutoffDate = null } = options;
  return render(
    <ThemeProvider initialTheme={options.theme ?? "colour"}>
      <CalendarWidget
        anomalies={recordMap(records)}
        feedState={feedState}
        feedMeta={{ methodVersion: "calendar-anomaly-v1", generatedAt: "2025-04-11T02:00", error: null }}
        publishedFrom={options.publishedFrom ?? null}
        selectedRoute="Test Route"
        tod={options.tod ?? "all"}
        widgetCalYear={year}
        widgetCalMonth={month}
        onDateClick={onDateClick}
        cutoffDate={cutoffDate}
      />
    </ThemeProvider>,
  );
}

function circleOf(dateKey: string): HTMLElement | null {
  const cell = document.querySelector(`[data-dk="${dateKey}"]`);
  return (cell?.querySelector("div") as HTMLElement | null) ?? null;
}

function cellWithLabelContaining(text: string): HTMLElement | null {
  for (const cell of Array.from(document.querySelectorAll('[role="gridcell"]'))) {
    if ((cell.getAttribute("aria-label") ?? "").includes(text)) return cell as HTMLElement;
  }
  return null;
}

/* ── Structure ───────────────────────────────────────────────────── */

describe("CalendarWidget structure", () => {
  beforeEach(() => cleanup());

  it("renders 42 cells in a 6×7 grid", () => {
    const { container } = renderCal([], {});
    const grid = container.querySelector('[role="grid"]');
    expect(grid).toBeTruthy();
    expect(grid!.querySelectorAll('[role="gridcell"]').length).toBe(42);
  });

  it("renders Mon–Sun column headers and an accessible grid name", () => {
    const { container } = renderCal([], {});
    for (const day of ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]) {
      expect(screen.getByText(day)).toBeTruthy();
    }
    expect(container.querySelector('[aria-label="Traffic calendar"]')).toBeTruthy();
    expect(container.querySelectorAll('[role="columnheader"]').length).toBe(7);
  });

  it("places the 1st of the month under the correct weekday column", () => {
    // 2025-04-01 was a Tuesday → offset 1 from Monday.
    const { container } = renderCal([], { year: 2025, month: 3 });
    const cells = container.querySelectorAll('[role="gridcell"]');
    expect(cells[0].getAttribute("aria-hidden")).toBe("true");
    expect(cells[1].getAttribute("aria-label")).toContain("Tuesday, 1 April 2025");
  });
});

/* ── Status → visual treatment ───────────────────────────────────── */

describe("CalendarWidget status treatment", () => {
  beforeEach(() => cleanup());

  it("fills a final day with its category colour", () => {
    renderCal([anomaly("2025-04-10", { category: "much_worse" })]);
    const circle = circleOf("2025-04-10");
    expect(circle).toBeTruthy();
    expect(circle!.style.background).not.toBe("transparent");
    expect(circle!.style.background).not.toBe("");
    expect(circle!.style.border).toContain("solid");
  });

  it("outlines a provisional day instead of ringing it solid", () => {
    renderCal([anomaly("2025-04-10", { category: "worse", status: "provisional" })]);
    const circle = circleOf("2025-04-10");
    expect(circle!.style.border).toContain("dashed");
    expect(circle!.style.background).not.toBe("transparent");
  });

  it("leaves a day with no record unfilled and unclickable", () => {
    renderCal([anomaly("2025-04-10")]);
    const empty = document.querySelector('[aria-label*="5 April 2025"]') as HTMLElement | null;
    expect(empty).toBeTruthy();
    expect(empty!.getAttribute("data-dk")).toBeNull();
    expect(empty!.querySelector("div")!.style.background).toBe("transparent");
  });

  it("draws insufficient history as dotted, never as a filled 'usual' day", () => {
    renderCal([
      anomaly("2025-04-10", {
        status: "insufficient_history",
        category: null,
        typicalMinutes: null,
        deltaMinutes: null,
        deltaFraction: null,
        rankScore: null,
        lessCount: null,
        referenceDays: 3,
      }),
    ]);
    const circle = circleOf("2025-04-10");
    expect(circle!.style.border).toContain("dotted");
    expect(circle!.style.background).toBe("transparent");
    const cell = cellWithLabelContaining("Not enough comparable history");
    expect(cell).toBeTruthy();
  });

  it("draws incomplete coverage as dashed, never as a filled day", () => {
    renderCal([
      anomaly("2025-04-10", {
        status: "incomplete_window",
        category: null,
        observedSlots: [18, 19],
        typicalMinutes: null,
        deltaMinutes: null,
      }),
    ]);
    const circle = circleOf("2025-04-10");
    expect(circle!.style.border).toContain("dashed");
    expect(circle!.style.background).toBe("transparent");
    expect(cellWithLabelContaining("Incomplete coverage")).toBeTruthy();
  });

  it("marks weekends outside a weekday filter as not part of the filter", () => {
    // 2025-04-12 is a Saturday; the export has no weekday_evening row for it.
    renderCal([anomaly("2025-04-11", { tod: "weekday_evening", category: "worse" })], {
      tod: "weekday_evening",
    });
    const saturday = document.querySelector('[aria-label*="12 April 2025"]') as HTMLElement | null;
    expect(saturday).toBeTruthy();
    expect(saturday!.getAttribute("aria-label")).toContain("Not part of Weekday Evenings");
    expect(saturday!.getAttribute("data-dk")).toBeNull();
    expect(saturday!.querySelector("div")!.style.background).toBe("transparent");
  });

  it("labels days before the rolling publication window as unpublished, not unobserved", () => {
    renderCal([anomaly("2025-04-10", { category: "usual" })], { publishedFrom: "2025-04-05" });
    const early = document.querySelector('[aria-label*="2 April 2025"]') as HTMLElement | null;
    expect(early).toBeTruthy();
    expect(early!.getAttribute("aria-label")).toContain("Before the published window");
    expect(early!.getAttribute("aria-label")).not.toContain("No observations");
    expect(early!.getAttribute("data-dk")).toBeNull();
    expect(early!.querySelector("div")!.style.background).toBe("transparent");
  });

  it("still calls a genuinely missing weekday reading 'No observations'", () => {
    renderCal([], { tod: "weekday_evening" });
    const thursday = document.querySelector('[aria-label*="10 April 2025"]') as HTMLElement | null;
    expect(thursday!.getAttribute("aria-label")).toContain("No observations");
  });

  it("ignores a category that contradicts a non-scorable status", () => {
    renderCal([
      anomaly("2025-04-10", { status: "incomplete_window", category: "much_worse" }),
    ]);
    const circle = circleOf("2025-04-10");
    expect(circle!.style.background).toBe("transparent");
  });
});

/* ── Feed states ─────────────────────────────────────────────────── */

describe("CalendarWidget feed states", () => {
  beforeEach(() => cleanup());

  it("renders no fills when the export is unavailable", () => {
    renderCal([anomaly("2025-04-10", { category: "much_worse" })], { feedState: "unavailable" });
    for (const cell of Array.from(document.querySelectorAll('[role="gridcell"][aria-label]'))) {
      const circle = cell.querySelector("div") as HTMLElement;
      expect(circle.style.background).toBe("transparent");
    }
    expect(screen.getByRole("status").textContent).toContain("unavailable");
  });

  it("renders no fills when the method version is unsupported", () => {
    renderCal([anomaly("2025-04-10", { category: "worse" })], { feedState: "unsupported" });
    for (const cell of Array.from(document.querySelectorAll('[role="gridcell"][aria-label]'))) {
      const circle = cell.querySelector("div") as HTMLElement;
      expect(circle.style.background).toBe("transparent");
    }
    expect(screen.getByRole("status").textContent).toContain("does not understand");
  });

  it("does not render future days as clickable or filled", () => {
    renderCal([anomaly("2035-04-10", { category: "better" })], { year: 2035, month: 3 });
    for (const cell of Array.from(document.querySelectorAll('[role="gridcell"]'))) {
      expect(cell.getAttribute("data-dk")).toBeNull();
    }
  });

  it("hides days beyond an active Time Traveller cutoff", () => {
    renderCal(
      [anomaly("2025-04-10", { category: "better" }), anomaly("2025-04-20", { category: "worse" })],
      { cutoffDate: new Date("2025-04-15T12:00:00+05:30") },
    );
    expect(circleOf("2025-04-10")!.style.background).not.toBe("transparent");
    const later = document.querySelector('[aria-label*="20 April 2025"]') as HTMLElement | null;
    expect(later!.getAttribute("data-dk")).toBeNull();
    expect(later!.querySelector("div")!.style.background).toBe("transparent");
  });
});

/* ── Interaction and accessibility ───────────────────────────────── */

describe("CalendarWidget interaction", () => {
  beforeEach(() => cleanup());

  it("fires onDateClick only for days with a record", () => {
    const clicked: string[] = [];
    renderCal([anomaly("2025-04-10", { category: "worse" })], {
      onDateClick: (dk) => clicked.push(dk),
    });
    fireEvent.click(document.querySelector('[data-dk="2025-04-10"]')!);
    expect(clicked).toEqual(["2025-04-10"]);
  });

  it("names the day and the verdict, and describes the numbers separately", () => {
    renderCal([
      anomaly("2025-04-10", {
        category: "much_worse",
        observedMinutes: 43.5,
        typicalMinutes: 28.4,
        deltaMinutes: 15.1,
        deltaFraction: 0.5317,
        lessCount: 12,
        referenceDays: 12,
      }),
    ]);
    const cell = document.querySelector('[data-dk="2025-04-10"]') as HTMLElement;
    const label = cell.getAttribute("aria-label") ?? "";
    // The name is a name: day, route, filter, verdict. Nothing numeric.
    expect(label).toContain("Thursday, 10 April 2025");
    expect(label).toContain("Test Route");
    expect(label).toContain("All Times");
    expect(label).toContain("Much worse than usual");
    expect(label).not.toMatch(/\d+(\.\d+)? min/);
    expect(label).not.toContain("comparable");
    expect(label.match(/Much worse than usual/g)).toHaveLength(1);

    // The figures live in the description the cell points at.
    const describedBy = cell.getAttribute("aria-describedby");
    expect(describedBy).toBe("anomaly-desc-2025-04-10");
    const description = document.getElementById(describedBy!)?.textContent ?? "";
    expect(description).toContain("43.5 min");
    expect(description).toContain("typical comparable Thursday 28.4 min");
    expect(description).toContain("About 15.1 min longer, or 53%");
    expect(description).toContain("Longer than all 12 comparable Thursdays");
  });

  it("shows the typical value and rank in the hover tooltip", async () => {
    renderCal([
      anomaly("2025-04-10", {
        category: "much_worse",
        observedMinutes: 43.5,
        typicalMinutes: 28.4,
        deltaMinutes: 15.1,
        deltaFraction: 0.5317,
        lessCount: 11,
        referenceDays: 12,
      }),
    ]);
    fireEvent.mouseEnter(document.querySelector('[data-dk="2025-04-10"]')!);
    const tip = await screen.findByRole("tooltip");
    expect(tip.textContent).toContain("Typical comparable Thursday");
    expect(tip.textContent).toContain("28.4 min");
    expect(tip.textContent).toContain("Longer than 11 of 12 comparable Thursdays");
  });

  it("is keyboard reachable and hides the tooltip on Escape", async () => {
    renderCal([anomaly("2025-04-10", { category: "better" })]);
    const cell = document.querySelector('[data-dk="2025-04-10"]') as HTMLElement;
    expect(cell.tabIndex).toBe(0);
    fireEvent.focus(cell);
    expect(await screen.findByRole("tooltip")).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    // Escape actually dismisses it — not merely "no error was thrown".
    await Promise.resolve();
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});

/* ── Legend ──────────────────────────────────────────────────────── */

describe("CalendarWidget legend and palette", () => {
  beforeEach(() => cleanup());

  it("labels all five categories plus the no-result state", () => {
    render(<CalendarLegend themeKey="colour" textMuted="#888" />);
    for (const text of ["Much worse", "Worse", "Usual", "Better", "Much better", "No comparable result", "Outside filter"]) {
      expect(screen.getByText(text)).toBeTruthy();
    }
  });

  it("keeps the grey theme ordered: darker means worse, monotonic across all five", () => {
    const lumen = (hex: string) => {
      const channel = (i: number) => parseInt(hex.slice(i, i + 2), 16) / 255;
      const toLinear = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
      return 0.2126 * toLinear(channel(1)) + 0.7152 * toLinear(channel(3)) + 0.0722 * toLinear(channel(5));
    };
    const ramp = (["much_worse", "worse", "usual", "better", "much_better"] as const)
      .map((category) => lumen(categoryColor("gray", category)));
    // Each step must be strictly lighter than the one before it.
    for (let i = 1; i < ramp.length; i += 1) {
      expect(ramp[i]).toBeGreaterThan(ramp[i - 1] + 0.02);
    }
  });

  it("resolves a distinct colour per category in every theme", () => {
    for (const theme of ["colour", "gray", "pastel"]) {
      const swatches = (["much_worse", "worse", "usual", "better", "much_better"] as const).map(
        (category) => categoryColor(theme, category),
      );
      expect(new Set(swatches).size).toBe(5);
    }
  });
});
