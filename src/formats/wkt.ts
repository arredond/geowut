import { geoJSONToWkt, wktToGeoJSON } from "betterknown";
import type { Geometry, Position } from "geojson";
import { UnsupportedDataError } from "../errors";
import {
  crsTransform,
  mapPositions,
  NeedsProjectionError,
} from "../projection";

/** EWKT's SRID, other than WGS84, as betterknown hands it over ("EPSG:3857"), reprojected. */
function unproject(from: string, _to: string, position: Position): Position {
  const srid = Number(/\d+$/.exec(from)?.[0]);
  const toLngLat = crsTransform({ epsg: srid }, "That EWKT");
  return toLngLat ? toLngLat(position) : position;
}

/**
 * WKT, or PostGIS's EWKT with its SRID first, as a geometry: null if it isn't WKT. An empty one
 * (POINT EMPTY) is null too, having nothing to draw. M values are dropped, as GeoJSON has no
 * place for them.
 */
export function parseWkt(text: string): Geometry | null {
  if (!wholeGeometry(text)) return null;
  let geometry: Geometry | null;
  try {
    geometry = wktToGeoJSON(text, { proj: unproject });
  } catch (error) {
    // Ours say why the SRID can't be shown, or that proj4 is needed; betterknown's only that it isn't WKT.
    if (
      error instanceof UnsupportedDataError ||
      error instanceof NeedsProjectionError
    )
      throw error;
    return null;
  }
  if (!geometry || isEmpty(geometry)) return null;
  // betterknown keeps ZM's M as a fourth ordinate; it drops XYM's on its own.
  return mapPositions(geometry, (p) => p.slice(0, 3));
}

/**
 * Whether the text ends where its geometry does, as betterknown stops reading there and would
 * take "POINT (1 2) and more", or the first of several lines, for the whole.
 */
function wholeGeometry(text: string): boolean {
  let depth = 0;
  for (const [i, char] of [...text].entries()) {
    if (char === "(") depth++;
    else if (char === ")" && --depth === 0) return !text.slice(i + 1).trim();
  }
  return /\bEMPTY\s*$/i.test(text);
}

const isEmpty = (geometry: Geometry): boolean =>
  geometry.type === "GeometryCollection"
    ? geometry.geometries.length === 0
    : geometry.coordinates.length === 0;

/** WKT, with a space after each comma as most tools write it (betterknown writes none). */
export const toWkt = (geometry: Geometry): string =>
  geoJSONToWkt(geometry).replaceAll(",", ", ");
