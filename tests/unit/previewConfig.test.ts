import { describe, expect, test } from "bun:test";
import path from "node:path";
import { normalizePath, type Plugin } from "vite";
import config from "../../vite.preview.config";

const root = normalizePath(path.resolve(import.meta.dir, "../.."));
const transform = (config.plugins?.[0] as Plugin).transform as (
  code: string, id: string,
) => string | undefined;
const storageCode = 'const preference = localStorage.getItem("theme");';

describe("private preview transform boundary", () => {
  test("adapts only the project's source files", () => {
    const output = transform(storageCode, `${root}/src/lib/example.ts`);
    expect(output).toContain("virtual:oracle-review-storage");
    expect(output).not.toContain("localStorage");
  });

  test("leaves dependencies containing a src path untouched", () => {
    expect(transform(storageCode, `${root}/node_modules/vendor/src/index.ts`)).toBeUndefined();
    expect(transform(storageCode, "/checkout/src/project/node_modules/vendor/index.ts")).toBeUndefined();
  });

  test("does not confuse a similarly named sibling with the source directory", () => {
    expect(transform(storageCode, `${root}/src-other/example.ts`)).toBeUndefined();
  });

  test("replaces only this project's fingerprint hook", () => {
    expect(transform("original hook", `${root}/src/hooks/use-fingerprint.ts`))
      .toBe("export function useFingerprint() {}");
    expect(transform("original hook", `${root}/node_modules/vendor/src/hooks/use-fingerprint.ts`))
      .toBeUndefined();
  });
});
