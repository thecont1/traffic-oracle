# Car Animation — Technical Specification

## Overview
An intro animation that plays on page load and on every city change. A car icon races along the baseline slider track from the left thumb to the right thumb while a counter ticks 0→100. After the car arrives, the rest of the page cards reveal smoothly; finally the car and counter fade out together.

## Architecture
- **Single source of truth**: `Dashboard.tsx` contains all animation logic (state, timers, refs).
- **No fixed overlays**: The car is rendered absolutely-positioned *inside* the slider card, not as a global overlay.
- **Render independence**: The animation timer is decoupled from React re-renders via `useRef` and `requestAnimationFrame` polling.

---

## State

```ts
const [showIntro, setShowIntro]     = useState(true);  // hides cards until car finishes
const [showCar,   setShowCar]       = useState(true);  // controls car+counter mount
const [loadPct,   setLoadPct]       = useState(0);     // 0-100 counter value
const [carReady,  setCarReady]      = useState(false); // true once data loaded + track measured
const [carFading, setCarFading]     = useState(false); // triggers shared fade-out
const [settledCity, setSettledCity] = useState<string | null>(null);
```

## Guard Refs (prevent double-fire & timer cancellation)

```ts
const animStarted    = useRef(false);   // start animation exactly once per city
const willReopenPane = useRef(false);   // remember pane state before retract
const cleanupRef     = useRef<...>(null); // stores cleanup fn for effect return
```

## Data-Readiness Refs (avoid adding to effect deps)

```ts
const trackWReadyRef   = useRef(0);  // mirrors trackW
const loadingRef       = useRef(false);  // mirrors loading
const rowCountRef      = useRef(0);      // mirrors rowCount
const routeWeeksRef    = useRef(0);      // mirrors allRouteWeeks.length
```

---

## Timeline (compressed)

| Time | Event |
|------|-------|
| 0 ms | Slider card renders immediately (`citySource` guard). Track invisible until real data arrives (`carReady` opacity wrapper). |
| 0 ms | `waitForTrack` polls until `trackW > 0 && !loading && rowCount > 0 && routeWeeks > 1` |
| 0 ms | Animation kicks off. Counter starts at 0. Car appears at left thumb. |
| 0–1200 ms | Car races right thumb (`track-run` 1.2s). Counter steps 0→5→10…→100. |
| 1200 ms | `showIntro → false` — page cards reveal (`cards-reveal` 0.4s). Car stays visible. |
| 1600 ms | `carFading → true` — shared wrapper div opacity 1→0 over 0.3s. Car + counter fade as one unit. |
| 1900 ms | `showCar → false`, `carFading → false`. React unmounts car node. Pane reopens if needed. |

## CSS Keyframes

```css
@keyframes track-run {
  0%   { left: var(--car-from); opacity: 0; }
  5%   { left: var(--car-from); opacity: 1; }
  85%  { left: var(--car-to);   opacity: 1; }
  100% { left: var(--car-to);   opacity: 1; }
}
```

- **No end-of-keyframe fade-out** — JS controls removal via `showCar`.
- The 5% appear + 85% arrive gives a snappy feel without long pauses.

## Thumb-Relative Positioning

Car starts just right of the left thumb, stops with its front almost touching the right thumb:

```
--car-from = calc(leftTrackPct% + 11px + 4px)
--car-to   = calc(rightTrackPct% - 11px - 80px + 6px)
```

- `11px` = half thumb hit-area width
- `80px` = car SVG width  
- `+6px` = final gap (headlight almost touches right thumb pill)

## Shared Fade Wrapper

Both counter and car are inside one wrapper div so they fade in perfect sync:

```tsx
<div style={{ opacity: carFading ? 0 : 1, transition: "opacity 0.3s ease-out" }}>
  <div>{loadPct}</div>   {/* counter */}
  <svg>...</svg>         {/* car */}
</div>
```

## Slider Visibility During Loading

The slider card renders immediately (so `trackW` is measured right away), but the track + thumbs are wrapped in:

```tsx
<div style={{ opacity: carReady ? 1 : 0, transition: "opacity 0.3s ease" }}>
  <SliderPrimitive.Root ... />
</div>
```

This hides the placeholder `[0,1]` thumb positions during loading and fades in the real slider only when data is ready.

## City-Change Reset

`useLayoutEffect` on `selectedCity` resets all animation state before paint:

```ts
setShowIntro(true);
setShowCar(!!citySource);
setLoadPct(0);
setCarReady(false);
setCarFading(false);
animStarted.current = false;
```

## Critical Rules

1. **Never put `trackW`, `loading`, `rowCount`, or `allRouteWeeks` in the animation effect deps** — read them via refs.
2. **Never use a fixed overlay for the car** — it must live inside the slider card for correct positioning.
3. **The slider card must render immediately on `citySource`** — gated on data only for cards below it.
4. **Counter steps by 5** (`Math.ceil(raw/5)*5`) for a speedometer feel.
5. **No `%` sign** on the counter display.
