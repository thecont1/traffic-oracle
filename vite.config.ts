import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: import.meta.dirname,
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
    },
    proxy: {
      "/api/traffic-csv": {
        target: "https://raw.githubusercontent.com/thecont1/blr-traffic-monitor/main",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/traffic-csv/, ""),
        configure: (proxy) => {
          proxy.on("proxyRes", (proxyRes) => {
            proxyRes.headers["cache-control"] =
              "no-cache, no-store, must-revalidate, max-age=0";
            proxyRes.headers["pragma"] = "no-cache";
            proxyRes.headers["expires"] = "0";
          });
        },
      },
    },
  },
  preview: {
    port: 5173,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});