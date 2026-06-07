// ---------------------------------------------------------------------------
// Tooltip content for all dashboard cards and sections.
// Edit this file to change tooltip text — no code changes needed.
// Each entry: max 4 sentences, friendly tone, technically sound.
// ---------------------------------------------------------------------------

export const TOOLTIP_CONTENT = {
  // ── Route Browser Pane ──────────────────────────────────────────
  routeBrowserPane: {
    title: "Traffic NOW!",
    body: [
      "See if traffic is normal right now.",
      "The coloured diamond shows your current speed, and the neutral band shows what is typical for this time of day (based on 90 days of data).",
      "Diamond inside the band means typical, left of band means slower, right means faster.",
      "Tap any route to explore it on the main charts.",
    ].join(" "),
  },

  // ── Verdict Card ────────────────────────────────────────────────
  verdict: {
    title: "How this verdict works",
    body: [
      "This verdict compares your selected baseline period with the most recent data.",
      "The comparison uses a statistical threshold to determine if traffic has meaningfully improved, worsened, or stayed the same.",
      "Tap the chips above to explore different questions.",
    ].join(" "),
  },

  // ── Baseline Slider ─────────────────────────────────────────────
  baselineSlider: {
    title: "Baseline period",
    body: [
      "Drag the two thumbs to select a baseline period in the past.",
      "The verdict above will compare this baseline with your most recent data to see if traffic has improved or worsened.",
      "Choose a period when traffic was typical for a fair comparison.",
    ].join(" "),
  },

  // ── KPI: Avg Speed ──────────────────────────────────────────────
  kpiAvgSpeed: {
    title: "Average speed",
    body: [
      "The average speed across all trips on this route during your selected period and time slot.",
      "Higher is faster.",
      "For reference, the baseline average is shown below.",
    ].join(" "),
  },

  // ── KPI: Median Trip ────────────────────────────────────────────
  kpiMedianTrip: {
    title: "Median trip duration",
    body: [
      "The middle value: half of all trips were faster than this, half were slower.",
      "It is a better everyday estimate than the average because it is not skewed by extreme delays.",
    ].join(" "),
  },

  // ── KPI: Bad Day Trip ───────────────────────────────────────────
  kpiBadDay: {
    title: "Bad day trip",
    body: [
      "On a bad day, your trip could take this long.",
      "Specifically, 1 in every {badDayN} trips (the {percentile}th percentile) is at least this slow.",
      "Think of it as a realistic worst-case, not a freak event.",
    ].join(" "),
  },

  // ── KPI: No. of Trips ───────────────────────────────────────────
  kpiNumTrips: {
    title: "Number of trips",
    body: [
      "The total number of hourly traffic readings used to calculate the figures above.",
      "More readings mean more reliable statistics.",
      "The time window and granularity (daily or weekly) are shown below.",
    ].join(" "),
  },

  // ── Speed/Duration Chart ────────────────────────────────────────
  chartSpeed: {
    title: "How to read this chart",
    body: [
      "This chart shows how traffic speed changes over time for your selected route, period, and time of day.",
      "The solid line is the average speed per time slot. The dashed green line (Best) shows the 95th percentile — the fastest 5% of trips when roads are clear. The dashed red line (Worst) shows the 5th percentile — the slowest 5% during heavy traffic.",
      "Switch to Trip Duration to see how long trips take instead of how fast traffic moves. The lines flip: Best becomes the 5th percentile (shortest trips) and Worst becomes the 95th percentile (longest trips).",
      "Use the Daily / Weekly toggle to change the time granularity. Daily shows every single day, which can look noisy. Weekly smooths the data by averaging each week, making trends easier to spot.",
    ].join(" "),
  },

  chartDuration: {
    title: "How to read this chart",
    body: [
      "This chart shows how trip duration changes over time for your selected route, period, and time of day.",
      "The solid line is the average trip duration per time slot. The dashed green line (Best) shows the 5th percentile — the quickest 5% of trips when traffic flows smoothly. The dashed red line (Worst) shows the 95th percentile — the longest 5% when delays pile up.",
      "Switch to Speed to see how fast traffic moves instead of how long trips take. The lines flip: Best becomes the 95th percentile (fastest trips) and Worst becomes the 5th percentile (slowest trips).",
      "Use the Daily / Weekly toggle to change the time granularity. Daily shows every single day, which can look noisy. Weekly smooths the data by averaging each week, making trends easier to spot.",
    ].join(" "),
  },

  // ── Weekly Speed Distribution ────────────────────────────────────
  forecastBands: {
    title: "Weekly speed distribution",
    body: [
      "This chart shows how speeds were distributed across each week, filtered to your selected time bracket.",
      "The dark centre line is the median (50th percentile) — the typical trip speed that week.",
      "The inner band (15th–85th percentile) captures the core range where most trips fell.",
      "The outer band (5th–95th percentile) shows the full spread including unusually fast and slow trips.",
      "Use the baseline slider to compare a reference period against recent weeks.",
    ].join(" "),
  },

  // ── Daily Speeds Calendar ───────────────────────────────────────
  dailyCalendar: {
    title: "Daily speeds calendar",
    body: [
      "Each circle represents a day, coloured by average speed — darker or greener means faster, lighter or redder means slower.",
      "Hover over any day to see detailed stats: average speed, median trip time, bad-day trip time, and number of readings.",
      "Future days show a dashed outline; past days with no data are also dashed.",
      "Use the arrows to navigate between months.",
    ].join(" "),
  },
} as const;

// Helper: fill template placeholders like {badDayN}, {percentile}
export function fillTemplate(
  text: string,
  vars: Record<string, string | number>
): string {
  return text.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? `{${key}}`));
}
