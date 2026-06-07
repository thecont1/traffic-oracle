/**
 * E2E tests for Dashboard data cards.
 *
 * Strategy: intercept both CSV fetches before page load and replace them
 * with deterministic fixture data so assertions are independent of live data.
 *
 * Fixture: tests/fixtures/e2e-traffic.csv  (7 rows, all on "Hosur Road")
 *   date        duration  distance  speed (computed)
 *   2026-04-07    20 min    18 km   54.0 km/h
 *   2026-04-08    30 min    18 km   36.0 km/h
 *   2026-04-09    35 min    18 km   30.9 km/h
 *   2026-04-10    40 min    18 km   27.0 km/h
 *   2026-04-13    45 min    18 km   24.0 km/h
 *   2026-04-14    50 min    18 km   21.6 km/h
 *   2026-04-15    60 min    18 km   18.0 km/h
 *
 * Hand-calculated KPIs (tod=all, period=1.5m):
 *   Avg Speed   = 30.2 km/h  (mean of 7 speeds)
 *   Median Trip = 40 min     (p50 of sorted durations = sorted[3])
 *   Bad Day     = 58 min     (p96 interpolated → 57.6 → toFixed(0) = "58")
 *   No. of Trips = 7
 *
 * Verdict (questionMode = "improved" from config defaults):
 *   baseline week (Apr 6): avgSpeed ≈ 37.0 km/h
 *   recent   week (Apr 13): avgSpeed ≈ 21.2 km/h
 *   speedDiff = -15.8  → dataTrend = "worsened"
 *   questionMode "improved" + dataTrend "worsened" → verdictKey = "contradicted_worse"
 *   message: "Actually, things have gotten worse — traffic is heavier."
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

/** URL that selects Hosur Road with tod=all for maximum data inclusion. */
const KPI_URL = "/?route=Hosur+Road&tod=all&period=1.5m";

/* ══════════════════════════════════════════════════════════════════ */

test.describe("Dashboard data cards — fixture data", () => {
  test.beforeEach(async ({ page }) => {
    await interceptCsvs(page);
  });

  /* ── KPI cards ─────────────────────────────────────────────────── */

  test.describe("KPI cards — 7-row fixture (tod=all, period=1.5m)", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(KPI_URL);
      await page.waitForSelector('[data-testid="kpi-trips-count-value"]');
    });

    test("No. of Trips = 7", async ({ page }) => {
      await expect(page.getByTestId("kpi-trips-count-value")).toHaveText("7");
    });

    test("Avg Speed = 30.2 km/h", async ({ page }) => {
      await expect(page.getByTestId("kpi-avg-speed-value")).toContainText("30.2");
    });

    test("Median Trip = 40 min", async ({ page }) => {
      await expect(page.getByTestId("kpi-median-trip-value")).toHaveText("40 min");
    });

    test("Bad Day Trip = 58 min  (p96 of sorted durations, rounded)", async ({ page }) => {
      await expect(page.getByTestId("kpi-bad-day-value")).toHaveText("58 min");
    });
  });

  /* ── Verdict card ──────────────────────────────────────────────── */

  test.describe("Verdict card", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(KPI_URL);
    });

    test("shows 'contradicted_worse' message when baseline faster than recent", async ({ page }) => {
      await expect(page.getByTestId("verdict-message")).toContainText(
        "Actually, things have gotten worse",
      );
    });
  });

  /* ── Empty state ───────────────────────────────────────────────── */

  test.describe("Empty state", () => {
    test("shows 'No data for these filters' when tod filter matches no rows", async ({ page }) => {
      await page.goto("/?route=Hosur+Road&tod=late_hours&period=1.5m");
      await expect(page.getByText("No data for these filters")).toBeVisible();
    });
  });
});
