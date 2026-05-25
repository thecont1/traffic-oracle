// ---------------------------------------------------------------------------
// URL parameter parsing and share URL construction.
// Extracted from Dashboard.tsx.
// ---------------------------------------------------------------------------

export interface DashboardUrlParams {
  city?: string;
  route?: string;
  tod?: string;
  period?: string;
  mode?: string;
  theme?: string;
  bl?: number;
  br?: number;
  zoom?: number;
  aggregation?: string;
  metric?: string;
  tt?: string;
}

/** Parse dashboard-relevant query parameters from the current URL. */
export function readUrlParams(): DashboardUrlParams {
  if (typeof window === "undefined") return {};
  const p = new URLSearchParams(window.location.search);
  const out: Record<string, string | number> = {};
  if (p.has("city"))        out.city        = p.get("city")!;
  if (p.has("route"))       out.route       = p.get("route")!;
  if (p.has("tod"))         out.tod         = p.get("tod")!;
  if (p.has("period"))      out.period      = p.get("period")!;
  if (p.has("mode"))        out.mode        = p.get("mode")!;
  if (p.has("theme"))       out.theme       = p.get("theme")!;
  if (p.has("bl"))          out.bl          = Number(p.get("bl"));
  if (p.has("br"))          out.br          = Number(p.get("br"));
  if (p.has("zoom"))        out.zoom        = Number(p.get("zoom"));
  if (p.has("aggregation")) out.aggregation = p.get("aggregation")!;
  if (p.has("metric"))      out.metric      = p.get("metric")!;
  if (p.has("tt"))          out.tt          = p.get("tt")!;
  return out as DashboardUrlParams;
}

export interface ShareUrlParams {
  city: string;
  route: string;
  tod: string;
  period: string;
  mode: string;
  theme: string;
  bl: string;
  br: string;
  zoom: string;
  aggregation: string;
  metric: string;
  ttIso?: string;
}

/** Build a shareable URL from the current dashboard state. */
export function buildShareUrl(params: ShareUrlParams): string {
  const p = new URLSearchParams({
    city: params.city,
    route: params.route,
    tod: params.tod,
    period: params.period,
    mode: params.mode,
    theme: params.theme,
    bl: params.bl,
    br: params.br,
    zoom: params.zoom,
    aggregation: params.aggregation,
    metric: params.metric,
  });
  if (params.ttIso) p.set("tt", params.ttIso);
  return `${window.location.origin}${window.location.pathname}?${p.toString()}`;
}
