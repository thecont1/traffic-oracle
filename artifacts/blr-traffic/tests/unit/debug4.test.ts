import { describe, it, expect } from "vitest";
import * as Papa from "papaparse";

describe("vitest module interop", () => {
  it("can import from node_modules (namespace)", () => {
    expect(typeof Papa.parse).toBe("function");
  });

  it("can import local file with .js extension", async () => {
    const mod = await import("./simple-module.js");
    console.log("simple-module.js keys:", Object.keys(mod));
    console.log("simple-module.js add:", typeof mod.add);
    expect(typeof mod.add).toBe("function");
  });

  it("can import local file without extension", async () => {
    const mod = await import("./simple-module");
    console.log("simple-module keys:", Object.keys(mod));
    console.log("simple-module add:", typeof mod.add);
  });
});