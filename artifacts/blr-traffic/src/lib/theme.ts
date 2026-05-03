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
function calColour(kmh: number, p10: number, p90: number): string {
  const t  = p90 > p10 ? (kmh - p10) / (p90 - p10) : 0.5;
  const tc = Math.max(0, Math.min(1, t));
  if (tc < 0.5) {
    const s = tc * 2;
    return `rgba(${Math.round(239+(245-239)*s)},${Math.round(68+(158-68)*s)},${Math.round(68+(11-68)*s)},0.92)`;
  }
  const s = (tc - 0.5) * 2;
  return `rgba(${Math.round(245+(34-245)*s)},${Math.round(158+(197-158)*s)},${Math.round(11+(94-11)*s)},0.92)`;
}

function calGray(kmh: number, p10: number, p90: number): string {
  const t  = p90 > p10 ? (kmh - p10) / (p90 - p10) : 0.5;
  const tc = Math.max(0, Math.min(1, t));
  const v  = Math.round(34 + tc * (240 - 34));
  return `rgb(${v},${v},${v})`;
}

function calPastel(kmh: number, p10: number, p90: number): string {
  const t  = p90 > p10 ? (kmh - p10) / (p90 - p10) : 0.5;
  const tc = Math.max(0, Math.min(1, t));
  if (tc < 0.5) {
    const s = tc * 2;
    return `rgba(${Math.round(248+(254-248)*s)},${Math.round(187+(215-187)*s)},${Math.round(208+(170-208)*s)},0.92)`;
  }
  const s = (tc - 0.5) * 2;
  return `rgba(${Math.round(254+(187-254)*s)},${Math.round(215+(247-215)*s)},${Math.round(170+(208-170)*s)},0.92)`;
}

/* ── Chip tokens per theme ──────────────────────────────────────── */
const COLOUR_CHIPS: Record<ChipVariant, ChipToken> = {
  route:    { bg:"linear-gradient(135deg,#10b981,#06b6d4)", color:"white", border:"transparent", shadow:"0 4px 14px rgba(16,185,129,0.35)" },
  period:   { bg:"linear-gradient(135deg,#8b5cf6,#3b82f6)", color:"white", border:"transparent", shadow:"0 4px 14px rgba(139,92,246,0.35)" },
  tod:      { bg:"linear-gradient(135deg,#f59e0b,#ef4444)", color:"white", border:"transparent", shadow:"0 4px 14px rgba(245,158,11,0.35)" },
  worsened: { bg:"linear-gradient(135deg,#ef4444,#f97316)", color:"white", border:"transparent", shadow:"0 4px 14px rgba(239,68,68,0.35)" },
  improved: { bg:"linear-gradient(135deg,#10b981,#22c55e)", color:"white", border:"transparent", shadow:"0 4px 14px rgba(16,185,129,0.4)" },
  city:     { bg:"linear-gradient(135deg,#334155,#475569)", color:"white", border:"transparent", shadow:"0 2px 8px rgba(71,85,105,0.3)" },
};

const GRAY_CHIPS: Record<ChipVariant, ChipToken> = {
  route:    { bg:"#ffffff", color:"#111111", border:"#111111", shadow:"none" },
  period:   { bg:"#ffffff", color:"#111111", border:"#111111", shadow:"none" },
  tod:      { bg:"#ffffff", color:"#111111", border:"#111111", shadow:"none" },
  worsened: { bg:"#ffffff", color:"#111111", border:"#111111", shadow:"none" },
  improved: { bg:"#ffffff", color:"#111111", border:"#111111", shadow:"none" },
  city:     { bg:"#ffffff", color:"#111111", border:"#111111", shadow:"none" },
};

const PASTEL_CHIPS: Record<ChipVariant, ChipToken> = {
  route:    { bg:"#fce7f3", color:"#be185d", border:"#fbb6d0", shadow:"none" },
  period:   { bg:"#ede9fe", color:"#6d28d9", border:"#c4b5fd", shadow:"none" },
  tod:      { bg:"#fef9c3", color:"#92400e", border:"#fde68a", shadow:"none" },
  worsened: { bg:"#fee2e2", color:"#991b1b", border:"#fca5a5", shadow:"none" },
  improved: { bg:"#dcfce7", color:"#166534", border:"#86efac", shadow:"none" },
  city:     { bg:"#f3f4f6", color:"#374151", border:"#d1d5db", shadow:"none" },
};

/* ── Theme definitions ──────────────────────────────────────────── */
export const THEMES: Record<ThemeKey, AppTheme> = {
  colour: {
    key: "colour",
    isDark: true,
    bodyBg: "linear-gradient(135deg,#0f1728 0%,#0d1a1f 40%,#130f28 100%)",
    textPrimary:   "#f1f5f9",
    textSecondary: "#94a3b8",
    textMuted:     "#64748b",
    headerBg: "rgba(15,18,40,0.88)",
    sectionBg: "rgba(20,28,50,0.85)",
    cardBg:    "rgba(20,30,55,0.92)",
    cardBorder: "1px solid hsl(var(--border))",
    cardShadow: "none",
    titleStyle: { background:"linear-gradient(90deg,#2563eb,#7c3aed)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" },
    chips: COLOUR_CHIPS,
    napkin: { baseline:"#60a5fa", recent:"#f472b6", gap:"#475569" },
    slider: {
      track:            "linear-gradient(90deg,#34d399,#60a5fa,#a78bfa,#f472b6)",
      stripe:           "repeating-linear-gradient(45deg,transparent,transparent 4px,rgba(255,255,255,0.55) 4px,rgba(255,255,255,0.55) 8px)",
      dim:              "rgba(0,0,0,0.45)",
      thumbLeftBorder:  "#34d399",
      thumbRightBorder: "#a78bfa",
      thumbLeftShadow:  "0 2px 8px rgba(52,211,153,0.5),0 1px 3px rgba(0,0,0,0.2)",
      thumbRightShadow: "0 2px 8px rgba(167,139,250,0.5),0 1px 3px rgba(0,0,0,0.2)",
      thumbFg: "#e2e8f0",
    },
    kpiCardBgs: [
      "linear-gradient(135deg,#052e16 60%,#064e3b)",
      "linear-gradient(135deg,#1e3a5f 60%,#1e40af)",
      "linear-gradient(135deg,#451a03 60%,#713f12)",
      "linear-gradient(135deg,#2e1065 60%,#4c1d95)",
    ],
    chart: { line1:"#2dd4bf", line2:"#f472b6", line3:"#a78bfa", line4:"#60a5fa" },
    calColor: calColour,
    calTextColor: () => "#fff",
    verdictBg:     ()  => "rgba(30,40,60,0.8)",
    verdictBorder: (b) => b,
    verdictText:   ()  => "#f1f5f9",
    speedGood: "#34d399",
    speedBad:  "#f87171",
    baselineLabel: "#60a5fa",
    recentLabel:   "#f472b6",
    emptyCalCircle: "rgba(148,163,184,0.15)",
  },

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
    titleStyle: { color:"#111111", WebkitTextFillColor:"#111111" },
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
    chart: { line1:"#555555", line2:"#999999", line3:"#555555", line4:"#333333" },
    calColor: calGray,
    calTextColor: (t) => t > 0.5 ? "#111111" : "#ffffff",
    verdictBg:     ()  => "#ffffff",
    verdictBorder: ()  => "#111111",
    verdictText:   ()  => "#111111",
    speedGood: "#333333",
    speedBad:  "#555555",
    baselineLabel: "#555555",
    recentLabel:   "#333333",
    emptyCalCircle: "rgba(0,0,0,0.06)",
  },

  pastel: {
    key: "pastel",
    isDark: false,
    bodyBg: "#fdf0f5",
    textPrimary:   "#1e1e2e",
    textSecondary: "#555577",
    textMuted:     "#8888aa",
    headerBg: "rgba(253,240,245,0.88)",
    sectionBg: "#ffffff",
    cardBg:    "#ffffff",
    cardBorder: "1px solid rgba(236,72,153,0.18)",
    cardShadow: "0 2px 8px rgba(236,72,153,0.08)",
    titleStyle: { background:"linear-gradient(90deg,#ec4899,#8b5cf6)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" },
    chips: PASTEL_CHIPS,
    napkin: { baseline:"#93c5fd", recent:"#f9a8d4", gap:"#e9d5ff" },
    slider: {
      track:            "linear-gradient(90deg,#fbb6d0,#c4b5fd)",
      stripe:           "repeating-linear-gradient(45deg,transparent,transparent 4px,rgba(255,255,255,0.6) 4px,rgba(255,255,255,0.6) 8px)",
      dim:              "rgba(0,0,0,0.22)",
      thumbLeftBorder:  "#f9a8d4",
      thumbRightBorder: "#c4b5fd",
      thumbLeftShadow:  "0 2px 8px rgba(249,168,212,0.5)",
      thumbRightShadow: "0 2px 8px rgba(196,181,253,0.5)",
      thumbFg: "#ffffff",
    },
    kpiCardBgs: ["#fce7f3", "#ede9fe", "#dcfce7", "#fef9c3"],
    chart: { line1:"#93c5fd", line2:"#f9a8d4", line3:"#c4b5fd", line4:"#86efac" },
    calColor: calPastel,
    calTextColor: () => "#1e1e2e",
    verdictBg:     (vBg)     => vBg,
    verdictBorder: (vBorder) => vBorder,
    verdictText:   (vTc)     => vTc,
    speedGood: "#10b981",
    speedBad:  "#ef4444",
    baselineLabel: "#93c5fd",
    recentLabel:   "#f9a8d4",
    emptyCalCircle: "rgba(236,72,153,0.08)",
  },
};
