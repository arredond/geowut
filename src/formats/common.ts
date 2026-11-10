import type { Feature, GeoJsonProperties, Geometry } from "geojson";

export const validLngLat = (lng: number, lat: number) =>
  Number.isFinite(lng) &&
  Number.isFinite(lat) &&
  Math.abs(lng) <= 180 &&
  Math.abs(lat) <= 90;

export function toFeature(
  geometry: Geometry,
  properties: GeoJsonProperties = null,
): Feature {
  return { type: "Feature", geometry, properties };
}

/** A rectangle as a polygon, for codes that name an area: geohashes and plus codes. */
export function rectangleFeature(
  [west, south, east, north]: [number, number, number, number],
  properties: GeoJsonProperties,
): Feature {
  return toFeature(
    {
      type: "Polygon",
      coordinates: [
        [
          [west, south],
          [east, south],
          [east, north],
          [west, north],
          [west, south],
        ],
      ],
    },
    properties,
  );
}
