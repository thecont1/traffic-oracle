// Vitest setup — define globals that Vite's SSR transform expects
// when processing files with /// <reference types="vite/client" />
(globalThis as any).__vite_ssr_exportName__ = () => {};