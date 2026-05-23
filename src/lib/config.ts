// ---------------------------------------------------------------------------
// Shared AppConfig type — matches config.json shape
// ---------------------------------------------------------------------------

export interface CityConfig {
  name: string;
  data_source?: {
    routes_csv: string;
    traffic_csv: string;
  };
}

export interface AppConfig {
  cities: CityConfig[];
  percentile: {
    worst_case: number;
    verdict_threshold_kmh: number;
  };
  defaults: {
    route: string;
    period: string;
    time_of_day: string;
    question_mode: "worsened" | "improved";
    baseline_start: string;
    baseline_end: string;
    time_aggregation: "daily" | "weekly";
    chart_metric: "speed" | "duration";
  };
  route_pane: {
    open: boolean;
    width: number;
    min_width: number;
    max_width: number;
    polling_interval_min: number;
  };
}
