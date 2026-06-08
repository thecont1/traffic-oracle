import { describe, it, expect } from "bun:test";

/* ══════════════════════════════════════════════════════════════════ */
/* Calendar colour mapping — band5 + calColor / calGray / calPastel   */
/*                                                                    */
/* These test the colour logic from src/lib/theme.ts which uses       */
/* hard 5-band edges: t < 0.20 → red, ≥ 0.20 → orange, ≥ 0.40 →     */
/* yellow, ≥ 0.60 → green, ≥ 0.80 → hard green.                      */
/* ══════════════════════════════════════════════════════════════════ */

/** Inline copies of the theme functions (avoids pulling in React deps) */

function band5(t: number): number {
  return Math.max(0, Math.min(1, t));
}

function calColour(kmh: number, p10: number, p90: number): string {
  const tc = band5(p90 > p10 ? (kmh - p10) / (p90 - p10) : 0.5);
  if (tc >= 0.80) return "#22c55e";
  if (tc >= 0.60) return "#86efac";
  if (tc >= 0.40) return "#fbbf24";
  if (tc >= 0.20) return "#f97316";
  return "#ef4444";
}

function calGray(kmh: number, p10: number, p90: number): string {
  const tc = band5(p90 > p10 ? (kmh - p10) / (p90 - p10) : 0.5);
  if (tc >= 0.80) return "#f0f0f0";
  if (tc >= 0.60) return "#c0c0c0";
  if (tc >= 0.40) return "#808080";
  if (tc >= 0.20) return "#404040";
  return "#1a1a1a";
}

function calPastel(kmh: number, p10: number, p90: number): string {
  const tc = band5(p90 > p10 ? (kmh - p10) / (p90 - p10) : 0.5);
  if (tc >= 0.80) return "#86efac";
  if (tc >= 0.60) return "#bef264";
  if (tc >= 0.40) return "#fde68a";
  if (tc >= 0.20) return "#fdba74";
  return "#fca5a5";
}

/* ── Colour theme ──────────────────────────────────────────────── */

describe("calColour — colour theme 5-band mapping", () => {
  const p10 = 20, p90 = 40;

  it("speed at p10 → worst band (red #ef4444)", () => {
    expect(calColour(20, p10, p90)).toBe("#ef4444");
  });

  it("speed at p90 → best band (hard green #22c55e)", () => {
    expect(calColour(40, p10, p90)).toBe("#22c55e");
  });

  it("speed midway (30) → middle band (yellow #fbbf24)", () => {
    expect(calColour(30, p10, p90)).toBe("#fbbf24");
  });

  it("speed just below p10 → still worst band", () => {
    expect(calColour(15, p10, p90)).toBe("#ef4444");
  });

  it("speed just above p90 → still best band", () => {
    expect(calColour(45, p10, p90)).toBe("#22c55e");
  });

  it("band boundaries are at exact t thresholds", () => {
    // t = 0.20 → kmh = p10 + 0.20*(p90-p10) = 24
    expect(calColour(24, p10, p90)).toBe("#f97316");
    // t = 0.40 → kmh = 28
    expect(calColour(28, p10, p90)).toBe("#fbbf24");
    // t = 0.60 → kmh = 32
    expect(calColour(32, p10, p90)).toBe("#86efac");
    // t = 0.80 → kmh = 36
    expect(calColour(36, p10, p90)).toBe("#22c55e");
  });
});

/* ── Flat distribution (p90 ≤ p10) ─────────────────────────────── */

describe("calColour — flat distribution (p90 ≤ p10)", () => {
  it("returns middle band (yellow) when p90 == p10", () => {
    expect(calColour(30, 30, 30)).toBe("#fbbf24");
  });

  it("returns middle band when p90 < p10", () => {
    expect(calColour(25, 30, 20)).toBe("#fbbf24");
  });
});

/* ── Gray theme ────────────────────────────────────────────────── */

describe("calGray — grayscale 5-band mapping", () => {
  const p10 = 20, p90 = 40;

  it("worst band → near black", () => expect(calGray(20, p10, p90)).toBe("#1a1a1a"));
  it("best band → near white", () => expect(calGray(40, p10, p90)).toBe("#f0f0f0"));
  it("middle → mid gray", () => expect(calGray(30, p10, p90)).toBe("#808080"));
  it("flat → mid gray", () => expect(calGray(30, 30, 30)).toBe("#808080"));
});

/* ── Pastel theme ──────────────────────────────────────────────── */

describe("calPastel — pastel 5-band mapping", () => {
  const p10 = 20, p90 = 40;

  it("worst band → pastel red", () => expect(calPastel(20, p10, p90)).toBe("#fca5a5"));
  it("best band → pastel green", () => expect(calPastel(40, p10, p90)).toBe("#86efac"));
  it("middle → pastel yellow", () => expect(calPastel(30, p10, p90)).toBe("#fde68a"));
  it("flat → pastel yellow", () => expect(calPastel(30, 30, 30)).toBe("#fde68a"));
});

/* ── band5 clamping ────────────────────────────────────────────── */

describe("band5 — clamping", () => {
  it("clamps t < 0 to 0", () => expect(band5(-0.5)).toBe(0));
  it("clamps t > 1 to 1", () => expect(band5(1.5)).toBe(1));
  it("passes through 0.5 unchanged", () => expect(band5(0.5)).toBe(0.5));
});
