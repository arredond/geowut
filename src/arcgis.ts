import { arcgisToGeoJSON } from "@terraformer/arcgis";
import type { Feature, Geometry } from "geojson";
import { crsTransform, mapPositions } from "./projection";
import type { Crs } from "./projection";

const GEOMETRY_KEYS = ["points", "paths", "rings"];

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
 * response, or a list of those) as GeoJSON features in WGS84, reprojected from the spatial
 * reference it names (see crsTransform): a wkid, or WKT.
 */
export function arcgisToFeatures(json: ArcGIS | ArcGIS[]): Feature[] {
  const items = Array.isArray(json) ? json : [json];
  return items.flatMap((item) =>
    Array.isArray(item.features)
      ? (item.features as ArcGIS[]).flatMap((feature) =>
          toFeatures(feature, crsOf(item.spatialReference)),
        )
      : toFeatures(item, undefined),
  );
}

/** One ArcGIS geometry or feature, in its own spatial reference or else the one it inherits. */
function toFeatures(item: ArcGIS, inherited: Crs | undefined): Feature[] {
  const geometry = isObject(item.geometry) ? item.geometry : undefined;
  const crs =
    crsOf(item.spatialReference) ??
    crsOf(geometry?.spatialReference) ??
    inherited;
  const toLngLat = crs ? crsTransform(crs, "That Esri JSON") : null;

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

/** The CRS a spatialReference names, by wkid (latest first: the EPSG code where there is one) or WKT. */
function crsOf(reference: unknown): Crs | undefined {
  if (!isObject(reference)) return undefined;
  const wkid = reference.latestWkid ?? reference.wkid;
  if (typeof wkid === "number") return { epsg: wkid };
  if (typeof reference.wkt === "string") return { wkt: reference.wkt };
  return undefined;
}
