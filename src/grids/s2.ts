import { s1, s2, geojson as s2geojson } from "s2js";
import type { Polygon } from "geojson";
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

function cellToPolygonRing(cellId: bigint): number[][] {
  const cell = s2.Cell.fromCellID(cellId);
  const ring: number[][] = [];
  for (let k = 0; k < 4; k++) {
    const ll = s2.LatLng.fromPoint(cell.vertex(k));
    ring.push([s1.angle.degrees(ll.lng), s1.angle.degrees(ll.lat)]);
  }
  ring.push(ring[0]);
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
    cellToPolygonRing(s2.cellid.fromToken(token)),
  );
  return { areaKm2, edgeKm: perimeterKm / 4 };
}

export function cellPolygon(token: string): Polygon {
  return {
    type: "Polygon",
    coordinates: [cellToPolygonRing(s2.cellid.fromToken(token))],
  };
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
