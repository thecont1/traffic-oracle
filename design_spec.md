## Visual model

Represent uncertainty as three layers: outer interval \(p05 \rightarrow p95\), inner interval \(p15 \rightarrow p85\), and a foreground median or observed line. The outer interval should read as “possible but less likely,” the inner interval as “typical range,” and the center line as the primary signal. [w3](https://www.w3.org/WAI/WCAG21/Understanding/non-text-contrast.html)

Do not differentiate the two bands by opacity alone. WCAG’s use-of-color guidance requires a second cue, so combine fill depth with boundary style, texture, or explicit legend text. [digitala11y](https://www.digitala11y.com/understanding-sc-1-4-11-non-text-contrast/)

## Per-mode spec

| Mode | p05–p95 | p15–p85 | Median / actual | Notes |
|---|---|---|---|---|
| Default color | Light fill + upper/lower rails  [w3c.github](https://w3c.github.io/wcag21/understanding/21/non-text-contrast.html) | Darker fill, optional subtle pattern  [w3c.github](https://w3c.github.io/wcag21/understanding/21/non-text-contrast.html) | Highest-contrast solid line  [w3c.github](https://w3c.github.io/wcag21/understanding/21/non-text-contrast.html) | Intervals visible but subordinate |
| Grayscale | Sparse diagonal hatch + rails  [digitala11y](https://www.digitala11y.com/understanding-sc-1-4-11-non-text-contrast/) | Solid gray fill  [digitala11y](https://www.digitala11y.com/understanding-sc-1-4-11-non-text-contrast/) | Black or near-black line  [w3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) | Must work with hue removed |
| Compare mode | Use rails or patterned band for series B  | Filled band for series A  | Two strong lines with distinct dash/shape  [w3c.github](https://w3c.github.io/wcag21/understanding/21/non-text-contrast.html) | Avoid stacked translucent mush |

In compact cards or sparklines, filled double bands usually collapse into blur. In that mode, keep p15–p85 as the only fill and render p05/p95 as thin dashed rails so the wider interval survives at small sizes. [w3c.github](https://w3c.github.io/wcag21/understanding/21/non-text-contrast.html)

## Tokens

Use semantic tokens, not raw colors in components. This keeps light, dark, and grayscale implementations predictable. [w3](https://www.w3.org/WAI/WCAG21/Understanding/non-text-contrast.html)

```css
:root {
  --tn-surface: #f7f7f5;
  --tn-grid: #c7c7c2;
  --tn-text: #1f2328;

  --tn-series: #0f766e;
  --tn-series-contrast: #0b4f4a;

  --tn-band-outer-fill: color-mix(in oklab, var(--tn-series) 18%, var(--tn-surface));
  --tn-band-outer-stroke: #4e6663;

  --tn-band-inner-fill: color-mix(in oklab, var(--tn-series) 38%, var(--tn-surface));
  --tn-band-inner-stroke: #214d48;

  --tn-line-main: #073b3a;
  --tn-line-compare: #7a3e00;

  --tn-focus: #005fcc;
}
```

For dark mode, raise luminance separation rather than merely increasing opacity. Non-text contrast is measured against adjacent colors, so band edges and lines need distinct local contrast from the plot background and nearby fills. [webaim](https://webaim.org/articles/contrast/)

## Geometry rules

Use an actual closed area for each interval, not a translucent rectangle behind the line. Meaningful graphical objects in charts must remain discernible, and a bounded area with visible edges is easier to perceive than a low-alpha haze. [w3c.github](https://w3c.github.io/wcag21/understanding/21/non-text-contrast.html)

Recommended minimums:
- Main line: 3px.
- Compare line: 2.5px plus dash pattern.
- Outer boundary rails: 1.5–2px.
- Inner band boundary: 1.5px.
- Minimum visible band thickness in tiny views: aim for 6px; if thinner, switch to rails-only rendering.  
Thin anti-aliased strokes can be technically present but effectively invisible, so the rendering should switch modes when screen density or chart height gets tight. [w3](https://www.w3.org/WAI/WCAG21/Understanding/non-text-contrast.html)

## Interaction

Hover and keyboard focus should promote the active series by increasing line weight and darkening interval edges, not just changing color. Accessible SVG guidance recommends focusable interactive graphics with names, descriptions, and keyboard operability. [w3](https://www.w3.org/TR/svg-aam-1.0/)

Tooltip copy should always use explicit percentile language, for example:
- “Core range: 15th–85th percentile”
- “Wide range: 5th–95th percentile”
- “Observed traffic” or “Median expected traffic”  
That satisfies the “not color only” requirement better than a legend with two unlabeled swatches. [digitala11y](https://www.digitala11y.com/understanding-sc-1-4-11-non-text-contrast/)

## SVG semantics

For inline SVG charts, provide a `<title>` and `<desc>` on the root SVG so assistive tech has an accessible name and summary. SVG accessibility mappings support accessible naming and descriptions for charts and graphics, and SVG best practice commonly uses `<title>` plus `<desc>` for this. [data.europa](https://data.europa.eu/apps/data-visualisation-guide/accessible-svg-and-aria)

Use this pattern:

```html
<svg
  role="img"
  aria-labelledby="trafficnow-title trafficnow-desc"
  viewBox="0 0 800 320"
>
  <title id="trafficnow-title">TrafficNOW forecast bands for Hosur Road</title>
  <desc id="trafficnow-desc">
    The chart shows a wide uncertainty interval from the 5th to 95th percentile,
    a core interval from the 15th to 85th percentile, and the observed traffic line.
  </desc>
  ...
</svg>
```

If points or slices are focusable, each interactive target needs a programmatic name and keyboard access, not hover-only disclosure. [a11y-collective](https://www.a11y-collective.com/blog/svg-accessibility/)

## React/SVG component contract

Ask the agent to implement the chart with explicit rendering modes rather than one style stretched across all views. A small mode switch produces cleaner accessibility than endless conditional opacity tweaks.

```ts
type ViewingMode = 'default' | 'grayscale' | 'compare' | 'compact';

type IntervalDatum = {
  x: string | number;
  p05: number;
  p15: number;
  p50?: number;
  p85: number;
  p95: number;
  observed?: number;
};

type IntervalSeriesStyle = {
  line: string;
  lineWidth: number;
  lineDash?: string;
  outerFill?: string;
  outerStroke: string;
  innerFill?: string;
  innerStroke: string;
  patternId?: string;
};
```

Render order should be:
1. Gridlines.
2. p05–p95 area or rails.
3. p15–p85 area.
4. Median / observed line.
5. Focus markers.
6. Tooltip anchor targets.  
This preserves hierarchy so the uncertainty remains visible without overwhelming the primary line. [w3c.github](https://w3c.github.io/wcag21/understanding/21/non-text-contrast.html)

## Example implementation

```tsx
const modeStyles = {
  default: {
    outerFill: 'var(--tn-band-outer-fill)',
    outerStroke: 'var(--tn-band-outer-stroke)',
    innerFill: 'var(--tn-band-inner-fill)',
    innerStroke: 'var(--tn-band-inner-stroke)',
    line: 'var(--tn-line-main)',
    lineWidth: 3,
  },
  grayscale: {
    outerFill: 'url(#pattern-p05-p95)',
    outerStroke: '#666',
    innerFill: '#9a9a9a',
    innerStroke: '#555',
    line: '#111',
    lineWidth: 3,
  },
  compact: {
    outerFill: 'none',
    outerStroke: '#5f6b6a',
    innerFill: 'var(--tn-band-inner-fill)',
    innerStroke: '#2c4e4b',
    line: '#111',
    lineWidth: 2.5,
  },
};
```

For compare mode, make series A use fills and series B use rails plus dashed line, or vice versa. Two filled interval systems on the same plot tend to destroy separability, especially when colors converge or the user switches to grayscale.

## Acceptance criteria

Tell the agent to ship only if these are true:

- Every meaningful interval edge and line passes 3:1 non-text contrast against adjacent background or neighboring filled area. [w3](https://www.w3.org/WAI/WCAG21/Understanding/non-text-contrast.html)
- Axis labels, legends, and tooltip text pass 4.5:1 unless they qualify as large text at 3:1. [w3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
- p15–p85 and p05–p95 remain distinguishable in grayscale without relying on hue. [digitala11y](https://www.digitala11y.com/understanding-sc-1-4-11-non-text-contrast/)
- Compact mode does not use double low-opacity fills.
- Compare mode uses distinct geometry, not just distinct colors.
- The SVG has `<title>` and `<desc>`, and interactive targets are keyboard reachable. [w3](https://www.w3.org/TR/svg-aam-1.0/)

A practical visual baseline for TrafficNOW! is: solid center line, darker inner band, lighter outer rails, texture fallback in grayscale, and asymmetric uncertainty rendering in compare mode. That will read cleanly across all three views and survive real-world accessibility testing.