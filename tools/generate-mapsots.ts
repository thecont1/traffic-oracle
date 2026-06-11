/**
 * generate-mapsots.ts
 *
 * Generates clean 1050×1050 route mapshot PNGs from Google Maps.
 *
 * Approach:
 *   1. Open Google Maps directions URL in headless Playwright (clean session)
 *   2. Dismiss cookie dialogs
 *   3. Use page.evaluate() to find the map container, strip all other DOM
 *      elements, and make the map fill the viewport
 *   4. Wait for route polyline to render
 *   5. Screenshot the map element directly → resize to exactly 1050×1050
 *
 * Privacy-safe: no logged-in Google session, no API keys, no personal profile.
 *
 * Usage:
 *   bun run tools/generate-mapsots.ts
 */

import { chromium } from "@playwright/test";
import * as Papa from "papaparse";
import { readFileSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";

const CSV_PATH = resolve(
  import.meta.dirname,
  "../../blr-traffic-monitor/data/csv-routes-bangalore.csv",
);
const OUTPUT_DIR = resolve(import.meta.dirname, "../public/mapsots");
const SIZE = 1050;

const VIEW_W = 1280;
const VIEW_H = 1280;

interface RouteDef {
  route_code: string;
  label_full: string;
  label_short: string;
}

function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

/**
 * JavaScript to inject into Google Maps that:
 *   1. Finds the map container (the div holding the canvas)
 *   2. Removes every other element from <body>
 *   3. Makes the map container fill the viewport
 *   4. Returns the map container so Playwright can screenshot it
 */
const STRIP_DOM_JS = `
  (() => {
    // Google Maps renders the map in a div containing a canvas.
    // The canvas is typically inside a div like:
    //   <div style="position: absolute; ..."><canvas ...></canvas></div>
    // Walk up from the first canvas to find the outermost map container.
    const canvas = document.querySelector('canvas');
    if (!canvas) return null;

    // Find the topmost map container — the one that fills the viewport
    let el = canvas.parentElement;
    while (el && el !== document.body && el.offsetWidth < window.innerWidth * 0.8) {
      el = el.parentElement;
    }
    if (!el || el === document.body) {
      // Fallback: use the canvas grandparent
      el = canvas.parentElement?.parentElement ?? canvas.parentElement;
    }

    // Strip everything else from body
    document.body.innerHTML = '';
    document.body.style.margin = '0';
    document.body.style.padding = '0';
    document.body.style.overflow = 'hidden';
    document.body.style.width = '100vw';
    document.body.style.height = '100vh';

    // Re-append the map container, sized to full viewport
    el.style.position = 'fixed';
    el.style.top = '0';
    el.style.left = '0';
    el.style.width = '100vw';
    el.style.height = '100vh';
    el.style.margin = '0';
    el.style.padding = '0';
    el.style.zIndex = '1';
    document.body.appendChild(el);

    return 'ok';
  })()
`;

async function main() {
  const csvText = readFileSync(CSV_PATH, "utf-8");
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
  });
  const routes: RouteDef[] = parsed.data.map((r) => ({
    route_code: (r["route_code"] ?? "").trim(),
    label_full: (r["label_full"] ?? "").trim(),
    label_short: (r["label_short"] ?? "").trim(),
  }));

  console.log(`Found ${routes.length} routes in CSV`);

  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: VIEW_W, height: VIEW_H },
    deviceScaleFactor: 2,
    locale: "en-US",
  });

  let success = 0;
  let skipped = 0;
  let failed = 0;

  for (const route of routes) {
    const [startCode, endCode] = route.route_code.split("|");
    if (!startCode || !endCode) {
      console.warn(`  ⚠ Skipping "${route.label_short}" — invalid route_code`);
      skipped++;
      continue;
    }

    const filename = `${slugify(route.label_short)}_1050.png`;
    const outPath = resolve(OUTPUT_DIR, filename);

    if (existsSync(outPath)) {
      console.log(`  Replacing ${route.label_short} → ${filename}`);
      unlinkSync(outPath);
    } else {
      console.log(`  Generating ${route.label_short} → ${filename} ...`);
    }

    let page;
    try {
      const mapsUrl = `https://www.google.com/maps/dir/${encodeURIComponent(startCode)}/${encodeURIComponent(endCode)}`;
      page = await context.newPage();

      // Navigate — use "load" since Maps has perpetual background requests
      await page.goto(mapsUrl, { waitUntil: "load", timeout: 60000 });
      await page.waitForTimeout(6000);

      // Dismiss cookie consent
      try {
        const rejectBtn = page.locator('button:has-text("Reject all")').first();
        if (await rejectBtn.isVisible({ timeout: 2000 })) {
          await rejectBtn.click();
          await page.waitForTimeout(1500);
        }
      } catch { /* ok */ }
      try {
        const acceptBtn = page.locator('button:has-text("Accept all")').first();
        if (await acceptBtn.isVisible({ timeout: 2000 })) {
          await acceptBtn.click();
          await page.waitForTimeout(1500);
        }
      } catch { /* ok */ }

      // Wait for route polyline to render
      await page.waitForTimeout(10000);

      // Strip DOM: keep only the map, remove everything else
      const result = await page.evaluate(STRIP_DOM_JS);
      if (!result) throw new Error("Could not find map canvas element");
      await page.waitForTimeout(2000);

      // Screenshot the full viewport (which is now just the map)
      const screenshotBuf = await page.screenshot({ fullPage: false });

      // Screenshot is VIEW_W*2 × VIEW_H*2. Resize to exactly SIZE×SIZE.
      await sharp(screenshotBuf)
        .resize(SIZE, SIZE, { fit: "fill" })
        .png()
        .toFile(outPath);

      console.log(`    ✓ saved (${SIZE}×${SIZE})`);
      success++;
    } catch (err) {
      console.error(`    ✗ Failed: ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    } finally {
      if (page) {
        try { await page.close(); } catch { /* ignore */ }
      }
    }
  }

  await context.close();
  await browser.close();

  console.log(`\nDone. ${success} generated, ${skipped} skipped, ${failed} failed.`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
