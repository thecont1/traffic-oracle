import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    root: ".",
    setupFiles: ["tests/setup.ts"],
    include: ["tests/unit/**/*.test.{ts,tsx}"],
    server: {
      deps: {
        optimizer: {
          web: {
            include: [/./],
          },
        },
      },
    },
    deps: {
      interopDefault: true,
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});