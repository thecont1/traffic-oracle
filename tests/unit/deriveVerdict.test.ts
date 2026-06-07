import { describe, it, expect } from "bun:test";
import { deriveVerdict } from "../../src/core/constants";

/* ── helpers ─────────────────────────────────────────────────────── */

const THRESHOLD = 0.99; // mirrors config.json percentile.verdict_threshold_kmh

/* ══════════════════════════════════════════════════════════════════ */
/* deriveVerdict — all 6 verdict keys + edge cases                   */
/* ══════════════════════════════════════════════════════════════════ */

describe("deriveVerdict — 'worsened' question mode", () => {
  it("confirmed_bad: traffic genuinely worsened", () => {
    const { dataTrend, verdictKey } = deriveVerdict("worsened", 20, 30, 4, THRESHOLD);
    expect(dataTrend).toBe("worsened");
    expect(verdictKey).toBe("confirmed_bad");
  });

  it("contradicted_better: traffic actually improved despite the question", () => {
    const { dataTrend, verdictKey } = deriveVerdict("worsened", 32, 20, 4, THRESHOLD);
    expect(dataTrend).toBe("improved");
    expect(verdictKey).toBe("contradicted_better");
  });

  it("no_change: speed diff within threshold", () => {
    // diff = 0.5, within ±0.99 → stable
    const { dataTrend, verdictKey } = deriveVerdict("worsened", 25, 24.5, 4, THRESHOLD);
    expect(dataTrend).toBe("stable");
    expect(verdictKey).toBe("no_change");
  });

  it("insufficient: no recent data (recentSpeed = 0)", () => {
    const { dataTrend, verdictKey } = deriveVerdict("worsened", 0, 30, 4, THRESHOLD);
    expect(dataTrend).toBe("insufficient");
    expect(verdictKey).toBe("insufficient");
  });

  it("insufficient: no baseline data (baselineSpeed = 0)", () => {
    const { dataTrend, verdictKey } = deriveVerdict("worsened", 25, 0, 4, THRESHOLD);
    expect(dataTrend).toBe("insufficient");
    expect(verdictKey).toBe("insufficient");
  });

  it("insufficient: no recent weeks", () => {
    const { dataTrend, verdictKey } = deriveVerdict("worsened", 25, 30, 0, THRESHOLD);
    expect(dataTrend).toBe("insufficient");
    expect(verdictKey).toBe("insufficient");
  });
});

describe("deriveVerdict — 'improved' question mode", () => {
  it("confirmed_good: traffic genuinely improved", () => {
    const { dataTrend, verdictKey } = deriveVerdict("improved", 35, 20, 4, THRESHOLD);
    expect(dataTrend).toBe("improved");
    expect(verdictKey).toBe("confirmed_good");
  });

  it("contradicted_worse: traffic actually worsened despite the question", () => {
    const { dataTrend, verdictKey } = deriveVerdict("improved", 18, 30, 4, THRESHOLD);
    expect(dataTrend).toBe("worsened");
    expect(verdictKey).toBe("contradicted_worse");
  });

  it("no_change: speed diff within threshold — improved mode", () => {
    // diff = -0.5, within ±0.99 → stable
    const { dataTrend, verdictKey } = deriveVerdict("improved", 30, 30.5, 4, THRESHOLD);
    expect(dataTrend).toBe("stable");
    expect(verdictKey).toBe("no_change");
  });
});

describe("deriveVerdict — threshold boundary", () => {
  it("exactly at threshold → stable (not improved)", () => {
    // speedDiff = 0.99, condition is strictly > threshold
    const { dataTrend, verdictKey } = deriveVerdict("improved", 30.99, 30, 4, THRESHOLD);
    expect(dataTrend).toBe("stable");
    expect(verdictKey).toBe("no_change");
  });

  it("one unit above threshold → improved", () => {
    const { dataTrend, verdictKey } = deriveVerdict("improved", 31, 30, 4, THRESHOLD);
    expect(dataTrend).toBe("improved");
    expect(verdictKey).toBe("confirmed_good");
  });

  it("exactly at negative threshold → stable (not worsened)", () => {
    // speedDiff = -0.99, condition is strictly < -threshold
    const { dataTrend, verdictKey } = deriveVerdict("worsened", 29.01, 30, 4, THRESHOLD);
    expect(dataTrend).toBe("stable");
    expect(verdictKey).toBe("no_change");
  });

  it("one unit below negative threshold → worsened", () => {
    const { dataTrend, verdictKey } = deriveVerdict("worsened", 29, 30, 4, THRESHOLD);
    expect(dataTrend).toBe("worsened");
    expect(verdictKey).toBe("confirmed_bad");
  });
});
