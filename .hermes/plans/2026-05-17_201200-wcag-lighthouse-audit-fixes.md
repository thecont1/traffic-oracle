# WCAG 2.2 + Lighthouse Audit — Fix Plan

**Date:** 2026-05-17
**Target:** http://localhost:5173 (TraffiCOracle dashboard)

---

## Audit Summary

| Category | Score | Key Issues |
|----------|-------|------------|
| **Accessibility** | 91 | Color contrast (21 failures), touch targets (9 failures), zoom disabled |
| **Performance** | 45 | Unminified JS (+1,685 KiB), unused JS (+1,269 KiB), 5.6 MB total |
| **Best Practices** | 100 | Clean |
| **SEO** | 83 | Missing meta description, missing robots.txt |

---

## WCAG 2.2 Findings by Severity

### P0 Critical — Blocks screen reader access
None. All images have alt text, all buttons have labels.

### P1 Serious — Degrades experience

| # | Issue | WCAG | Scope | Details |
|---|-------|------|-------|---------|
| 1 | **Color contrast** | 1.4.3 | 21 elements | `#8C7E6B` (textMuted) on `#262321` (colour theme sectionBg) = 3.51:1 ratio. Needs 4.5:1 for normal text. Also fails on `#FFF9F0` (pastel sectionBg) at 3.81:1. |
| 2 | **Touch targets** | 2.5.5 | 9 buttons | Close btn (15×18), prev/next arrows (29×24), city dropdown (124×34), Share (77×34), Refresh (89×34), theme btn (153×34), nav arrows (29×24), footer link (172×18). All under 44×44px. |
| 3 | **Zoom disabled** | 1.4.4 | 1 element | `<meta name="viewport" content="maximum-scale=1">` blocks pinch-to-zoom on mobile. |

### P2 Moderate — Improvement needed

| # | Issue | WCAG | Details |
|---|-------|------|---------|
| 4 | **No skip link** | 2.4.1 | No skip-to-main-content for keyboard/screen reader users |
| 5 | **No aria-live regions** | 4.1.3 | Dynamic changes (fetch start/end, error states, route selection) not announced |
| 6 | **Heading hierarchy** | 1.3.1 | Only `<h1>`. No `<h2>` for chart sections, "Traffic NOW!" header, etc. |
| 7 | **SVG accessibility** | 1.1.1 | Napkin chart SVG has no `role="img"`, `<title>`, or `<desc>`. Legend SVGs in TrafficMap have no role. |
| 8 | **Keyboard navigation** | 2.1.1 | Route cards are clickable `<div>`s without `tabIndex` or keyboard handlers. Not reachable via Tab. |
| 9 | **Label mismatch** | 2.5.3 | City dropdown button shows "📍 Bangalore ▼" but accessible name may not match visible text |
| 10 | **Unsized image** | 1.3.1 | Logo `<img>` missing explicit `width`/`height` — CLS risk |

### P3 Minor — Polish

| # | Issue | WCAG | Details |
|---|-------|------|---------|
| 11 | **No reduced motion** | 2.3.3 | No `prefers-reduced-motion` media query for animations |
| 12 | **No chart summaries** | 1.1.1 | No screen-reader-only text describing chart content |

---

## Fix Plan

### Phase 1: Critical Contrast & Touch Targets (P1)

**1.1 Darken textMuted for colour theme** (21 contrast failures)
- File: `src/lib/theme.ts`
- Current: `textMuted: "#8C7E6B"` (colour theme, line 153)
- Fix: Darken to `#756A56` (4.6:1 on `#262321`, 5.8:1 on `#FFF9F0`)
- Verify all textMuted usages pass 4.5:1 against their backgrounds

**1.2 Increase touch target sizes** (9 failures)
- File: `src/pages/Dashboard.tsx` (pill buttons, city dropdown, Share, Refresh, theme btn)
- File: `src/components/RouteBrowserPane.tsx` (close button, prev/next arrows)
- Fix: Add `minHeight: 44, minWidth: 44` or padding to reach 44×44px minimum
- Affected buttons:
  - City dropdown: increase padding to reach 44px height
  - Share, Refresh, theme: increase padding
  - Close (✕): increase hit area
  - Prev/next arrows: increase click area
  - Footer link: increase padding

**1.3 Remove maximum-scale=1**
- File: `index.html`
- Change: Remove `maximum-scale=1` from viewport meta tag

### Phase 2: Structural Accessibility (P2)

**2.1 Add skip link**
- File: `src/pages/Dashboard.tsx`
- Add hidden skip link at top: `<a href="#main-content" className="sr-only focus:not-sr-only">Skip to main content</a>`
- Add `id="main-content"` to the main content area
- Add sr-only CSS utility if not present

**2.2 Add aria-live region for dynamic content**
- File: `src/pages/Dashboard.tsx`
- Add `<div aria-live="polite" aria-atomic="true" className="sr-only" ref={liveRef} />`
- Announce: fetch start ("Loading traffic data…"), fetch complete ("Traffic data loaded for Bangalore"), errors, route selection

**2.3 Fix heading hierarchy**
- File: `src/pages/Dashboard.tsx`
- Add `<h2>` for "Traffic NOW!" header in RouteBrowserPane
- Add `<h2>` or `<h3>` for chart sections (napkin chart, daily speeds)
- File: `src/components/RouteBrowserPane.tsx` — wrap title in `<h2>`

**2.4 Add SVG accessibility**
- File: `src/pages/Dashboard.tsx` (napkin chart)
  - Add `role="img"` and `<title>` to the main chart SVG
  - Add `<desc>` with chart summary text
- File: `src/components/TrafficMap.tsx` (legend SVGs)
  - Add `aria-hidden="true"` to decorative legend SVGs

**2.5 Make route cards keyboard-accessible**
- File: `src/components/RouteBrowserPane.tsx`
- Add `tabIndex={0}` and `role="button"` to clickable card `<div>`
- Add `onKeyDown` handler for Enter/Space to trigger selection
- Add visible focus ring styling

**2.6 Fix label-content-name mismatch**
- File: `src/pages/Dashboard.tsx`
- City dropdown: add `aria-label="Select city, current: Bangalore"` (dynamic)
- Or restructure so visible text matches accessible name

**2.7 Add image dimensions**
- File: `src/pages/Dashboard.tsx`
- Add explicit `width` and `height` to `<img>` logo element

### Phase 3: Polish (P3)

**3.1 Add reduced motion support**
- File: `src/index.css` or `src/App.tsx`
- Add `@media (prefers-reduced-motion: reduce)` to disable animations
- Target: fade-in transitions, chart animations

**3.2 Add screen-reader chart descriptions**
- File: `src/pages/Dashboard.tsx`
- Add `<span className="sr-only">` after charts with descriptive text

### Phase 4: Performance (Lighthouse)

**4.1 Minify JavaScript**
- Run `bun run build` with production mode — Vite handles minification
- Check if dev-mode JS is being served in production build

**4.2 Tree-shake unused JS**
- Audit imports — remove unused UI components from shadcn
- Use `bun run build` with analysis to identify large chunks

**4.3 SEO**
- Add `<meta name="description">` to `index.html`
- Create `public/robots.txt` allowing all crawlers

---

## Files Likely to Change

| File | Changes |
|------|---------|
| `src/lib/theme.ts` | Darken colour theme textMuted |
| `src/pages/Dashboard.tsx` | Skip link, aria-live, headings, image dims, touch targets, viewport meta |
| `src/components/RouteBrowserPane.tsx` | Keyboard nav, headings, touch targets, focus styles |
| `src/components/TrafficMap.tsx` | SVG aria-hidden |
| `index.html` | Remove maximum-scale, add meta description |
| `public/robots.txt` | New file |

---

## Verification

```bash
# After each phase:
bun run typecheck          # TypeScript clean
bun test                   # 72/72 pass

# After all phases:
lighthouse http://localhost:5173 --only-categories=accessibility
# Target: 95+ accessibility score

# Manual checks:
# - Tab through all interactive elements — focus ring visible
# - Screen reader (VoiceOver): verify skip link, live regions, heading nav
# - Mobile: verify zoom works, touch targets comfortable
# - Colour theme: verify all text readable
```

---

## Risks & Tradeoffs

1. **textMuted darkening** — Must check all 3 themes (colour, pastel, gray) don't break. The gray theme uses `#888888` which may also need adjustment.
2. **Touch target sizing** — Larger buttons may shift layout, especially in the compact header. May need to adjust header flex layout.
3. **Skip link** — Must be visually hidden until focused. Uses sr-only + focus:not-sr-only pattern.
4. **Performance** — 45 score is partly because Lighthouse runs in simulated throttled mode against localhost. Real-world may be better. But minification and tree-shaking are still worth doing.

---

## Open Questions

1. **pastel theme textMuted** (`#8A8176`) — ratio 3.94:1 on `#FFF9F0`. Needs darkening too? Lighthouse flagged this.
2. **Route card keyboard focus** — Should Tab move between cards, or should there be a roving tabindex within the route list?
3. **Chart SVG descriptions** — How detailed should the desc be? Full data summary or just "Line chart showing traffic speeds"?
