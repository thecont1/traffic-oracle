/**
 * generate-mapsots.ts
 *
 * Generates clean 1050×1050 route mapshot PNGs from Google Maps.
 *
 * Approach:
 *   1. Decode Plus Codes → lat/lon via recoverNearest (Bangalore center)
 *   2. Calculate straight-line distance → determine zoom for ~90% fill
 *   3. Open Google Maps directions with coordinates + pre-set zoom
 *   4. Dismiss dialogs, wait for route, strip DOM, screenshot
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
import { OpenLocationCode } from "open-location-code";

const CSV_PATH = resolve(
  import.meta.dirname,
  "../../blr-traffic-monitor/data/csv-routes-bangalore.csv",
);
const OUTPUT_DIR = resolve(import.meta.dirname, "../public/mapsots");
const SIZE = 1050;

const VIEW_W = 1280;
const VIEW_H = 1280;
const BLR_CENTER = { lat: 12.9716, lng: 77.5946 };
const olc = new OpenLocationCode();

interface RouteDef {
  route_code: string;
  label_full: string;
  label_short: string;
}

interface LatLng {
  lat: number;
  lng: number;
}

function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function decodePlusCode(code: string): LatLng {
  const full = olc.recoverNearest(code, BLR_CENTER.lat, BLR_CENTER.lng);
  const area = olc.decode(full);
  return { lat: area.latitudeCenter, lng: area.longitudeCenter };
}

function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h =
    sinDLat * sinDLat +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      sinDLng * sinDLng;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Calculate zoom so the straight-line distance fills ~90% of SIZE.
 * At zoom Z, 256*2^Z px cover 360°. For distance D km, angular span ≈ D/111.32°.
 * 256*2^Z / 360 = 0.9*SIZE / (D/111.32)  →  Z = log2((0.9*SIZE*360) / (256 * D/111.32))
 * Add 1 since road distance > straight-line.
 */
function zoomForDistance(km: number): number {
  if (km <= 0) return 14;
  const fillPx = SIZE * 0.94;
  const deg = km / 111.32;
  const z = Math.log2((fillPx * 360) / (256 * deg));
  return Math.round(z);
}

const STRIP_DOM_JS = `
  (() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return null;
    let el = canvas.parentElement;
    while (el && el !== document.body && el.offsetWidth < window.innerWidth * 0.8) {
      el = el.parentElement;
    }
    if (!el || el === document.body) {
      el = canvas.parentElement?.parentElement ?? canvas.parentElement;
    }
    document.body.innerHTML = '';
    document.body.style.cssText = 'margin:0;padding:0;overflow:hidden;width:100vw;height:100vh;';
    el.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;margin:0;padding:0;z-index:1;';
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
      const from = decodePlusCode(startCode);
      const to = decodePlusCode(endCode);
      const dist = haversineKm(from, to);
      const zoom = zoomForDistance(dist);
      const center = { lat: (from.lat + to.lat) / 2, lng: (from.lng + to.lng) / 2 };

      console.log(`    ${dist.toFixed(1)} km → zoom ${zoom}`);

      // Google Maps directions with pre-set viewport zoom
      const mapsUrl =
        `https://www.google.com/maps/dir/${from.lat},${from.lng}/${to.lat},${to.lng}` +
        `/@${center.lat},${center.lng},${zoom}z`;

      page = await context.newPage();
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

      // Wait for route polyline
      await page.waitForTimeout(8000);

      // Strip DOM
      const result = await page.evaluate(STRIP_DOM_JS);
      if (!result) throw new Error("Could not find map canvas");
      await page.waitForTimeout(2000);

      const screenshotBuf = await page.screenshot({ fullPage: false });

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
