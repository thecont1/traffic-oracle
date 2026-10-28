import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

const routes = readFileSync(new URL("../fixtures/e2e-routes.csv", import.meta.url), "utf8");
const traffic = readFileSync(new URL("../fixtures/e2e-traffic.csv", import.meta.url), "utf8");
const extraRoute = "Airport Expressway with a deliberately long route label";

async function fixture(page: Page) {
  await page.route("**/api/traffic-csv/**", async route => {
    const filename = new URL(route.request().url()).pathname.split("/").pop();
    if (filename === "csv-routes-bangalore.csv") {
      await route.fulfill({ contentType: "text/csv", body: `${routes.trim()}\nR-200,${extraRoute},${extraRoute}\n` });
    } else if (filename === "csv-traffic-bangalore.csv") {
      const extra = traffic.split("\n").slice(1).join("\n").replaceAll("R-100", "R-200").replaceAll("Hosur Road", extraRoute);
      await route.fulfill({ contentType: "text/csv", body: `${traffic.trim()}\n${extra}` });
    } else {
      await route.fulfill({ contentType: "text/csv", body: "" });
    }
  });
}

async function ready(page: Page, theme = "colour") {
  await fixture(page);
  await page.goto(`/?route=Hosur+Road&tod=all&period=1.5m&theme=${theme}`);
  await expect(page.locator(".oracle-question")).toBeVisible();
  await expect(page.locator(".oracle-question")).toHaveCSS("opacity", "1", { timeout: 15_000 });
  if ((page.viewportSize()?.width ?? 0) > 768) {
    await expect(page.locator('svg[style*="track-run"]')).toHaveCount(0, { timeout: 15_000 });
    await expect(page.locator(".oracle-route-pane__content")).not.toHaveAttribute("inert", "");
  }
}

for (const width of [320, 390, 768, 800, 1024, 1440]) {
  test(`navigation and question stay in bounds at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await ready(page);
    await expect(page.locator(".oracle-question")).toHaveCSS("text-align", "center");
    await expect(page.locator(".oracle-question__sentence")).toHaveCSS("justify-content", "center");
    expect(await page.evaluate(() => document.body.scrollWidth <= innerWidth)).toBe(true);
    const clipped = await page.locator("header button, .oracle-question button").evaluateAll(elements =>
      elements.filter(element => {
        const r = element.getBoundingClientRect();
        return r.left < -1 || r.right > window.innerWidth + 1;
      }).map(element => element.textContent),
    );
    expect(clipped).toEqual([]);
    for (const button of await page.locator(".oracle-question button").all()) {
      expect((await button.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    }
  });
}

for (const theme of ["colour", "gray", "pastel"]) {
  test(`mobile question and menu work in ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await ready(page, theme);
    await page.locator(".chip-improved").click();
    await expect(page.locator(".chip-worsened")).toBeVisible();
    await page.getByRole("button", { name: "Menu", exact: true }).click();
    await expect(page.getByRole("button", { name: "Menu", exact: true })).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#mobile-navigation button").first()).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.locator("#mobile-navigation")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Menu", exact: true })).toBeFocused();
  });
}

test("mobile route arrows and touch swipe update the question without clipping long names", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await ready(page);
  const previous = await page.locator(".chip-route .chip__label").innerText();
  await page.getByRole("button", { name: "Next route", exact: true }).click();
  await expect(page.locator(".chip-route .chip__label")).not.toHaveText(previous);
  const label = page.locator(".chip-route");
  expect(await label.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await expect(page.locator(".oracle-route-carousel [aria-live]")).toContainText("Route");
  // Exercise the same touch events used by the card, not only the arrow fallback.
  // The lock is released after the visual transition; wait for that explicit signal.
  await expect(page.locator(".oracle-route-carousel")).toHaveAttribute("aria-busy", "false");
  const slide = page.locator(".oracle-route-carousel [style*='translateX']").first();
  await expect(slide).toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, 0)");
  await slide.dispatchEvent("touchstart", { touches: [{ identifier: 1, clientX: 220, clientY: 150 }] });
  await slide.dispatchEvent("touchmove", { touches: [{ identifier: 1, clientX: 110, clientY: 150 }] });
  await slide.dispatchEvent("touchend", { changedTouches: [{ identifier: 1, clientX: 110, clientY: 150 }] });
  await expect(page.locator(".chip-route .chip__label")).toHaveText(previous);
});

test("desktop baseline, disclosures, theme, zoom and route pane remain operable", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await ready(page);
  const baseline = page.getByRole("slider", { name: "Baseline end" });
  await baseline.focus();
  const value = await baseline.getAttribute("aria-valuenow");
  await page.keyboard.press("ArrowRight");
  await expect(baseline).not.toHaveAttribute("aria-valuenow", value!);
  await page.getByRole("button", { name: /Baseline.*Compare/ }).click();
  await expect(baseline).toHaveCount(0);
  await page.getByRole("button", { name: /Baseline.*Compare/ }).click();
  await expect(baseline).toBeVisible();
  await page.getByRole("button", { name: "Cycle theme" }).click();
  await expect(page.locator(".oracle-desktop")).not.toHaveClass(/dark/);
  await page.getByRole("button", { name: "Increase interface size" }).click();
  await expect(page.locator(".oracle-header")).toContainText("110%");
  const closePane = page.locator(".oracle-route-pane__content")
    .getByRole("button", { name: "Close route browser", exact: true });
  const rail = page.locator(".oracle-route-pane > [role='button']");
  await closePane.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".oracle-route-pane__content")).toHaveAttribute("inert", "");
  await expect(rail).toBeFocused();
  await expect(rail).toHaveAccessibleName("Open route browser");
  await page.keyboard.press("Enter");
  await expect(page.locator(".oracle-route-pane__content")).not.toHaveAttribute("inert", "");
  await expect(rail).toBeFocused();
});
