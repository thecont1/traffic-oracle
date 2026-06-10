/**
 * Centralized route-condition messaging for R³S².
 *
 * Single source of truth for all user-facing copy about route quality,
 * volatility, and benchmark status. Tune language here — not in components.
 *
 * Tone: plain English, strong, urban, emotionally legible.
 * This is a civic traffic product, not a statistics demo.
 */

// ============================================================================
// Types
// ============================================================================

export type ConditionFamily = 'very_bad' | 'bad' | 'typical' | 'good' | 'very_good';

export type VolatilityTier = 'steady' | 'fairly_steady' | 'choppy' | 'erratic';

export interface RouteConditionInput {
  /** R³S² rank (1 = best) */
  rrsRank: number;
  /** Total routes in the ranking */
  totalRoutes: number;
  /** CV (coefficient of variation) for volatility */
  cv: number;
  /** Speed SD in km/h */
  speedSd: number;
  /** Whether this route is the benchmark */
  isBenchmarkRoute: boolean;
  /** Raw TOD bucket value, e.g. "weekday_evening" */
  tod: string;
  /** Route label for deterministic hashing */
  routeLabel?: string;
}

export interface RouteConditionCopy {
  /** Primary one-liner, e.g. "One of the worst roads in the city this evening." */
  headline: string;
  /** Optional supporting line */
  subline?: string;
  /** Volatility description, e.g. "Traffic swings: 5.99 km/h — this route is erratic." */
  volatilityText: string;
  /** Short volatility label for badges, e.g. "steady", "erratic" */
  volatilityBadge: string;
  /** Only set when isBenchmarkRoute */
  benchmarkNote?: string;
  /** Message family for debug */
  messageFamily: ConditionFamily;
}

// ============================================================================
// Natural time phrases from TOD bucket
// ============================================================================

const TOD_NATURAL: Record<string, string> = {
  weekday_morning:   'this morning',
  weekday_afternoon: 'this afternoon',
  weekday_evening:   'this evening',
  weekends:          'this weekend',
  late_hours:        'tonight',
  all:               'today',
};

function naturalTod(tod: string): string {
  return TOD_NATURAL[tod] ?? 'today';
}

// ============================================================================
// Deterministic hash (djb2 — simple, fast, good enough for message selection)
// ============================================================================

function stableHash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

// ============================================================================
// Volatility classification (CV-based, cross-route comparable)
// ============================================================================

/** Classify CV into a user-facing volatility tier. */
export function classifyVolatilityTier(cv: number): VolatilityTier {
  if (cv < 0.08) return 'steady';
  if (cv < 0.14) return 'fairly_steady';
  if (cv < 0.22) return 'choppy';
  return 'erratic';
}

/** Map tier to a short badge label. */
const VOLATILITY_BADGE: Record<VolatilityTier, string> = {
  steady:        'steady',
  fairly_steady: 'fairly steady',
  choppy:        'choppy',
  erratic:       'erratic',
};

/** Map tier to a plain-English sentence fragment. */
const VOLATILITY_PHRASE: Record<VolatilityTier, string> = {
  steady:        'This route is steady.',
  fairly_steady: 'Fairly predictable day to day.',
  choppy:        'Traffic swings a lot here.',
  erratic:       'This route is all over the place.',
};

// ============================================================================
// Condition family from rank
// ============================================================================

function classifyCondition(rank: number, total: number): ConditionFamily {
  if (total <= 1) return 'typical';
  const pct = rank / total;
  if (pct <= 0.15) return 'very_good';   // top ~15%
  if (pct <= 0.35) return 'good';
  if (pct <= 0.65) return 'typical';
  if (pct <= 0.85) return 'bad';
  return 'very_bad';                      // bottom ~15%
}

// ============================================================================
// Headline copy by condition family
// ============================================================================

const HEADLINES: Record<ConditionFamily, string[]> = {
  very_bad: [
    `One of the worst roads in the city {tod}.`,
    `As bad as it gets {tod}.`,
    `Running badly {tod}.`,
    `Traffic is in rough shape here {tod}.`,
  ],
  bad: [
    `Slower than typical {tod}.`,
    `Still bad, but not the city's worst right now.`,
    `Traffic is dragging here {tod}.`,
  ],
  typical: [
    `About as bad as this road usually is {tod}.`,
    `Pretty typical {tod}.`,
    `Nothing unusual — just the usual grind.`,
  ],
  good: [
    `Holding up well {tod}.`,
    `Faster than typical {tod}.`,
    `Better than this road usually gets.`,
  ],
  very_good: [
    `One of the best roads in the city {tod}.`,
    `Running fast {tod}.`,
    `Traffic is moving well here.`,
  ],
};

function pickHeadline(family: ConditionFamily, tod: string, seed: string): string {
  const options = HEADLINES[family];
  const idx = stableHash(seed) % options.length;
  return options[idx].replace('{tod}', tod);
}

// ============================================================================
// Public API
// ============================================================================

/** Derive all user-facing copy for a route's R³S² context. */
export function getRouteConditionCopy(input: RouteConditionInput): RouteConditionCopy {
  const { rrsRank, totalRoutes, cv, speedSd, isBenchmarkRoute, tod, routeLabel } = input;

  const family = classifyCondition(rrsRank, totalRoutes);
  const volTier = classifyVolatilityTier(cv);
  const todPhrase = naturalTod(tod);

  // Deterministic seed: same route + TOD + family always picks the same headline
  const seed = `${routeLabel ?? ''}|${tod}|${family}`;
  const headline = pickHeadline(family, todPhrase, seed);

  const volatilityBadge = VOLATILITY_BADGE[volTier];
  const volPhrase = VOLATILITY_PHRASE[volTier];

  // Format the swings line
  const sdRounded = speedSd < 1 ? speedSd.toFixed(1) : Math.round(speedSd);
  const volatilityText = `Traffic swings: ${sdRounded} km/h — ${volPhrase}`;

  const result: RouteConditionCopy = {
    headline,
    volatilityText,
    volatilityBadge,
    messageFamily: family,
  };

  // Benchmark special case
  if (isBenchmarkRoute) {
    result.benchmarkNote = "This is Bangalore's benchmark route — the road the rest of the city is judged against.";
  }

  return result;
}

// ============================================================================
// Benchmark-route calendar tooltip copy
// ============================================================================

export const BENCHMARK_CALENDAR_COPY = {
  /** Tooltip body when viewing the benchmark route itself */
  benchmarkRoute: [
    "This is Bangalore's benchmark route — the road the rest of the city is judged against.",
    "",
    "These dots show how this road itself behaved day to day.",
    "They are not a comparison against a better road.",
    "",
    "• Hover any filled day to see its speed and a verdict",
    "• Click any past day to open it in Time Traveller",
  ].join("\n"),

  /** Standard (non-benchmark) calendar tooltip */
  standard: [
    "Each circle is a day. Its colour shows how this road stacked up against Bangalore's benchmark route on the same day and at the same time.",
    "",
    "Green means it kept up. Red means it fell badly behind.",
    "",
    "• Hover any filled day to see the speed ratio and a verdict",
    "• Click any past day to open it in Time Traveller",
    "",
    "Days with a dashed outline are today or in the future — no data yet.",
  ].join("\n"),
};

// ============================================================================
// R³S² explainer copy
// ============================================================================

export const RRS_EXPLAINER = [
  "R³S² is a rolling route-quality score.",
  "It compares this road with the rest of the city over the last 14 days.",
  "Higher scores mean it has been consistently faster.",
  "Lower scores mean it has been struggling.",
].join(" ");
