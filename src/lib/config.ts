// ---------------------------------------------------------------------------
// Shared AppConfig type — matches config.json shape
// ---------------------------------------------------------------------------

export interface AppConfig {
  city: {
    name: string;
    data_source: {
      routes_csv: string;
      traffic_csv: string;
    };
  };
  percentile: {
    worst_case: number;
    verdict_threshold_kmh: number;
  };
  baseline: {
    default_start: string;
    default_end: string;
  };
  defaults: {
    period: string;
    time_of_day: string;
    question_mode: "worsened" | "improved";
  };
  route_pane: {
    open: boolean;
    width: number;
    min_width: number;
    max_width: number;
  };
}
