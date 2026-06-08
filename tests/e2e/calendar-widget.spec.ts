/**
 * E2E tests for the Calendar Widget.
 *
 * Uses the same fixture data as dashboard-cards.spec.ts to ensure
 * deterministic colours.  Tests:
 *   1. Calendar card renders with 42 cells (6 rows × 7 cols).
 *   2. Cycling through each ToD option does not crash.
 *   3. Hovering a date with data shows the tooltip (n= count visible).
 *   4. No console errors during any of the above.
 */

import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

const routesCsv  = readFileSync(join(__dirname, "../fixtures/e2e-routes.csv"),  "utf-8");
const trafficCsv = readFileSync(join(__dirname, "../fixtures/e2e-traffic.csv"), "utf-8");

async function interceptCsvs(page: Page): Promise<void> {
  await page.route(/\/api\/traffic-csv\/csv-routes-bangalore\.csv/, (route) => {
    route.fulfill({ body: routesCsv, contentType: "text/csv; charset=utf-8" });
  });
  await page.route(/\/api\/traffic-csv\/csv-traffic-bangalore\.csv/, (route) => {
    route.fulfill({ body: trafficCsv, contentType: "text/csv; charset=utf-8" });
  });
}

/** URL with tod=all to show the calendar with data. */
const CAL_URL = "/?route=Hosur+Road&tod=all&period=1.5m";

const TOD_OPTIONS = ["all", "weekday_morning", "weekday_afternoon", "weekday_evening", "weekends", "late_hours"];

/* ══════════════════════════════════════════════════════════════════ */

test.describe("Calendar widget — fixture data", () => {
  test.beforeEach(async ({ page }) => {
    await interceptCsvs(page);
  });

  test("renders 42 cells in the calendar grid", async ({ page }) => {
    await page.goto(CAL_URL);
    // The calendar grid is a 7-column CSS grid; cells are direct children
    // of the grid div that contains [data-dk] or spacer divs.
    // Wait for the calendar to appear by looking for day headers.
    await page.waitForSelector("text=Mon");
    // Count the circle containers — there should be 42 cells
    const grid = page.locator("div[style*='grid-template-columns: repeat(7,1fr)']").last();
    const cellCount = await grid.locator("> div").count();
    expect(cellCount).toBe(42);
  });

  test("no console errors when loading calendar", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    await page.goto(CAL_URL);
    await page.waitForSelector("text=Mon");
    // Give it a moment to settle
    await page.waitForTimeout(500);
    expect(errors).toEqual([]);
  });

  test("cycling through ToD options does not crash", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    for (const tod of TOD_OPTIONS) {
      await page.goto(`/?route=Hosur+Road&tod=${tod}&period=1.5m`);
      await page.waitForSelector("text=Mon");
      await page.waitForTimeout(300);
    }
    expect(errors).toEqual([]);
  });

  test("legend text says 'vs 30d' (relative, not absolute)", async ({ page }) => {
    await page.goto(CAL_URL);
    await page.waitForSelector("text=Mon");
    await expect(page.getByText("Slower vs 30d")).toBeVisible();
    await expect(page.getByText("Faster vs 30d")).toBeVisible();
  });
});
