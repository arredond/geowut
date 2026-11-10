import { arcgisToFeatures, isArcGIS } from "../arcgis";
import { parseCellIds } from "../cellIds";
import { toFeature, validLngLat } from "./common";
import { parseDms } from "./dms";
import { geohashFeature } from "./geohash";
import { parseMapUrl } from "./mapUrl";
import { plusCodeFeature } from "./plusCode";
import { polylineFeature } from "./polyline";
import { wkbFeature } from "./wkb";
import { parseWkt } from "./wkt";
import type { Feature, GeoJSON } from "geojson";

/** Throws UnsupportedDataError for data it recognises but can't show, such as Esri JSON in an unknown projection. */
export function parseFeatures(text: string): Feature[] {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    // Not JSON, fall through to JSON lines and WKT.
  }
  // Bare numbers and strings are JSON too, but read better as cell IDs and the like.
  if (json !== undefined && typeof json === "object")
    return jsonToFeatures(json);

  return (
    parseJsonLines(text) ??
    parseWktFeatures(text) ??
    parseCoordinateLines(text) ??
    parseCellIds(text) ??
    parseTokens(text) ??
    []
  );
}

/** Lines of JSON: GeoJSONSeq (RFC 8142) also leads each record with an ASCII record separator. */
// oxlint-disable-next-line no-control-regex
const JSON_LINE_BREAK = /\r?\n|\x1e/;

/**
 * Whether the text is a valid but empty collection: GeoJSON or Esri JSON with no features (as
 * exporting an empty map gives), an empty list, or GeoJSON lines of them. Such text isn't wrong,
 * only empty, and deserves saying so.
 */
export function isEmptyCollection(text: string): boolean {
  const lines = text.split(JSON_LINE_BREAK).filter((line) => line.trim());
  if (lines.length === 0) return false;
  return lines.every((line) => {
    let json: unknown;
    try {
      json = JSON.parse(line);
    } catch {
      return false;
    }
    if (Array.isArray(json)) return json.length === 0;
    return (
      isObject(json) &&
      Array.isArray((json as { features?: unknown }).features) &&
      (json as { features: unknown[] }).features.length === 0
    );
  });
}

export function jsonToFeatures(json: object | null): Feature[] {
  if (isBboxArray(json)) {
    const bbox = bboxFeature(json);
    return bbox ? [bbox] : [];
  }
  if (
    isArcGIS(json) ||
    (Array.isArray(json) && json.length > 0 && json.every(isArcGIS))
  )
    return arcgisToFeatures(json);
  return isObject(json) ? geoJsonToFeatures(json as GeoJSON) : [];
}

/**
 * Newline-delimited GeoJSON (or Esri JSON): a feature or geometry per line, as GDAL's GeoJSONSeq
 * and BigQuery's exports write them, record separators and all. Null unless every line is JSON.
 */
function parseJsonLines(text: string): Feature[] | null {
  const lines = text
    .split(JSON_LINE_BREAK)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return null;
  const features: Feature[] = [];
  for (const line of lines) {
    let json: unknown;
    try {
      json = JSON.parse(line);
    } catch {
      return null;
    }
    if (typeof json !== "object") return null;
    features.push(...jsonToFeatures(json));
  }
  return features;
}

/** WKT or EWKT, as one feature: null if it isn't either, or is empty. */
function parseWktFeatures(text: string): Feature[] | null {
  const geometry = parseWkt(text);
  return geometry ? [toFeature(geometry)] : null;
}

/** Prefixes that say what a token is, where it could be read more than one way. */
const TOKEN_PREFIX =
  /^(gh|geohash|polyline5?|polyline6|pluscode|olc|wkb):(.+)$/i;

/**
 * IDs and encodings that stand alone, split by commas, spaces or lines: hex WKB or EWKB, plus
 * codes, geohashes and encoded polylines, tried in that order. Null unless every one is one.
 */
function parseTokens(text: string): Feature[] | null {
  const tokens = text.split(/[\s,;]+/).filter(Boolean);
  if (tokens.length === 0) return null;
  const features: Feature[] = [];
  for (const token of tokens) {
    const feature = parseToken(token);
    if (!feature) return null;
    features.push(feature);
  }
  return features;
}

function parseToken(token: string): Feature | null {
  const prefixed = TOKEN_PREFIX.exec(token);
  if (prefixed) {
    const [, prefix, value] = prefixed;
    switch (prefix.toLowerCase()) {
      case "gh":
      case "geohash":
        return geohashFeature(value, true);
      case "pluscode":
      case "olc":
        return plusCodeFeature(value);
      case "wkb":
        return wkbFeature(value);
      case "polyline6":
        return polylineFeature(value, 6);
      default:
        return polylineFeature(value, 5);
    }
  }
  return (
    wkbFeature(token) ??
    plusCodeFeature(token) ??
    geohashFeature(token, false) ??
    polylineFeature(token)
  );
}

const isBboxArray = (value: unknown): value is number[] =>
  Array.isArray(value) &&
  value.length === 4 &&
  value.every((n) => typeof n === "number");

/** GDAL-style option flags and ogrinfo's "Extent:" label that may precede a bbox. */
const BBOX_PREFIX = /^(?:-te|-spat|-projwin|extent:)\s*/i;
const NUMBER = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i;

/**
 * Each line is a bounding box with four numbers, a comma-separated "lat, lng" pair, a point in
 * degrees, minutes and seconds (or with hemisphere letters), or a map link. Bboxes accept GDAL's
 * -te/-spat (xmin ymin xmax ymax), -projwin (ulx uly lrx lry) and ogrinfo's
 * "Extent: (xmin, ymin) - (xmax, ymax)", since taking the min and max of each axis makes the
 * corner order irrelevant. Any line that fits none rejects the whole input, with null.
 */
function parseCoordinateLines(text: string): Feature[] | null {
  const features: Feature[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim().replace(BBOX_PREFIX, "");
    if (!line) continue;

    const point = parseDms(line) ?? parseMapUrl(line);
    if (point) {
      features.push(toFeature({ type: "Point", coordinates: point }));
      continue;
    }

    const tokens = line.split(/[\s,()]+/).filter((t) => t && t !== "-");
    if (!tokens.every((t) => NUMBER.test(t))) return null;
    const numbers = tokens.map(Number);

    if (numbers.length === 4) {
      const bbox = bboxFeature(numbers);
      if (!bbox) return null;
      features.push(bbox);
    } else if (numbers.length === 2 && line.includes(",")) {
      const [lat, lng] = numbers;
      if (!validLngLat(lng, lat)) return null;
      features.push(toFeature({ type: "Point", coordinates: [lng, lat] }));
    } else {
      return null;
    }
  }
  return features.length > 0 ? features : null;
}

/** A rectangle from two opposite corners in any order, or null if it is empty or off the globe. */
function bboxFeature([x1, y1, x2, y2]: number[]): Feature | null {
  const [west, east] = [Math.min(x1, x2), Math.max(x1, x2)];
  const [south, north] = [Math.min(y1, y2), Math.max(y1, y2)];
  if (west === east || south === north) return null;
  if (!validLngLat(west, south) || !validLngLat(east, north)) return null;
  return toFeature({
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
  });
}

const isObject = (value: unknown): value is object =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function geoJsonToFeatures(geojson: GeoJSON): Feature[] {
  switch (geojson.type) {
    case "FeatureCollection":
      return Array.isArray(geojson.features)
        ? geojson.features.filter((feature) => feature?.geometry)
        : [];
    case "Feature":
      return geojson.geometry ? [geojson] : [];
    default:
      return "coordinates" in Object(geojson) || "geometries" in Object(geojson)
        ? [toFeature(geojson)]
        : [];
  }
}
