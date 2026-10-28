import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// Static review only. Production continues to use vite.config.ts and its Worker.
function reviewOnly(): Plugin {
  const storageModule = "virtual:oracle-review-storage";
  return {
    name: "traffic-oracle-review-only",
    enforce: "pre",
    resolveId(id) {
      if (id === storageModule) return `\0${storageModule}`;
    },
    load(id) {
      if (id === `\0${storageModule}`) {
        return `
          const values = new Map();
          export default {
            getItem(key) { return values.get(key) ?? null; },
            setItem(key, value) { values.set(key, String(value)); },
            removeItem(key) { values.delete(key); },
            clear() { values.clear(); },
          };
        `;
      }
    },
    transform(code, id) {
      if (id.endsWith("/src/hooks/use-fingerprint.ts")) {
        // A design preview must not submit visitor fingerprints to production.
        return "export function useFingerprint() {}";
      }
      if (id.includes("/src/")) {
        let previewCode = code.replaceAll(
          "/api/traffic-csv/",
          "https://raw.githubusercontent.com/thecont1/traffic-monitor-lizard/main/data/",
        );
        if (/\blocalStorage\b/.test(previewCode)) {
          previewCode = `import __reviewStorage from "${storageModule}";\n`
            + previewCode.replaceAll(/\blocalStorage\b/g, "__reviewStorage");
        }
        return previewCode;
      }
    },
  };
}

export default defineConfig({
  plugins: [reviewOnly(), react(), tailwindcss()],
  base: "./",
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  build: { outDir: "dist/preview", sourcemap: false },
  server: { host: "0.0.0.0" },
});
