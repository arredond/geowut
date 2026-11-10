import type { Feature, Geometry } from "geojson";

/**
 * Past these, Terra Draw, which keeps every feature editable, makes the map crawl: the rest of
 * a big file is left out, saying so.
 */
export const MAX_FEATURES = 20_000;
export const MAX_VERTICES = 1_000_000;

function vertexCount(geometry: Geometry): number {
  if (geometry.type === "GeometryCollection")
    return geometry.geometries.reduce((n, g) => n + vertexCount(g), 0);
  const count = (coords: unknown): number =>
    typeof (coords as unknown[])[0] === "number"
      ? 1
      : (coords as unknown[]).reduce<number>((n, c) => n + count(c), 0);
  return count(geometry.coordinates);
}

/** The features up to the caps above, in order. */
export function capFeatures(features: Feature[]): Feature[] {
  let vertices = 0;
  for (const [i, feature] of features.entries()) {
    vertices += vertexCount(feature.geometry);
    if (i >= MAX_FEATURES || vertices > MAX_VERTICES)
      return features.slice(0, i);
  }
  return features;
}
