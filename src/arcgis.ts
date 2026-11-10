import { arcgisToGeoJSON } from "@terraformer/arcgis";
import type { Feature, Geometry, Position } from "geojson";

/** Data that was recognised but can't be shown, with a message saying why. */
export class UnsupportedDataError extends Error {}

const GEOMETRY_KEYS = ["points", "paths", "rings"];
const WEB_MERCATOR_WKIDS = [102100, 102113, 3857, 900913, 3785];
const WGS84_WKIDS = [4326];
const EARTH_RADIUS_M = 6378137;

type ArcGIS = Record<string, unknown>;

const isObject = (value: unknown): value is ArcGIS =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Esri JSON has no GeoJSON "type", but one of its geometry shapes, attributes, or a list of features. */
export function isArcGIS(value: unknown): value is ArcGIS {
  if (!isObject(value) || "type" in value) return false;
  return (
    (typeof value.x === "number" && typeof value.y === "number") ||
    GEOMETRY_KEYS.some((key) => Array.isArray(value[key])) ||
    ["xmin", "ymin", "xmax", "ymax"].every(
      (key) => typeof value[key] === "number",
    ) ||
    isObject(value.geometry) ||
    isObject(value.attributes) ||
    (Array.isArray(value.features) && value.features.every(isArcGIS))
  );
}

/**
 * Esri JSON (a geometry, an envelope, a feature or a feature set such as a REST query
 * response, or a list of those) as GeoJSON features in WGS84. Web Mercator, which ArcGIS
 * services often answer in, is unprojected; other spatial references are refused.
 */
export function arcgisToFeatures(json: ArcGIS | ArcGIS[]): Feature[] {
  const items = Array.isArray(json) ? json : [json];
  return items.flatMap((item) =>
    Array.isArray(item.features)
      ? (item.features as ArcGIS[]).flatMap((feature) =>
          toFeatures(feature, wkidOf(item.spatialReference)),
        )
      : toFeatures(item, undefined),
  );
}

/** One ArcGIS geometry or feature, in its own spatial reference or else the one it inherits. */
function toFeatures(item: ArcGIS, inherited: number | undefined): Feature[] {
  const geometry = isObject(item.geometry) ? item.geometry : undefined;
  const wkid =
    wkidOf(item.spatialReference) ??
    wkidOf(geometry?.spatialReference) ??
    inherited;
  const toLngLat = unprojection(wkid);

  // Handled here, so Terraformer needn't warn about it.
  const { spatialReference: _, ...plain } = item;
  if (geometry) {
    const { spatialReference: __, ...plainGeometry } = geometry;
    plain.geometry = plainGeometry;
  }
  const geojson = arcgisToGeoJSON(plain) as Feature | Geometry;
  const feature: Feature =
    geojson.type === "Feature"
      ? geojson
      : { type: "Feature", geometry: geojson, properties: null };
  if (!feature.geometry) return [];
  return [{ ...feature, geometry: mapPositions(feature.geometry, toLngLat) }];
}

/** The wkid a spatialReference names, if it is one. */
function wkidOf(reference: unknown): number | undefined {
  if (!isObject(reference)) return undefined;
  const wkid = reference.latestWkid ?? reference.wkid;
  if (typeof wkid === "number") return wkid;
  if (reference.wkt !== undefined)
    throw new UnsupportedDataError(
      "That Esri JSON uses a custom spatial reference (WKT); only WGS84 and Web Mercator can be shown.",
    );
  return undefined;
}

function unprojection(
  wkid: number | undefined,
): ((position: Position) => Position) | null {
  if (wkid === undefined || WGS84_WKIDS.includes(wkid)) return null;
  if (WEB_MERCATOR_WKIDS.includes(wkid))
    return ([x, y, ...rest]) => [
      (x / EARTH_RADIUS_M) * (180 / Math.PI),
      (2 * Math.atan(Math.exp(y / EARTH_RADIUS_M)) - Math.PI / 2) *
        (180 / Math.PI),
      ...rest,
    ];
  throw new UnsupportedDataError(
    `That Esri JSON is in spatial reference ${wkid}; only WGS84 (4326) and Web Mercator (3857/102100) can be shown. Ask the service for outSR=4326.`,
  );
}

function mapPositions(
  geometry: Geometry,
  map: ((position: Position) => Position) | null,
): Geometry {
  if (!map) return geometry;
  if (geometry.type === "GeometryCollection")
    return {
      ...geometry,
      geometries: geometry.geometries.map((g) => mapPositions(g, map)),
    };
  const walk = (coords: unknown): unknown =>
    typeof (coords as unknown[])[0] === "number"
      ? map(coords as Position)
      : (coords as unknown[]).map(walk);
  return { ...geometry, coordinates: walk(geometry.coordinates) } as Geometry;
}
