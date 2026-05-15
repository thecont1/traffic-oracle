// ---------------------------------------------------------------------------
// Shared AppConfig type — matches config.json shape
// ---------------------------------------------------------------------------

export interface AppConfig {
  worst_case_percentile: number;
  verdict_threshold_kmh: number;
  baseline_default_start: string;
  baseline_default_end: string;
}