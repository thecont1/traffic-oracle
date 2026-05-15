vi.mock("../../src/config.json", () => ({
  default: {
    worst_case_percentile: 95,
    verdict_threshold_kmh: 0.5,
    baseline_default_start: "2025-10-20",
    baseline_default_end: "2025-12-15",
  },
}));

import { describe, it, expect } from "vitest";
import * as mod from "@/lib/useTrafficData";

describe("module exports debug", () => {
  it("should export named functions", () => {
    const keys = Object.keys(mod);
    console.log("Module keys:", keys);
    expect(keys.length).toBeGreaterThan(0);
  });
});