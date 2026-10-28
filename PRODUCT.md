# traffiCOracle Product Context

<!-- impeccable:product-schema 1 -->

Product decisions confirmed by Mahesh Shantaram on 28 October 2026. Implementation observations were checked against repository revision `6d0c257` and the running site; observations describe the current product, not promises about future capabilities.

## Platform

web

## Users

- **Primary:** researchers, journalists, and city planners examining traffic patterns, route health, and change over time in Bangalore.
- **Secondary:** residents and commuters seeking context about familiar roads and unusual conditions.
- **Core job:** determine whether a monitored road is performing unusually, how it compares with other monitored roads, and whether conditions have improved or worsened relative to an explicit historical baseline.

## Product Purpose

traffiCOracle is a traffic comparison and reference tool, analogous to a weather app for roads. It makes observed traffic patterns understandable through question-led exploration, historical comparisons, and current route context.

Success means that a reader can understand a finding, identify the route and time window behind it, distinguish current conditions from historical trends, and share the relevant view. It is not a turn-by-turn navigation service or a precise recommendation engine for leaving now versus a few minutes later.

## Positioning

The product's focus is route health and unusual conditions, not departure-time optimization. Its current mechanism combines repeated observations on predetermined routes, explicit baseline/recent comparisons, percentile-based context, and the Rolling Relative Route Scoring System (R³S²).

R³S² is supporting comparative evidence, not an unexplained score that replaces the finding. Preserve the distinction between a route's own historical context and its relative standing among monitored routes.

## Operating Context

- The public application is served at https://co.thecontrarian.in/ and its source repository is https://github.com/thecont1/traffic-oracle.
- The user selects a route, time-of-day grouping, question, and comparison period to investigate a finding. Desktop also exposes baseline selection, historical exploration through Time Traveller, charts, and a traffic calendar.
- TrafficNOW! provides current route conditions alongside usual ranges and contextual comparisons. Current conditions and historical findings must remain distinguishable.
- Mobile is a distinct, route-led companion with swipeable route selection and a simplified comparison workflow, not a compressed copy of every desktop control.
- Shareable views are part of the research and communication workflow. Preserve existing URL-state behavior without promising that every transient UI state is serialized.
- Data freshness refers to the underlying observations, not merely the time a page or request finished loading.

## Capabilities and Constraints

- **Coverage:** Bangalore is the currently configured data-backed city. Other city names in `src/config.json` do not establish working datasets or supported coverage.
- **Collection boundary:** traffic collection, dataset publication, and canonical R³S² scoring belong to the separate `traffic-monitor-lizard` project. Preserve that project and its separate URL; do not move canonical scoring into this frontend as a design side effect.
- **Application architecture:** the existing React/TypeScript/Vite app uses separate desktop and mobile shells with shared analytics and data modules. Bun is the repository's documented package manager.
- **Backend reality:** a Cloudflare Worker handles CSV proxying and fingerprint-event ingestion. `src/hooks/use-fingerprint.ts` posts `visitor_id`, `confidence`, `kind`, `request_id`, `page`, and `ts` to `/api/fp-ingest`; `src/worker.ts` stores accepted events in `FP_EVENTS` with a 90-day TTL (7,776,000 seconds). Browser-side analytics do not make the entire application server-free; do not repeat blanket “no server,” “no tracking,” or “everything stays on your device” claims.
- **Statistical meaning:** retain units, route endpoints, time-of-day context, baseline/recent dates, uncertainty information, and data limitations. Do not present estimates as directly observed values or sampled routes as exhaustive city coverage.
- **Preservation scope:** retain the question-led workflow, R³S² context, shareable views, and distinct desktop/mobile experiences unless a later task explicitly changes them.
- **Scope of initialization:** this record does not authorize UI redesign, altered statistical methods, new product claims, infrastructure changes, or deployment.

## Brand Commitments

- Preserve the name `traffiCOracle`, existing logo assets, and creator attribution.
- Retain established feature terminology where it identifies existing behavior: TrafficNOW!, Route Observer, City Explorer, and Time Traveller.
- Plain-language questions and findings are part of the product's explanatory approach. Copy must make the comparison and time frame clear rather than imply unsupported certainty.
- Initialization does not choose a palette, type system, visual direction, or new brand personality.

## Evidence on Hand

- `index.html`: product metadata, canonical address, civic-accountability framing, and existing social assets.
- `src/pages/Dashboard.tsx` and `src/mobile/MobileApp.tsx`: current desktop and mobile workflows.
- `src/core/`, `src/lib/useTrafficData.ts`, and `src/lib/rrsData.ts`: shared calculations, data handling, and consumption of precomputed R³S² data.
- `src/config.json`: configured city coverage, data URLs, defaults, and percentile settings.
- `src/worker.ts`: CSV proxy and fingerprint-event ingestion behavior.
- `public/trafficoracle-light.png` and other existing public assets: incumbent brand materials.
- `README.md`, `src/docs/architecture.md`, and `design_spec.md`: existing documentation to consult critically against implementation and this confirmed product brief.
- `tests/` and `playwright.config.ts`: existing test infrastructure, not proof of comprehensive accessibility or statistical validation.

Do not fabricate testimonials, adoption figures, accuracy benchmarks, official endorsements, or compliance certification.

## Product Principles

- **Research before routing:** prioritize interpretation and comparison over navigation or exact departure advice.
- **Make findings inspectable:** expose the route, time frame, baseline, and statistical context needed to interpret a conclusion.
- **Separate temporal questions:** distinguish present conditions, recent trends, and historical comparisons.
- **Preserve data boundaries:** consume upstream evidence without silently redefining collection or canonical scoring.
- **Keep insight accessible and shareable:** support understandable findings and usable interaction across the distinct desktop and mobile experiences.

## Accessibility & Inclusion

WCAG 2.2 AA is the confirmed target for future UI work. This is a requirement, not a claim that the current implementation already conforms.

Future changes must preserve and verify keyboard access, visible and unobscured focus, meaningful names and semantics, readable contrast, non-color-only communication, appropriate target sizes, and reflow. Interactive charts, tooltips, calendars, swipe interactions, loading states, and motion require particular attention; existing ARIA attributes alone do not establish conformance.

## Open Decisions and Documentation Conflicts

- **Licensing metadata:** `LICENSE.md` contains GNU AGPL Version 3 text while `package.json` declares MIT. This initialization does not resolve or modify that conflict; confirm intended licensing before changing either file.
- **Stale product copy:** README departure-time advice and blanket server-free descriptions conflict with the confirmed positioning and current Worker implementation. This record supersedes those statements for future product work, but does not edit the older documents.
- **Unspecified commitments:** additional city coverage, formal service levels, quantified success metrics, and a multilingual strategy are not confirmed by this initialization.
- **Accessibility status:** no complete WCAG 2.2 AA conformance assessment has been performed as part of init.
