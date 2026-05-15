import { describe, it, expect } from "vitest";
import { add, name } from "./simple-module";

describe("simple module test", () => {
  it("should import named exports", () => {
    expect(add(1, 2)).toBe(3);
    expect(name).toBe("test-module");
  });
});

describe("debug useTrafficData", () => {
  it("should import useTrafficData module", async () => {
    const mod = await import("@/lib/useTrafficData");
    console.log("useTrafficData keys:", Object.keys(mod));
    console.log("useTrafficData default:", typeof mod.default);
    expect(Object.keys(mod).length).toBeGreaterThan(0);
  });
});