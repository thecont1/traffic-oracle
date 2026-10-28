/**
 * E2E tests for the "Good Days and Bad Days" calendar widget.
 *
 * The widget renders a pre-computed day-anomaly export, so these tests must
 * serve one: `buildAnomaliesCsv()` synthesises rows for the current Kolkata
 * civil month (the month the calendar opens on) for the fixture route `R-100`,
 * mixing every status the widget has to distinguish.
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

/** Current civil date in Asia/Kolkata — the calendar's own clock. */
function cityToday(): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const pick = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { year: pick("year"), month: pick("month"), day: pick("day") };
}

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

/** Rows for days 1..today of the current city month — the visible month. */
function buildAnomaliesCsv(): string {
  const today = cityToday();
  const prefix = `${today.year}-${String(today.month).padStart(2, "0")}`;
  const rows: string[] = [COLUMNS.join(",")];

  for (let day = 1; day <= today.day; day += 1) {
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

function monthDay(today: { year: number; month: number }, day: number): string {
  return `${today.year}-${String(today.month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/* ══════════════════════════════════════════════════════════════════ */

test.describe("Calendar widget — anomaly export", () => {
  test.beforeEach(async ({ page }) => {
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
    const today = cityToday();
    await page.goto(CAL_URL);
    await page.waitForSelector("text=Mon");

    await expect(page.locator(`[data-dk="${monthDay(today, 2)}"]`))
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

  test("hovering a compared day shows the typical value and the rank", async ({ page }) => {
    const today = cityToday();
    await page.goto(CAL_URL);
    await page.waitForSelector("text=Mon");

    await page.locator(`[data-dk="${monthDay(today, 2)}"]`).hover();
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
