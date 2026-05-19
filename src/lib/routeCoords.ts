/* Hardcoded start/end lat-lng pairs for each Bangalore route.
   Derived from label_full place names in csv-routes-bangalore.csv. */
export type LatLng = [number, number];

export const ROUTE_COORDS: Record<string, [LatLng, LatLng]> = {
  "Hosur Road":            [[12.9003, 77.6401], [12.8445, 77.6776]],
  "Mysore Road":           [[12.9341, 77.5013], [12.9716, 77.5930]],
  "Sarjapur Road":         [[12.8726, 77.6891], [12.9344, 77.6161]],
  "Old Airport Road":      [[12.9719, 77.7079], [12.9577, 77.6485]],
  "North Inner Ring":      [[12.9976, 77.5739], [12.9987, 77.6013]],
  "North Outer Ring":      [[13.0358, 77.5887], [12.9758, 77.5705]],
  "East Inner Ring":       [[12.9815, 77.5978], [12.9189, 77.6073]],
  "East Outer Ring":       [[13.0014, 77.6540], [12.9392, 77.6952]],
  "South Outer Ring":      [[12.9289, 77.5737], [12.9741, 77.5187]],
  "Double Decker Flyover": [[12.9284, 77.5892], [12.9121, 77.6376]],
  "Central Diagonal 1":    [[12.9971, 77.5545], [12.9344, 77.6287]],
  "Central Diagonal 2":    [[12.9415, 77.5726], [12.9987, 77.6196]],
  "Airport Expy":          [[12.9761, 77.6057], [13.1989, 77.7063]],
};

export const BLR_BOUNDS: [LatLng, LatLng] = [[12.83, 77.48], [13.22, 77.74]];
