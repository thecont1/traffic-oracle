import { describe, it, expect } from "vitest";

describe("vitest sanity check", () => {
  it("basic math works", () => {
    expect(1 + 1).toBe(2);
  });

  it("async import works", async () => {
    const { add } = await import("./simple-module");
    console.log("add type:", typeof add);
    console.log("module:", await import("./simple-module"));
    expect(typeof add).toBe("function");
  });
});