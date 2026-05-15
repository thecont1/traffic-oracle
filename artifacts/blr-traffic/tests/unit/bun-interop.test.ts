import { describe, it, expect } from "bun:test";
import { add, name } from "./simple-module";

describe("bun test interop", () => {
  it("should import named exports from local .ts file", () => {
    expect(add(1, 2)).toBe(3);
    expect(name).toBe("test-module");
  });
});