import { s1, s2, geojson as s2geojson } from "s2js";
import type { Polygon, Position } from "geojson";
import { bboxAreaKm2, ringMeasurements } from "../geometry";
import type { Bbox, CellStats, GridCellFeature } from "./types";

export const MIN_LEVEL = 1;
export const MAX_LEVEL = 24;

const EARTH_SURFACE_KM2 = 510_000_000;
const EARTH_RADIUS_KM = 6371.01;
/** S2's average edge metric, in radians at level 0 (s2metrics.cc, quadratic projection). */
const AVG_EDGE_LEVEL_0 = 1.459213746386106;

/** Cell sides halve with each level, like tiles with each zoom; this keeps cells ~130px across. */
export function resolutionForZoom(zoom: number): number {
  return Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, Math.round(zoom)));
}

function bboxToPolygonGeometry(bbox: Bbox): Polygon {
  const [west, south, east, north] = bbox;
  return {
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
  };
}

/** The cell's four corners as a closed ring, for measuring: S2 edges are geodesics between them. */
function cornerRing(cellId: bigint): number[][] {
  const cell = s2.Cell.fromCellID(cellId);
  const ring: number[][] = [];
  for (let k = 0; k < 4; k++) {
    const ll = s2.LatLng.fromPoint(cell.vertex(k));
    ring.push([s1.angle.degrees(ll.lng), s1.angle.degrees(ll.lat)]);
  }
  ring.push(ring[0]);
  return ring;
}

/** Longest stretch of a drawn edge between points, in degrees of arc. */
const MAX_EDGE_STEP_DEG = 1;

type Vector = { x: number; y: number; z: number };

const toLngLat = ({ x, y, z }: Vector): number[] => [
  (Math.atan2(y, x) * 180) / Math.PI,
  (Math.atan2(z, Math.hypot(x, y)) * 180) / Math.PI,
];

/** Points along the great circle from a to b, a included and b left for the next edge. */
function greatCircle(a: Vector, b: Vector): Vector[] {
  const dot = a.x * b.x + a.y * b.y + a.z * b.z;
  const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
  const steps = Math.max(
    1,
    Math.ceil((angle * 180) / Math.PI / MAX_EDGE_STEP_DEG),
  );
  const points: Vector[] = [];
  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    // Spherical interpolation; corners are never antipodal, so sin(angle) is never 0 past t=0.
    const [wa, wb] =
      i === 0
        ? [1, 0]
        : [Math.sin((1 - t) * angle), Math.sin(t * angle)].map(
            (w) => w / Math.sin(angle),
          );
    points.push({
      x: wa * a.x + wb * b.x,
      y: wa * a.y + wb * b.y,
      z: wa * a.z + wb * b.z,
    });
  }
  return points;
}

const POLE_LAT = 89.999999;

/**
 * The cell as the map should draw it. MapLibre joins points straight in Web Mercator, so S2's
 * great-circle edges are traced with points along them, which large cells need to look right,
 * on the globe above all. Longitudes run on past ±180° rather than jump, so a cell across the
 * antimeridian isn't drawn the long way round, and one around a pole closes over it.
 */
function cellToPolygonRing(cellId: bigint): number[][] {
  const cell = s2.Cell.fromCellID(cellId);
  const corners = [0, 1, 2, 3].map((k) => cell.vertex(k).vector as Vector);
  const points = corners
    .flatMap((corner, k) => greatCircle(corner, corners[(k + 1) % 4]))
    .map(toLngLat);

  // A corner on a pole has no longitude of its own: it's met along the meridians either side.
  const ring = points.flatMap(([lng, lat], i) =>
    Math.abs(lat) < POLE_LAT
      ? [[lng, lat]]
      : [
          [points.at(i - 1)![0], lat],
          [points[(i + 1) % points.length][0], lat],
        ],
  );

  for (let i = 1; i < ring.length; i++) {
    const previous = ring[i - 1][0];
    ring[i][0] += 360 * Math.round((previous - ring[i][0]) / 360);
  }
  const [first, last] = [ring[0], ring.at(-1)!];
  const closing = first[0] + 360 * Math.round((last[0] - first[0]) / 360);
  if (closing !== first[0]) {
    // Gone once round in longitude: the cell holds a pole, so close it along that pole.
    const poleLat = cell.center().vector.z > 0 ? 90 : -90;
    ring.push([last[0], poleLat], [first[0], poleLat]);
  }
  ring.push([...first]);
  return ring;
}

/** S2's averages over all the cells of a level. */
export function levelStats(level: number): CellStats {
  return {
    areaKm2: EARTH_SURFACE_KM2 / (6 * 4 ** level),
    edgeKm: (AVG_EDGE_LEVEL_0 * EARTH_RADIUS_KM) / 2 ** level,
  };
}

/** S2 edges are geodesics, so tracing the corners is exact. */
export function cellStats(token: string): CellStats {
  const { areaKm2, perimeterKm } = ringMeasurements(
    cornerRing(s2.cellid.fromToken(token)),
  );
  return { areaKm2, edgeKm: perimeterKm / 4 };
}

export function cellPolygon(token: string): Polygon {
  return {
    type: "Polygon",
    coordinates: [cellToPolygonRing(s2.cellid.fromToken(token))],
  };
}

export function cellLevel(token: string): number {
  return s2.cellid.level(s2.cellid.fromToken(token));
}

/** The 64-bit cell ID the token abbreviates, as an unsigned integer. */
export function cellInteger(token: string): bigint {
  return s2.cellid.fromToken(token);
}

/** The cell one level up containing this one, or null at the coarsest level shown. */
export function parentCell(token: string): string | null {
  const id = s2.cellid.fromToken(token);
  return s2.cellid.level(id) > MIN_LEVEL
    ? s2.cellid.toToken(s2.cellid.immediateParent(id))
    : null;
}

/** The four cells one level down, which exactly tile this one. */
export function childCells(token: string): string[] {
  const id = s2.cellid.fromToken(token);
  return s2.cellid.level(id) < MAX_LEVEL
    ? s2.cellid.children(id).map((child) => s2.cellid.toToken(child))
    : [];
}

/** The cell's middle: its center on the sphere. */
export function cellCenter(token: string): Position {
  const center = s2.LatLng.fromPoint(
    s2.Cell.fromCellID(s2.cellid.fromToken(token)).center(),
  );
  return [s1.angle.degrees(center.lng), s1.angle.degrees(center.lat)];
}

/**
 * The cell's place along S2's Hilbert curve. IDs are the curve's position with a trailing 1 bit
 * marking the level, so cells of a level are one curve step apart past that bit.
 */
export function cellCurveIndex(token: string): bigint {
  const id = s2.cellid.fromToken(token);
  return id >> BigInt(2 * (30 - s2.cellid.level(id)) + 1);
}

export function estimateCells(bbox: Bbox, level: number): number {
  const cellAreaKm2 = EARTH_SURFACE_KM2 / (6 * 4 ** level);
  return bboxAreaKm2(bbox) / cellAreaKm2;
}

export function coverBbox(bbox: Bbox, level: number): GridCellFeature[] {
  const coverer = new s2geojson.RegionCoverer({
    minLevel: level,
    maxLevel: level,
    maxCells: 4096,
  });
  const cellUnion = coverer.covering(bboxToPolygonGeometry(bbox));

  return cellUnion.map((cellId) => {
    const token = s2.cellid.toToken(cellId);
    return {
      type: "Feature",
      properties: { id: token, label: token },
      geometry: { type: "Polygon", coordinates: [cellToPolygonRing(cellId)] },
    };
  });
}
