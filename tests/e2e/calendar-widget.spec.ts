/**
 * E2E tests for the "Good Days and Bad Days" calendar widget.
 *
 * The widget renders a pre-computed day-anomaly export, so these tests must
 * serve one: `buildAnomaliesCsv()` synthesises rows for the month the calendar
 * opens on, for the fixture route `R-100`, mixing every status the widget has
 * to distinguish. The browser clock is pinned (see FIXED_NOW) so the month and
 * the asserted days never depend on the day the suite happens to run.
 *
 * Covered:
 *   1. 42 cells in a 6×7 grid.
 *   2. Five-category legend, replacing the old Slow/Fast decile strip.
 *   3. Only scorable days are filled; insufficient history and incomplete
 *      coverage are outlined, never filled.
 *   4. Hovering a compared day shows the typical value and the rank sentence.
 *   5. A missing export leaves every day unfilled — no fallback colours.
 *   6. Cycling every ToD option produces no console errors.
 */

import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

const routesCsv = readFileSync(join(__dirname, "../fixtures/e2e-routes.csv"), "utf-8");
const trafficCsv = readFileSync(join(__dirname, "../fixtures/e2e-traffic.csv"), "utf-8");

const ANOMALIES_URL = /\/api\/traffic-csv\/csv-calendar-anomalies-bangalore\.csv/;

const COLUMNS = [
  "route_code", "route_definition_version", "date", "tod_bucket", "city_timezone",
  "method_version", "reference_class", "observed_minutes", "observed_slot_mask",
  "expected_slot_mask", "observation_count", "last_observed_at", "lookback_days",
  "reference_start", "reference_end_exclusive", "reference_days", "typical_minutes",
  "delta_minutes", "delta_fraction", "rank_score", "less_count", "tie_count",
  "category", "status", "quality_flags", "distance_min_km", "distance_max_km",
  "generated_at", "source_revision", "reference_audit_id",
];

/**
 * Pinned browser clock: 10:00 IST on Monday 20 April 2026.
 *
 * The calendar opens on the city's current month, so a run on the 1st would
 * have no days 2–4 to assert against, and a suite that started before midnight
 * would disagree with itself about which month is visible.
 */
const FIXED_NOW = new Date("2026-04-20T04:30:00Z");
const TODAY = { year: 2026, month: 4, day: 20 };

function anomaliesRow(date: string, overrides: Record<string, string> = {}): string {
  const base: Record<string, string> = {
    route_code: "R-100",
    route_definition_version: "v1",
    date,
    tod_bucket: "all",
    city_timezone: "Asia/Kolkata",
    method_version: "calendar-anomaly-v1",
    reference_class: "same_weekday",
    observed_minutes: "31.4",
    observed_slot_mask: "ffffff",
    expected_slot_mask: "ffffff",
    observation_count: "12",
    last_observed_at: `${date}T21:05`,
    lookback_days: "90",
    reference_start: "2026-01-01",
    reference_end_exclusive: date,
    reference_days: "12",
    typical_minutes: "30.1",
    delta_minutes: "1.3",
    delta_fraction: "0.0432",
    rank_score: "0.6",
    less_count: "7",
    tie_count: "0",
    category: "usual",
    status: "final",
    quality_flags: "",
    distance_min_km: "18.0",
    distance_max_km: "18.0",
    generated_at: "2026-01-01T02:00",
    source_revision: "fixture",
    reference_audit_id: "fixture-ref",
    ...overrides,
  };
  return COLUMNS.map((column) => {
    const value = base[column] ?? "";
    return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  }).join(",");
}

/** Rows for days 1..TODAY.day of the pinned month — the visible month. */
function buildAnomaliesCsv(): string {
  const prefix = `${TODAY.year}-${String(TODAY.month).padStart(2, "0")}`;
  const rows: string[] = [COLUMNS.join(",")];

  for (let day = 1; day <= TODAY.day; day += 1) {
    const date = `${prefix}-${String(day).padStart(2, "0")}`;
    if (day === 2) {
      // A clearly worse-than-usual day: the tooltip assertions key off this.
      rows.push(anomaliesRow(date, {
        observed_minutes: "43.5", typical_minutes: "28.4",
        delta_minutes: "15.1", delta_fraction: "0.5317",
        rank_score: "1", less_count: "12", category: "much_worse",
      }));
    } else if (day === 3) {
      rows.push(anomaliesRow(date, {
        status: "insufficient_history", category: "", typical_minutes: "",
        delta_minutes: "", delta_fraction: "", rank_score: "", less_count: "",
        tie_count: "", reference_days: "3",
      }));
    } else if (day === 4) {
      rows.push(anomaliesRow(date, {
        status: "incomplete_window", category: "", observed_slot_mask: "0c0000",
        typical_minutes: "", delta_minutes: "", delta_fraction: "", rank_score: "",
        less_count: "", tie_count: "",
      }));
    } else {
      rows.push(anomaliesRow(date, { category: day % 2 === 0 ? "better" : "usual" }));
    }
  }
  return rows.join("\n") + "\n";
}

const ANOMALIES_CSV = buildAnomaliesCsv();

async function interceptCsvs(page: Page, options: { anomalies?: boolean } = {}): Promise<void> {
  const { anomalies = true } = options;
  await page.route(/\/api\/traffic-csv\/csv-routes-bangalore\.csv/, (route) => {
    route.fulfill({ body: routesCsv, contentType: "text/csv; charset=utf-8" });
  });
  await page.route(/\/api\/traffic-csv\/csv-traffic-bangalore\.csv/, (route) => {
    route.fulfill({ body: trafficCsv, contentType: "text/csv; charset=utf-8" });
  });
  await page.route(ANOMALIES_URL, (route) => {
    if (anomalies) {
      route.fulfill({ body: ANOMALIES_CSV, contentType: "text/csv; charset=utf-8" });
    } else {
      route.fulfill({ status: 404, body: "not found", contentType: "text/plain" });
    }
  });
}

const CAL_URL = "/?route=Hosur+Road&tod=all&period=1.5m";

const TOD_OPTIONS = ["all", "weekday_morning", "weekday_afternoon", "weekday_evening", "weekends", "late_hours"];

function monthDay(day: number): string {
  return `${TODAY.year}-${String(TODAY.month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/* ══════════════════════════════════════════════════════════════════ */

test.describe("Calendar widget — anomaly export", () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(FIXED_NOW);
    await interceptCsvs(page);
  });

  test("renders 42 cells in the calendar grid", async ({ page }) => {
    await page.goto(CAL_URL);
    await page.waitForSelector("text=Mon");
    const grid = page.locator('[role="grid"][aria-label="Traffic calendar"]');
    await expect(grid).toBeVisible();
    expect(await grid.locator('[role="gridcell"]').count()).toBe(42);
  });

  test("legend shows the five anomaly categories, not deciles", async ({ page }) => {
    await page.goto(CAL_URL);
    await page.waitForSelector("text=Mon");

    const legend = page.getByRole("img", { name: /Legend: each day is compared/ });
    await expect(legend).toBeVisible();
    for (const label of ["Much worse", "Worse", "Usual", "Better", "Much better", "No comparable result", "Outside filter"]) {
      await expect(legend).toContainText(label);
    }
    await expect(legend).not.toContainText("Slow");
    await expect(legend).not.toContainText("Fast");
  });

  test("fills compared days and outlines days with no comparable result", async ({ page }) => {
    await page.goto(CAL_URL);
    await page.waitForSelector("text=Mon");

    await expect(page.locator(`[data-dk="${monthDay(2)}"]`))
      .toHaveAttribute("data-category", "much_worse");

    // Insufficient history and incomplete coverage are present but never filled.
    for (const day of [3, 4]) {
      const cell = page.locator(`[role="gridcell"][aria-label*=" ${day} "]`).first();
      await expect(cell).toHaveAttribute(
        "aria-label",
        /Not enough comparable history|Incomplete coverage/,
      );
      await expect(cell).not.toHaveAttribute("data-category", /.+/);
      const background = await cell.locator("div").first()
        .evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(["rgba(0, 0, 0, 0)", "transparent"]).toContain(background);
    }
  });

  test("keeps the numbers in the description, not in the name", async ({ page }) => {
    await page.goto(CAL_URL);
    await page.waitForSelector("text=Mon");

    const cell = page.locator(`[data-dk="${monthDay(2)}"]`);
    const label = (await cell.getAttribute("aria-label")) ?? "";
    expect(label).toContain("Much worse than usual");
    expect(label).not.toMatch(/\d+(\.\d+)? min/);

    const describedBy = await cell.getAttribute("aria-describedby");
    expect(describedBy).toBe(`anomaly-desc-${monthDay(2)}`);
    const description = page.locator(`#${describedBy}`);
    await expect(description).toHaveCount(1);
    await expect(description).toContainText("43.5 min");
    await expect(description).toContainText("28.4 min");
  });

  test("hovering a compared day shows the typical value and the rank", async ({ page }) => {
    await page.goto(CAL_URL);
    await page.waitForSelector("text=Mon");

    await page.locator(`[data-dk="${monthDay(2)}"]`).hover();
    const tip = page.getByRole("tooltip");
    await expect(tip).toBeVisible();
    await expect(tip).toContainText("Much worse than usual");
    await expect(tip).toContainText("43.5");
    await expect(tip).toContainText("28.4 min");
    await expect(tip).toContainText("comparable");
  });

  test("a missing export leaves every day unfilled", async ({ page }) => {
    await page.unroute(ANOMALIES_URL);
    await page.route(ANOMALIES_URL, (route) =>
      route.fulfill({ status: 404, body: "not found", contentType: "text/plain" }),
    );
    await page.goto(CAL_URL);
    await page.waitForSelector("text=Mon");
    await expect(page.getByText(/Day comparisons are unavailable/)).toBeVisible();
    expect(await page.locator("[data-category]").count()).toBe(0);
  });

  test.describe("in a US-Pacific browser", () => {
    test.use({ timezoneId: "America/Los_Angeles" });

    test("activates the clicked day at noon in city time", async ({ page }) => {
      await page.goto(CAL_URL);
      await page.waitForSelector("text=Mon");

      await page.locator(`[data-dk="${monthDay(2)}"]`).click();

      // Noon in Bangalore, whatever the viewer's clock says: 06:30 UTC.
      await expect(page).toHaveURL(/tt=2026-04-02T06%3A30%3A00\.000Z/);
      // Every visible label agrees — banner, pane and footer.
      await expect(page.getByText(/as of 2 Apr '26 · 12:00/).first()).toBeVisible();
      await expect(page.getByText(/1 Apr '26 · 23:30/)).toHaveCount(0);
    });
  });

  test("cycling through ToD options does not crash", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    for (const tod of TOD_OPTIONS) {
      await page.goto(`/?route=Hosur+Road&tod=${tod}&period=1.5m`);
      await page.waitForSelector("text=Mon");
      await page.waitForTimeout(250);
    }
    expect(errors).toEqual([]);
  });
});
