import { Geodesic } from "geographiclib-geodesic";
import type { Geometry, Position } from "geojson";
import type { Bbox } from "./grids/types";
import { LENGTH_UNIT } from "./units";
import type { Units } from "./units";

const EARTH_RADIUS_KM = 6371;

function walkCoordinates(
  geometry: Geometry,
  visit: (lng: number, lat: number) => void,
): void {
  if (geometry.type === "GeometryCollection") {
    geometry.geometries.forEach((g) => walkCoordinates(g, visit));
    return;
  }

  const walk = (
    coords: Position | Position[] | Position[][] | Position[][][],
  ): void => {
    if (typeof coords[0] === "number") {
      const [lng, lat] = coords as Position;
      visit(lng, lat);
    } else {
      (coords as unknown[]).forEach((c) =>
        walk(c as Position | Position[] | Position[][]),
      );
    }
  };

  walk(
    geometry.coordinates as
      Position | Position[] | Position[][] | Position[][][],
  );
}

export function geometryBbox(geometry: Geometry): Bbox {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;

  walkCoordinates(geometry, (lng, lat) => {
    west = Math.min(west, lng);
    east = Math.max(east, lng);
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  });

  return [west, south, east, north];
}

/**
 * The lowest and highest Z of a geometry, or null if it has none: Z, its third ordinate, is
 * usually altitude, in metres. Positions without one, in a geometry that has some, don't count.
 */
export function zRange(geometry: Geometry): [number, number] | null {
  let min = Infinity;
  let max = -Infinity;
  const walk = (coords: unknown): void => {
    if (!Array.isArray(coords)) return; // Malformed: nothing to find.
    if (typeof coords[0] === "number") {
      const z = (coords as Position)[2];
      if (typeof z === "number" && Number.isFinite(z)) {
        min = Math.min(min, z);
        max = Math.max(max, z);
      }
    } else coords.forEach(walk);
  };
  if (geometry.type === "GeometryCollection")
    for (const part of geometry.geometries ?? []) {
      const range = zRange(part);
      if (range)
        [min, max] = [Math.min(min, range[0]), Math.max(max, range[1])];
    }
  else walk(geometry.coordinates);
  return min <= max ? [min, max] : null;
}

/** Center of the geometry's bounding box (matches Leaflet's LatLngBounds.getCenter semantics). */
export function geometryCenter(geometry: Geometry): [number, number] {
  if (geometry.type === "Point") {
    return geometry.coordinates as [number, number];
  }
  const [west, south, east, north] = geometryBbox(geometry);
  return [(west + east) / 2, (south + north) / 2];
}

/** Surface area of a bbox on a spherical Earth, in km². */
export function bboxAreaKm2([west, south, east, north]: Bbox): number {
  const clampLat = (lat: number) => Math.max(-90, Math.min(90, lat));
  const width = toRadians(Math.min(360, east - west));
  const height =
    Math.sin(toRadians(clampLat(north))) - Math.sin(toRadians(clampLat(south)));
  return EARTH_RADIUS_KM ** 2 * width * height;
}

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
const toDegrees = (radians: number) => (radians * 180) / Math.PI;
const roundCoordinate = (degrees: number) => Number(degrees.toFixed(6));
/** Significant digits rather than decimals, so that small shapes don't round to zero. */
const roundSize = (size: number) => Number(size.toPrecision(6));

/** Traces a path along geodesics on the WGS84 ellipsoid, returning its length and enclosed area in km and km². */
function tracePath(
  positions: Position[],
  closed: boolean,
): { lengthKm: number; areaKm2: number } {
  const path = Geodesic.WGS84.Polygon(!closed);
  for (const [lng, lat] of closed ? positions.slice(0, -1) : positions)
    path.AddPoint(lat, lng);
  const { perimeter, area } = path.Compute(false, true);
  return { lengthKm: perimeter / 1000, areaKm2: Math.abs(area ?? 0) / 1e6 };
}

export function lengthKm(line: Position[]): number {
  return tracePath(line, false).lengthKm;
}

/** Area and perimeter of a closed ring, in km² and km. */
export function ringMeasurements(ring: Position[]): {
  areaKm2: number;
  perimeterKm: number;
} {
  const { lengthKm: perimeterKm, areaKm2 } = tracePath(ring, true);
  return { areaKm2, perimeterKm };
}

function polygonsMeasurements(
  polygons: Position[][][],
  units: Units,
): Record<string, number> {
  const { label, perKm } = LENGTH_UNIT[units];
  const rings = polygons.flat();
  const area = polygons.reduce((total, [outer, ...holes]) => {
    const holesArea = holes.reduce(
      (sum, hole) => sum + tracePath(hole, true).areaKm2,
      0,
    );
    return total + tracePath(outer, true).areaKm2 - holesArea;
  }, 0);
  return {
    [`Perimeter (${label})`]: roundSize(
      rings.reduce((total, ring) => total + tracePath(ring, true).lengthKm, 0) *
        perKm,
    ),
    [`Area (${label}2)`]: roundSize(area * perKm ** 2),
  };
}

/** What every feature shows at the very least, or null for geometries with no single answer. */
export function measureGeometry(
  geometry: Geometry,
  units: Units = "metric",
): Record<string, number> | null {
  const { label, perKm } = LENGTH_UNIT[units];
  switch (geometry.type) {
    case "Point":
      return {
        Latitude: roundCoordinate(geometry.coordinates[1]),
        Longitude: roundCoordinate(geometry.coordinates[0]),
      };
    case "LineString":
      return {
        [`Length (${label})`]: roundSize(
          lengthKm(geometry.coordinates) * perKm,
        ),
      };
    case "MultiLineString":
      return {
        [`Length (${label})`]: roundSize(
          geometry.coordinates.reduce(
            (total, line) => total + lengthKm(line),
            0,
          ) * perKm,
        ),
      };
    case "Polygon":
      return polygonsMeasurements([geometry.coordinates], units);
    case "MultiPolygon":
      return polygonsMeasurements(geometry.coordinates, units);
    default:
      return null;
  }
}

/** Center of a circle as the mean of its vertices in 3D, which needs no map projection and ignores the antimeridian. */
export function circleCenter(ring: Position[]): {
  "Latitude (center)": number;
  "Longitude (center)": number;
} {
  const [x, y, z] = ring.slice(0, -1).reduce(
    ([sumX, sumY, sumZ], [lng, lat]) => {
      const cosLat = Math.cos(toRadians(lat));
      return [
        sumX + cosLat * Math.cos(toRadians(lng)),
        sumY + cosLat * Math.sin(toRadians(lng)),
        sumZ + Math.sin(toRadians(lat)),
      ];
    },
    [0, 0, 0],
  );
  return {
    "Latitude (center)": roundCoordinate(
      toDegrees(Math.atan2(z, Math.hypot(x, y))),
    ),
    "Longitude (center)": roundCoordinate(toDegrees(Math.atan2(y, x))),
  };
}

export function bboxToString(bbox: Bbox): string {
  return bbox.join(",");
}
