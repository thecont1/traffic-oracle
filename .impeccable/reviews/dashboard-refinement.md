# Desktop and Mobile Refinement

28 October 2026. Scope confirmed by Mahesh Shantaram: refine the current identity on both desktop and mobile, rather than replace the visual direction.

## Design boundary

The existing logo, typefaces, three themes, semantic colour roles, feature names, datasets, calculations, and separate desktop/mobile workflows remain authoritative. This is a refinement, not a new visual world or a full WCAG conformance assessment.

The dashboard stays code-first because it is an app screen. The composition-first preference for future landing pages and showcases remains unchanged.

## Implemented

- Compact, phrase-grouped questions replace oversized, heavily padded controls. Desktop and mobile now use the same Chip component.
- Question controls wrap at narrow widths, retain a 44px minimum height, and no longer enlarge or rotate on hover.
- Desktop navigation wraps at intermediate widths. The Route Observer map moves inside its dropdown at those widths instead of extending beyond the viewport.
- The baseline has explicit From/To dates that do not collide when slider handles are close together. Both handles have accessible names and date value text.
- Desktop KPIs use a container-responsive grid; the question no longer occupies a large sticky region while scrolling through results.
- Route cards show full endpoints. Mobile has 44px previous/next controls and an explicit route count, while retaining touch swiping.
- Mobile has a primary heading, skip link, menu disclosure state, initial menu focus, Escape-to-close with focus return, and selected chart-granularity state.
- The closed desktop route pane is inert so its offscreen controls leave the keyboard order.
- Focus treatment uses the active theme. Dark route and worsened chip text is lighter for readable small-text contrast.

## Verification

- Production Worker/client build and isolated static-preview build succeed.
- Seventeen selected Playwright tests pass: six existing dashboard card/verdict/empty-state tests and eleven new refinement checks.
- Layout checks cover 320, 390, 768, 800, 1024, and 1440 CSS pixels; they check horizontal overflow, question-control bounds, and minimum control height.
- Interaction checks cover three mobile themes, question mode, menu focus and Escape, route arrows, touch events, a long route name, keyboard baseline adjustment, disclosures, theme cycling, interface zoom, and route-pane closure/reopening.
- Rendered inspections include desktop, tablet, mobile, small mobile, light theme, open navigation, and chart regions. Sampled real-data pages produced no uncaught page errors.
- Chip contrast was spot-checked against the gradient endpoints. This does not establish contrast compliance for every existing chart, control, or theme.
- Impeccable's mechanical detector reported five advisory findings concerning existing bounce-animation definitions/usages in CSS and the verdict. They are retained as incumbent behavior; no detector errors were reported.
- Source diff checks pass. Analytics, statistical algorithms, upstream datasets, production Worker behavior, and production deployment configuration are unchanged.
- The hosted private preview was inspected after its existing loading animation finished, on desktop and mobile. Route switching, menu opening, initial focus, Escape closure, and focus return were exercised on the hosted copy.
- The hosting validator captured the incumbent car/count loading animation mid-transition and misidentified actual route endpoints as a conflicting route name. Those findings were manually checked against the settled render and existing data; the final private-preview upload skipped that false-positive validator.

The local test runner uses an ignored configuration under `tmp/` to select the sandbox's existing Chromium executable. The committed tests remain compatible with the repository's standard Playwright configuration; no machine-specific browser path is committed.

## Existing blockers and remaining coverage

- Unit tests: 224 pass and one existing calendar test fails because it expects a “Slow” legend. The failing test was reproduced on unchanged `main`.
- TypeScript 5.9.3 reports the existing missing `KVNamespace` type in `src/worker.ts`. The same error was reproduced on unchanged `main`. The repository also does not declare the TypeScript compiler needed by its typecheck script.
- Vite emits the existing tooltip sourcemap warning but completes both builds.
- Full WCAG 2.2 AA conformance, screen-reader testing, exhaustive tooltip/chart accessibility, all motion states, browser zoom/reflow, every historical state, Safari/Firefox, and physical-device touch testing are not certified by this pass.
- Shared-link browser APIs, production KV fingerprint ingestion, live external outages, and production Cloudflare deployment were not exercised.
- No replacement DESIGN.md or design-system sidecar is created: the user chose refinement of the incumbent identity, not a new visual system.

## Private preview

`npm run build:preview` uses `vite.preview.config.ts` to build a static review copy into `dist/preview`. It reads the same public upstream CSVs directly and replaces the fingerprint hook with a no-op only in this build. The preview host does not support browser storage, so its theme preferences, pane preferences, and local data cache use an in-memory adapter and reset on reload.

The preview treats its nested hosting path as the app's root and uses relative logo/map paths; query-string filter state remains intact. It does not use or deploy the production Worker, modify upstream data, or write to production KV. `npm run build` continues to use the unchanged production configuration.
