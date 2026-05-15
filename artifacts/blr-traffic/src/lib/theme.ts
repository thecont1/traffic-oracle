import type { CSSProperties } from "react";

export type ThemeKey = "colour" | "gray" | "pastel";

export const THEME_CYCLE: ThemeKey[] = ["colour", "gray", "pastel"];

export const THEME_META: Record<ThemeKey, { icon: string; label: string }> = {
  colour: { icon: "🎨", label: "Colour me surprised!" },
  gray:   { icon: "☁️",  label: "Scale me gray!" },
  pastel: { icon: "🌸", label: "Clear as day!" },
};

export type ChipVariant = "route" | "period" | "tod" | "worsened" | "improved" | "city";

export interface ChipToken {
  bg: string;
  color: string;
  border: string;
  shadow: string;
}

export interface AppTheme {
  key: ThemeKey;
  isDark: boolean;
  bodyBg: string;

  textPrimary: string;
  textSecondary: string;
  textMuted: string;

  headerBg: string;
  sectionBg: string;
  cardBg: string;
  cardBorder: string;
  cardShadow: string;

  titleStyle: CSSProperties;

  chips: Record<ChipVariant, ChipToken>;

  napkin: { baseline: string; recent: string; gap: string };

  slider: {
    track: string;
    stripe: string;
    dim: string;
    thumbLeftBorder: string;
    thumbRightBorder: string;
    thumbLeftShadow: string;
    thumbRightShadow: string;
    thumbFg: string;
  };

  kpiCardBgs: [string, string, string, string];

  chart: { line1: string; line2: string; line3: string; line4: string };

  calColor: (kmh: number, p10: number, p90: number) => string;
  calTextColor: (t: number) => string;

  verdictBg:     (vBg: string)     => string;
  verdictBorder: (vBorder: string) => string;
  verdictText:   (vTc: string)     => string;

  speedGood: string;
  speedBad:  string;
  baselineLabel: string;
  recentLabel:   string;

  emptyCalCircle: string;
}

/* ── Calendar colour helpers ────────────────────────────────────── */

/** Colour theme: orange → green gradient, warm & cozy */
function calColour(kmh: number, p10: number, p90: number): string {
  const t  = p90 > p10 ? (kmh - p10) / (p90 - p10) : 0.5;
  const tc = Math.max(0, Math.min(1, t));
  if (tc < 0.5) {
    const s = tc * 2;
    // From #F08A5D (orange/worse) → warm midpoint
    return `rgba(${Math.round(240+(220-240)*s)},${Math.round(138+(170-138)*s)},${Math.round(93+(120-93)*s)},0.92)`;
  }
  const s = (tc - 0.5) * 2;
  // Warm midpoint → #8BCB7E (green/better)
  return `rgba(${Math.round(220+(139-220)*s)},${Math.round(170+(203-170)*s)},${Math.round(120+(126-120)*s)},0.92)`;
}

/** Gray theme: dark → light grayscale */
function calGray(kmh: number, p10: number, p90: number): string {
  const t  = p90 > p10 ? (kmh - p10) / (p90 - p10) : 0.5;
  const tc = Math.max(0, Math.min(1, t));
  const v  = Math.round(34 + tc * (240 - 34));
  return `rgb(${v},${v},${v})`;
}

/** Pastel theme: orange → green gradient, warm & sunny */
function calPastel(kmh: number, p10: number, p90: number): string {
  const t  = p90 > p10 ? (kmh - p10) / (p90 - p10) : 0.5;
  const tc = Math.max(0, Math.min(1, t));
  if (tc < 0.5) {
    const s = tc * 2;
    // From #E06A3E (orange) → warm midpoint (#F6E7C8 area)
    return `rgba(${Math.round(224+(246-224)*s)},${Math.round(106+(215-106)*s)},${Math.round(62+(170-62)*s)},0.92)`;
  }
  const s = (tc - 0.5) * 2;
  // Warm midpoint → #6FAE63 (green)
  return `rgba(${Math.round(246+(111-246)*s)},${Math.round(215+(174-215)*s)},${Math.round(170+(99-170)*s)},0.92)`;
}

/* ── Chip tokens per theme ──────────────────────────────────────── */

/** Colour (dark) chips — warm, cozy, muted on dark backgrounds */
const COLOUR_CHIPS: Record<ChipVariant, ChipToken> = {
  route:    { bg:"linear-gradient(135deg,#1E3A5F,#2A5A8F)", color:"#93C5FD", border:"transparent", shadow:"0 4px 14px rgba(30,58,95,0.4)" },
  period:   { bg:"linear-gradient(135deg,#2A2523,#3D3633)", color:"#C1B7A7", border:"transparent", shadow:"0 4px 14px rgba(42,37,35,0.4)" },
  tod:      { bg:"linear-gradient(135deg,#78350F,#92400E)", color:"#FCD34D", border:"transparent", shadow:"0 4px 14px rgba(120,53,15,0.4)" },
  worsened: { bg:"linear-gradient(135deg,#7F1D1D,#991B1B)", color:"#FCA5A5", border:"transparent", shadow:"0 4px 14px rgba(127,29,29,0.4)" },
  improved: { bg:"linear-gradient(135deg,#052E16,#064E3B)", color:"#86EFAC", border:"transparent", shadow:"0 4px 14px rgba(5,46,22,0.4)" },
  city:     { bg:"linear-gradient(135deg,#1E293B,#334155)", color:"#94A3B8", border:"transparent", shadow:"0 2px 8px rgba(30,41,59,0.4)" },
};

/** Gray chips — white bg, dark text, differentiated by weight/border */
const GRAY_CHIPS: Record<ChipVariant, ChipToken> = {
  route:    { bg:"#ffffff", color:"#111111", border:"#111111", shadow:"none" },
  period:   { bg:"#ffffff", color:"#111111", border:"#999999", shadow:"none" },
  tod:      { bg:"#ffffff", color:"#111111", border:"#999999", shadow:"none" },
  worsened: { bg:"#ffffff", color:"#111111", border:"#999999", shadow:"none" },
  improved: { bg:"#ffffff", color:"#111111", border:"#999999", shadow:"none" },
  city:     { bg:"#ffffff", color:"#111111", border:"#cccccc", shadow:"none" },
};

/** Pastel chips — warm, sunny, paper-like tints */
const PASTEL_CHIPS: Record<ChipVariant, ChipToken> = {
  route:    { bg:"#DBEAFE", color:"#1E40AF", border:"#93C5FD", shadow:"none" },
  period:   { bg:"#F3F0EB", color:"#6E675B", border:"#DCCFB8", shadow:"none" },
  tod:      { bg:"#FEF3C7", color:"#92400E", border:"#FDE68A", shadow:"none" },
  worsened: { bg:"#FFEDD5", color:"#9A3412", border:"#FED7AA", shadow:"none" },
  improved: { bg:"#DCFCE7", color:"#166534", border:"#86EFAC", shadow:"none" },
  city:     { bg:"#F3F4F6", color:"#4B5563", border:"#D1D5DB", shadow:"none" },
};

/* ── Theme definitions ──────────────────────────────────────────── */
export const THEMES: Record<ThemeKey, AppTheme> = {

  /* ── Colour (dark) — "Colour me surprised!" ─────────────────── */
  colour: {
    key: "colour",
    isDark: true,
    bodyBg: "linear-gradient(135deg,#1D1B1A 0%,#262321 40%,#1F1C19 100%)",
    textPrimary:   "#F3EBDD",
    textSecondary: "#C1B7A7",
    textMuted:     "#8C7E6B",
    headerBg: "rgba(29,27,26,0.92)",
    sectionBg: "#262321",
    cardBg:    "#2A2725",
    cardBorder: "1px solid #47413C",
    cardShadow: "none",
    titleStyle: { display:"inline-block", background:"linear-gradient(90deg,#7DB7E8,#9AA3AD)", backgroundClip:"text", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", color:"transparent" },
    chips: COLOUR_CHIPS,
    napkin: { baseline:"#9AA3AD", recent:"#7DB7E8", gap:"#47413C" },
    slider: {
      track:            "linear-gradient(90deg,#7DB7E8,#9AA3AD)",
      stripe:           "repeating-linear-gradient(45deg,transparent,transparent 4px,rgba(255,255,255,0.55) 4px,rgba(255,255,255,0.55) 8px)",
      dim:              "rgba(0,0,0,0.45)",
      thumbLeftBorder:  "#7DB7E8",
      thumbRightBorder: "#9AA3AD",
      thumbLeftShadow:  "0 2px 8px rgba(125,183,232,0.5),0 1px 3px rgba(0,0,0,0.2)",
      thumbRightShadow: "0 2px 8px rgba(154,163,173,0.5),0 1px 3px rgba(0,0,0,0.2)",
      thumbFg: "#F3EBDD",
    },
    kpiCardBgs: [
      "linear-gradient(135deg,#1A2744 60%,#1E40AF)",
      "linear-gradient(135deg,#2A2523 60%,#3D3633)",
      "linear-gradient(135deg,#3D1A08 60%,#78350F)",
      "linear-gradient(135deg,#262321 60%,#334155)",
    ],
    chart: { line1:"#7DB7E8", line2:"#9AA3AD", line3:"#9AA3AD", line4:"#F08A5D" },
    calColor: calColour,
    calTextColor: () => "#F3EBDD",
    verdictBg:     ()  => "rgba(38,35,33,0.92)",
    verdictBorder: (b) => b,
    verdictText:   ()  => "#F3EBDD",
    speedGood: "#8BCB7E",
    speedBad:  "#F08A5D",
    baselineLabel: "#9AA3AD",
    recentLabel:   "#7DB7E8",
    emptyCalCircle: "rgba(125,183,232,0.12)",
  },

  /* ── Gray — "Scale me gray!" ──────────────────────────────── */
  gray: {
    key: "gray",
    isDark: false,
    bodyBg: "#ffffff",
    textPrimary:   "#111111",
    textSecondary: "#444444",
    textMuted:     "#888888",
    headerBg: "rgba(255,255,255,0.95)",
    sectionBg: "#ffffff",
    cardBg:    "#ffffff",
    cardBorder: "1px solid #e0e0e0",
    cardShadow: "none",
    titleStyle: { display:"inline-block", color:"#111111", WebkitTextFillColor:"#111111", background:"none" },
    chips: GRAY_CHIPS,
    napkin: { baseline:"#555555", recent:"#111111", gap:"#cccccc" },
    slider: {
      track:            "#e0e0e0",
      stripe:           "repeating-linear-gradient(45deg,transparent,transparent 4px,rgba(0,0,0,0.30) 4px,rgba(0,0,0,0.30) 8px)",
      dim:              "rgba(0,0,0,0.07)",
      thumbLeftBorder:  "#555555",
      thumbRightBorder: "#333333",
      thumbLeftShadow:  "0 2px 6px rgba(0,0,0,0.2)",
      thumbRightShadow: "0 2px 6px rgba(0,0,0,0.2)",
      thumbFg: "#ffffff",
    },
    kpiCardBgs: ["#ffffff", "#ffffff", "#ffffff", "#ffffff"],
    chart: { line1:"#111111", line2:"#888888", line3:"#111111", line4:"#888888" },
    calColor: calGray,
    calTextColor: (t) => t > 0.5 ? "#111111" : "#ffffff",
    verdictBg:     ()  => "#ffffff",
    verdictBorder: ()  => "#111111",
    verdictText:   ()  => "#111111",
    speedGood: "#111111",
    speedBad:  "#555555",
    baselineLabel: "#555555",
    recentLabel:   "#111111",
    emptyCalCircle: "rgba(0,0,0,0.06)",
  },

  /* ── Pastel — "Clear as day!" ──────────────────────────────── */
  pastel: {
    key: "pastel",
    isDark: false,
    bodyBg: "#F9F4E8",
    textPrimary:   "#2B2924",
    textSecondary: "#6E675B",
    textMuted:     "#8A8176",
    headerBg: "rgba(249,244,232,0.92)",
    sectionBg: "#FFF9F0",
    cardBg:    "#FFFFFF",
    cardBorder: "1px solid #DCCFB8",
    cardShadow: "0 2px 8px rgba(0,0,0,0.06)",
    titleStyle: { display:"inline-block", background:"linear-gradient(90deg,#3A86C8,#8F98A3)", backgroundClip:"text", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", color:"transparent" },
    chips: PASTEL_CHIPS,
    napkin: { baseline:"#8F98A3", recent:"#3A86C8", gap:"#DCCFB8" },
    slider: {
      track:            "linear-gradient(90deg,#3A86C8,#8F98A3)",
      stripe:           "repeating-linear-gradient(45deg,transparent,transparent 4px,rgba(255,255,255,0.6) 4px,rgba(255,255,255,0.6) 8px)",
      dim:              "rgba(0,0,0,0.22)",
      thumbLeftBorder:  "#3A86C8",
      thumbRightBorder: "#8F98A3",
      thumbLeftShadow:  "0 2px 8px rgba(58,134,200,0.5)",
      thumbRightShadow: "0 2px 8px rgba(143,152,163,0.5)",
      thumbFg: "#FFFFFF",
    },
    kpiCardBgs: [
      "linear-gradient(135deg,#EFF6FF,#BFDBFE)",
      "linear-gradient(135deg,#F9F6F0,#E8E0D0)",
      "linear-gradient(135deg,#FFF5ED,#FED7AA)",
      "linear-gradient(135deg,#F3F4F6,#D1D5DB)",
    ],
    chart: { line1:"#3A86C8", line2:"#8F98A3", line3:"#8F98A3", line4:"#E06A3E" },
    calColor: calPastel,
    calTextColor: () => "#2B2924",
    verdictBg:     (vBg)     => vBg,
    verdictBorder: (vBorder) => vBorder,
    verdictText:   (vTc)     => vTc,
    speedGood: "#6FAE63",
    speedBad:  "#E06A3E",
    baselineLabel: "#8F98A3",
    recentLabel:   "#3A86C8",
    emptyCalCircle: "rgba(58,134,200,0.08)",
  },
};
