// ---------------------------------------------------------------------------
// Tooltip content for all dashboard cards and sections.
// Edit this file to change tooltip text — no code changes needed.
// Style: clear headline, plain description, bullet points where relevant.
// ---------------------------------------------------------------------------

export const TOOLTIP_CONTENT = {
  // ── Route Browser Pane ──────────────────────────────────────────
  routeBrowserPane: {
    title: "Traffic NOW!",
    body: [
      "What am I looking at?",
      "",
      "This shows whether traffic right now is faster or slower than usual for this time of day.",
      "",
      "• The coloured diamond is your current speed",
      "• The shaded band is the typical range for this hour",
      "• Diamond inside the band — traffic is normal",
      "• Diamond to the left — slower than usual",
      "• Diamond to the right — faster than usual",
    ].join("\n"),
  },

  // ── Verdict Card ────────────────────────────────────────────────
  verdict: {
    title: "Verdict",
    body: [
      "What am I looking at?",
      "",
      "This is the headline finding — a plain-English answer to whether traffic has improved, worsened, or stayed the same on this route.",
      "",
      "It compares your chosen baseline period (older data) against the most recent data of the same length, and makes a call based on the difference in average speeds.",
      "",
      "• A meaningful change in either direction is flagged clearly",
      "• Small fluctuations that could be random are called \"no significant change\"",
    ].join("\n"),
  },

  // ── Baseline Slider ─────────────────────────────────────────────
  baselineSlider: {
    title: "Compare with this earlier period",
    body: [
      "What am I looking at?",
      "",
      "This slider lets you pick a reference period from the past — your \"baseline.\" The Verdict section will then compare that quieter or busier period to recent traffic, so you can see if things have genuinely improved or gotten worse.",
      "",
      "Drag the two handles to set the start and end of your baseline window.",
    ].join("\n"),
  },

  // ── KPI: Avg Speed ──────────────────────────────────────────────
  kpiAvgSpeed: {
    title: "Avg Speed",
    body: [
      "What am I looking at?",
      "",
      "The average speed of all trips recorded on this route during your selected time period and time slot. Think of it as the typical pace of traffic — higher is better.",
    ].join("\n"),
  },

  // ── KPI: Median Trip ────────────────────────────────────────────
  kpiMedianTrip: {
    title: "Median Trip",
    body: [
      "What am I looking at?",
      "",
      "If you lined up all trips from slowest to fastest, the median is the one in the middle. Half of all trips were faster than this, half were slower.",
      "",
      "It's often a more honest estimate of your typical journey than the average, because it isn't skewed by a handful of very slow or very fast outliers.",
    ].join("\n"),
  },

  // ── KPI: Bad Day Trip ───────────────────────────────────────────
  kpiBadDay: {
    title: "Bad Day Trip",
    body: [
      "What am I looking at?",
      "",
      "This is how long your trip could take on a genuinely bad day — not a worst-ever outlier, but the kind of delay that happens roughly once every 25 journeys.",
      "",
      "Use this number when you need to plan for the unexpected and can't afford to be late.",
    ].join("\n"),
  },

  // ── KPI: No. of Trips ───────────────────────────────────────────
  kpiNumTrips: {
    title: "No. of Trips",
    body: [
      "What am I looking at?",
      "",
      "The total number of traffic readings used to calculate everything on this page. More readings means the figures above are more reliable. A low count means treat the numbers with some caution.",
    ].join("\n"),
  },

  // ── Speed/Duration Chart ────────────────────────────────────────
  chartSpeed: {
    title: "Trip Duration Over Time",
    body: [
      "What am I looking at?",
      "",
      "This chart shows how your journey time has changed day by day over the selected period.",
      "",
      "• Solid line — average trip duration each day",
      "• Green dashed line (Best) — how fast trips were on good days",
      "• Red dashed line (Worst) — how slow trips were on bad days",
      "",
      "A wide gap between Best and Worst means traffic is unpredictable on this route. A narrow gap means it's consistent.",
      "",
      "Switch between Duration and Speed views using the toggle.",
    ].join("\n"),
  },

  chartDuration: {
    title: "Trip Duration Over Time",
    body: [
      "What am I looking at?",
      "",
      "This chart shows how your journey time has changed day by day over the selected period.",
      "",
      "• Solid line — average trip duration each day",
      "• Green dashed line (Best) — how fast trips were on good days",
      "• Red dashed line (Worst) — how slow trips were on bad days",
      "",
      "A wide gap between Best and Worst means traffic is unpredictable on this route. A narrow gap means it's consistent.",
      "",
      "Switch between Duration and Speed views using the toggle.",
    ].join("\n"),
  },

  // ── Weekly Speed Distribution ────────────────────────────────────
  forecastBands: {
    title: "Weekly speed distribution",
    body: [
      "What am I looking at?",
      "",
      "This chart shows how speeds were distributed across each week, filtered to your selected time bracket.",
      "",
      "• The dark centre line is the typical trip speed that week",
      "• The inner band shows the core range where most trips fell",
      "• The outer band shows the full spread including unusually fast and slow trips",
      "",
      "Use the baseline slider to compare a reference period against recent weeks.",
    ].join("\n"),
  },

  // ── Daily Speeds Calendar ───────────────────────────────────────
  dailyCalendar: {
    title: "Good Days and Bad Days",
    body: [
      "What am I looking at?",
      "",
      "This calendar shows how this road performed day by day against Bangalore's benchmark route at the same time of day.",
      "",
      "• Each filled circle is a day with traffic data",
      "• Green means this route kept up better with the city's benchmark road",
      "• Red means it fell further behind",
      "• Hover a day to see the comparison in more detail",
      "• Click a past day to open it in Time Traveller",
      "",
      "The short line below the calendar is a recent route-quality summary. It uses the R³S² score to show how this road has been performing lately compared with the rest of the city.",
    ].join("\n"),
  },

  // ── Daily Calendar — Benchmark Route Special Case ──────────────
  dailyCalendarBenchmark: {
    title: "Good Days and Bad Days",
    body: [
      "What am I looking at?",
      "",
      "This is Bangalore's benchmark route — the road the rest of the city is judged against.",
      "",
      "These dots show how this road itself behaved day to day. They are not a comparison against a better road.",
      "",
      "• Hover any filled day to see its speed and a verdict",
      "• Click any past day to open it in Time Traveller",
      "",
      "The short line below the calendar is a recent route-quality summary using the R³S² score.",
    ].join("\n"),
  },

  // ── R³S² Route Observer ────────────────────────────────────────
  rrsRouteObserver: {
    title: "R³S² Route Quality Score",
    body: [
      "What am I looking at?",
      "",
      "R³S² is traffiCOracle's rolling route-quality score.",
      "",
      "It compares Bangalore's major roads over the last 14 days for the selected time of day and ranks them by how well they have been holding up.",
      "",
      "• Higher scores mean a route has been performing better lately",
      "• Lower scores mean it has been struggling",
      "• The rank and score update when you change the time of day or move through time",
      "",
      "This helps you see which roads have been holding up well lately — and which ones have been a mess.",
    ].join("\n"),
  },
} as const;

// Helper: fill template placeholders like {badDayN}, {percentile}
export function fillTemplate(
  text: string,
  vars: Record<string, string | number>
): string {
  return text.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? `{${key}}`));
}
