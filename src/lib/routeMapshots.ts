/**
 * Route mapshot lookup for the Route Explorer.
 *
 * Maps route label_short → image URL + alt text.
 * Images are pre-generated 1050×1050 PNGs in /public/mapshots/.
 */

export interface RouteMapshot {
  imageUrl: string;
  alt: string;
}

const MAPSHOT_BASE = "/mapshots";

/**
 * Deterministic slug from route label: "Airport Expy" → "airport_expy"
 */
function routeSlug(label: string): string {
  return label.toLowerCase().replace(/['']/g, "").replace(/\s+/g, "_");
}

/**
 * Get the mapshot for a route label, or null if no image exists.
 */
export function getRouteMapshot(labelShort: string): RouteMapshot | null {
  if (!labelShort) return null;
  const slug = routeSlug(labelShort);
  return {
    imageUrl: `${MAPSHOT_BASE}/${slug}_1050.png`,
    alt: `Map preview of ${labelShort} route in Bengaluru`,
  };
}
