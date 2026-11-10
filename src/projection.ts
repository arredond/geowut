import type { Geometry, Position } from "geojson";
import { UnsupportedDataError } from "./errors";

const EARTH_RADIUS_M = 6378137;

type Transform = (position: Position) => Position;
type Proj4 = typeof import("proj4");

/** Web Mercator metres (EPSG:3857) to longitude and latitude, keeping any further ordinates. */
export function webMercatorToLngLat([x, y, ...rest]: Position): Position {
  return [
    (x / EARTH_RADIUS_M) * (180 / Math.PI),
    (2 * Math.atan(Math.exp(y / EARTH_RADIUS_M)) - Math.PI / 2) *
      (180 / Math.PI),
    ...rest,
  ];
}

/** The geometry with every position passed through map, or as it is without one. */
export function mapPositions(
  geometry: Geometry,
  map: Transform | null,
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

/**
 * A coordinate reference system, however a format names it: an EPSG code, WKT (1 or 2, as in
 * a Shapefile's .prj or a GeoPackage) or PROJJSON (GeoParquet). Any of them will do; given
 * both, WKT or PROJJSON is used, sparing the EPSG table's download.
 */
export interface Crs {
  epsg?: number;
  wkt?: string;
  projjson?: object;
}

/**
 * Longitude and latitude already, as far as a map can tell: WGS84 and the datums within a metre
 * or so of it (ETRS89, NAD83, GDA2020...), which need no proj4 to be drawn. 0 is PostGIS's "none".
 */
const LNG_LAT_EPSG = [0, 4326, 4979, 4258, 4269, 4283, 7844, 4617, 4167];
const WEB_MERCATOR_EPSG = [3857, 900913, 3785, 102100, 102113];

/** A parser met a CRS that needs proj4, or EPSG codes it hasn't loaded: load them and try again. */
export class NeedsProjectionError extends Error {
  readonly codes: number[];
  constructor(codes: number[]) {
    super("Projection support isn't loaded yet");
    this.codes = codes;
  }
}

let proj4: Proj4 | undefined;
/** proj4 definitions by EPSG code, once the table is loaded. */
let epsgDefinitions: Record<string, string> | undefined;

/**
 * How to take a CRS's coordinates to longitude and latitude: null if they already are. Throws
 * NeedsProjectionError until withProjections has loaded what it needs, and UnsupportedDataError
 * for a CRS that can't be read. What names the data, as "That EWKT", goes into the messages.
 */
export function crsTransform(crs: Crs, what: string): Transform | null {
  const { epsg, wkt, projjson } = crs;
  // A code GeoWut knows without proj4 settles it, whatever else is given.
  if (epsg !== undefined) {
    if (LNG_LAT_EPSG.includes(epsg)) return null;
    if (WEB_MERCATOR_EPSG.includes(epsg)) return webMercatorToLngLat;
  }
  if (!proj4 || (!wkt && !projjson && !epsgDefinitions))
    throw new NeedsProjectionError(epsg === undefined ? [] : [epsg]);

  const definition = wkt ?? projjson ?? epsgDefinitions![String(epsg)];
  if (!definition)
    throw new UnsupportedDataError(
      `${what} is in EPSG:${epsg}, which GeoWut doesn't know: only 2D projected and geographic systems are included.`,
    );
  let converter: proj4.Converter;
  try {
    converter = proj4(definition as string, "EPSG:4326");
  } catch {
    throw new UnsupportedDataError(
      `${what} has a coordinate system GeoWut can't read${epsg ? ` (EPSG:${epsg})` : ""}.`,
    );
  }
  return ([x, y, ...rest]) => [...converter.forward([x, y]), ...rest];
}

/** Loads proj4 and the EPSG table, each the first time it's wanted. */
async function loadProjections(codes: number[]): Promise<void> {
  proj4 ??= (await import("proj4")).default;
  if (codes.length > 0 && !epsgDefinitions)
    epsgDefinitions = (await import("virtual:epsg-proj4")).default;
}

/**
 * Runs a parser that may meet coordinate systems needing proj4, loading it (and the EPSG table)
 * on demand and trying again: so they're only downloaded for data that needs them.
 */
export async function withProjections<T>(
  parse: () => T | Promise<T>,
): Promise<T> {
  for (;;) {
    try {
      return await parse();
    } catch (error) {
      if (!(error instanceof NeedsProjectionError)) throw error;
      const loaded = proj4 && (error.codes.length === 0 || epsgDefinitions);
      if (loaded) throw error; // Nothing more to load: it would only fail again.
      await loadProjections(error.codes);
    }
  }
}
