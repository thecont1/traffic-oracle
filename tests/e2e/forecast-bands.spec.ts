/**
 * E2E tests for the "Speed Forecast Bands" card.
 *
 * Fixture: tests/fixtures/e2e-forecast-bands.csv  (17 rows, route "Hosur Road")
 *   3 full weeks (Mon–Fri × 5 trips) → real percentile bands
 *   1 sparse week (Mon–Tue × 2 trips) → triggers the <3-trip fallback path
 *
 * Scenarios covered:
 *   1. Card is present when the route has data.
 *   2. Card is absent when the traffic CSV is empty (no rows → allRouteWeeks=[]).
 *   3. Chart content is hidden by default (tnOpen=false); clicking the toggle reveals it.
 *   4. Clicking toggle a second time collapses the chart again.
 *   5. No JS errors are emitted when a sparse week triggers the fallback bands.
 *   6. The card uses all-hours data regardless of the active ToD filter
 *      (documents the known design behaviour of buildBands).
 */

import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

const routesCsv       = readFileSync(join(__dirname, "../fixtures/e2e-routes.csv"),         "utf-8");
const bandsCsv        = readFileSync(join(__dirname, "../fixtures/e2e-forecast-bands.csv"), "utf-8");
const emptyTrafficCsv = "date,time,route_code,label_full,label_short,duration,distance\n";

async function interceptWith(page: Page, trafficBody: string): Promise<void> {
  await page.route(/\/api\/traffic-csv\/csv-routes-bangalore\.csv/, (route) => {
    route.fulfill({ body: routesCsv, contentType: "text/csv; charset=utf-8" });
  });
  await page.route(/\/api\/traffic-csv\/csv-traffic-bangalore\.csv/, (route) => {
    route.fulfill({ body: trafficBody, contentType: "text/csv; charset=utf-8" });
  });
}

const BASE_URL = "/?route=Hosur+Road&tod=all&period=1.5m";

/* ══════════════════════════════════════════════════════════════════ */

test.describe("Speed Forecast Bands card", () => {

  /* ── Card visibility ────────────────────────────────────────────── */

  test.describe("card visibility", () => {
    test("card is present when route has data (≥1 week)", async ({ page }) => {
      await interceptWith(page, bandsCsv);
      await page.goto(BASE_URL);
      await expect(page.getByTestId("forecast-bands-card")).toBeVisible();
    });

    test("card is absent when traffic CSV is empty (allRouteWeeks=[])", async ({ page }) => {
      await interceptWith(page, emptyTrafficCsv);
      await page.goto(BASE_URL);
      // wait for the loading state to clear
      await page.waitForSelector('[data-testid="kpi-trips-count-value"], text=No data for these filters', { timeout: 10_000 }).catch(() => {});
      await expect(page.getByTestId("forecast-bands-card")).not.toBeVisible();
    });
  });

  /* ── Toggle ─────────────────────────────────────────────────────── */

  test.describe("expand / collapse toggle", () => {
    test.beforeEach(async ({ page }) => {
      await interceptWith(page, bandsCsv);
      await page.goto(BASE_URL);
      await expect(page.getByTestId("forecast-bands-card")).toBeVisible();
    });

    test("chart content is hidden by default (tnOpen = false)", async ({ page }) => {
      const card = page.getByTestId("forecast-bands-card");
      // The subtitle paragraph only renders when tnOpen=true
      await expect(card.getByText("Weekly speed distribution")).not.toBeVisible();
    });

    test("clicking the toggle reveals the chart content", async ({ page }) => {
      const card = page.getByTestId("forecast-bands-card");
      await card.getByRole("button").first().click();
      await expect(card.getByText("Weekly speed distribution")).toBeVisible();
    });

    test("clicking toggle a second time collapses the chart again", async ({ page }) => {
      const card = page.getByTestId("forecast-bands-card");
      const btn = card.getByRole("button").first();
      await btn.click();
      await expect(card.getByText("Weekly speed distribution")).toBeVisible();
      await btn.click();
      await expect(card.getByText("Weekly speed distribution")).not.toBeVisible();
    });
  });

  /* ── Sparse-week fallback ────────────────────────────────────────── */

  test("no JS errors when sparse week (<3 trips) triggers the fallback bands", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await interceptWith(page, bandsCsv);
    await page.goto(BASE_URL);
    await expect(page.getByTestId("forecast-bands-card")).toBeVisible();
    // Expand the chart to trigger rendering including the sparse week
    await page.getByTestId("forecast-bands-card").getByRole("button").first().click();
    await page.waitForTimeout(500);

    expect(errors).toHaveLength(0);
  });

  /* ── Known design behaviour: ToD filter does not affect band shapes ── */

  test("card is still visible on weekday_morning ToD (buildBands uses all-hours rows)", async ({ page }) => {
    // The forecast-bands fixture has trips at 08:30 which IS in weekday_morning.
    // This test documents that buildBands counts those rows regardless of the ToD selector,
    // i.e., the card does not disappear when a narrow ToD is selected.
    await interceptWith(page, bandsCsv);
    await page.goto("/?route=Hosur+Road&tod=weekday_morning&period=1.5m");
    await expect(page.getByTestId("forecast-bands-card")).toBeVisible();
  });
});
