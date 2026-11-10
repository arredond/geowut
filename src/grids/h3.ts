import * as h3 from "h3-js";
import { bboxAreaKm2 } from "../geometry";
import type { Polygon, Position } from "geojson";
import type { Bbox, CellStats, GridCellFeature } from "./types";

export const MIN_RESOLUTION = 0;
export const MAX_RESOLUTION = 15;

/** H3 bboxes wider than this are split up: edges are read as the shorter way round the globe. */
const MAX_POLYGON_WIDTH = 90;

/** Each resolution is ~1.4 zooms apart (cells shrink by sqrt(7)); this keeps cells ~120px across. */
export function resolutionForZoom(zoom: number): number {
  return Math.max(
    MIN_RESOLUTION,
    Math.min(MAX_RESOLUTION, Math.round(0.71 * zoom - 1.3)),
  );
}

/** Split a lng range into narrow slices, each wrapped into -180..180. */
function lngSlices(west: number, east: number): [number, number][] {
  const slices: [number, number][] = [];
  for (let start = west; start < east;) {
    const end = Math.min(
      east,
      (Math.floor(start / MAX_POLYGON_WIDTH) + 1) * MAX_POLYGON_WIDTH,
    );
    const offset = 360 * Math.floor((start + 180) / 360);
    slices.push([start - offset, end - offset]);
    start = end;
  }
  return slices;
}

/** H3's published average for the resolution, over all its cells. */
export function levelStats(resolution: number): CellStats {
  return {
    areaKm2: h3.getHexagonAreaAvg(resolution, h3.UNITS.km2),
    edgeKm: h3.getHexagonEdgeLengthAvg(resolution, h3.UNITS.km),
  };
}

/** From H3's own edges rather than the boundary, which gains extra vertices where cells cross icosahedron faces. */
export function cellStats(cell: string): CellStats {
  const edges = h3
    .originToDirectedEdges(cell)
    .map((edge) => h3.edgeLength(edge, h3.UNITS.km));
  return {
    areaKm2: h3.cellArea(cell, h3.UNITS.km2),
    edgeKm: edges.reduce((sum, length) => sum + length, 0) / edges.length,
  };
}

export function cellPolygon(cell: string): Polygon {
  return {
    type: "Polygon",
    coordinates: [unwrapRing(h3.cellToBoundary(cell, true))],
  };
}

/** The same 64-bit index as a decimal integer, as databases often store it. */
export function cellInteger(cell: string): bigint {
  return BigInt(`0x${cell}`);
}

/** The cell one resolution up containing this one, or null at the coarsest. */
export function parentCell(cell: string): string | null {
  const resolution = h3.getResolution(cell);
  return resolution > MIN_RESOLUTION
    ? h3.cellToParent(cell, resolution - 1)
    : null;
}

/** The cells one resolution down: 7, or 6 under a pentagon. Their union only approximates this cell. */
export function childCells(cell: string): string[] {
  const resolution = h3.getResolution(cell);
  return resolution < MAX_RESOLUTION
    ? h3.cellToChildren(cell, resolution + 1)
    : [];
}

export function estimateCells(bbox: Bbox, resolution: number): number {
  return bboxAreaKm2(bbox) / h3.getHexagonAreaAvg(resolution, h3.UNITS.km2);
}

export function coverBbox(bbox: Bbox, resolution: number): GridCellFeature[] {
  const [west, south, east, north] = bbox;
  const cells = new Set<string>();

  for (const [sliceWest, sliceEast] of lngSlices(west, east)) {
    const ring = [
      [south, sliceWest],
      [north, sliceWest],
      [north, sliceEast],
      [south, sliceEast],
    ];
    // Overlapping, not the default centroid test: a cell can fill the viewport with its center outside it.
    const overlapping = h3.polygonToCellsExperimental(
      ring,
      resolution,
      h3.POLYGON_TO_CELLS_FLAGS.containmentOverlapping,
    );
    for (const cell of overlapping) cells.add(cell);
  }

  return [...cells].map((cell) => ({
    type: "Feature",
    properties: { id: cell, label: cell },
    geometry: {
      type: "Polygon",
      coordinates: [unwrapRing(h3.cellToBoundary(cell, true))],
    },
  }));
}

/** Keep antimeridian-crossing cells contiguous instead of letting them smear across the whole map. */
function unwrapRing(ring: number[][]): number[][] {
  const crossesAntimeridian = ring.some(
    ([lng]) => Math.abs(lng - ring[0][0]) > 180,
  );
  return crossesAntimeridian
    ? ring.map(([lng, lat]) => [lng < 0 ? lng + 360 : lng, lat])
    : ring;
}

/** Steps along a line this many to a cell edge: short enough not to skip a cell the line only clips. */
const LINE_STEPS_PER_EDGE = 10;

const mercatorY = (lat: number) =>
  Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
const mercatorLat = (y: number) =>
  (360 / Math.PI) * Math.atan(Math.exp(y)) - 90;

/** The cells a line passes through, found by stepping along it as it's drawn on the map: straight in Web Mercator. */
export function lineCells(line: Position[], resolution: number): string[] {
  const step =
    h3.getHexagonEdgeLengthAvg(resolution, h3.UNITS.km) / LINE_STEPS_PER_EDGE;
  const cells = new Set<string>();
  line.forEach(([lng, lat], i) => {
    cells.add(h3.latLngToCell(lat, lng, resolution));
    if (i === 0) return;
    const [prevLng, prevLat] = line[i - 1];
    const steps = Math.ceil(
      h3.greatCircleDistance([prevLat, prevLng], [lat, lng], h3.UNITS.km) /
        step,
    );
    const [y0, y1] = [mercatorY(prevLat), mercatorY(lat)];
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      cells.add(
        h3.latLngToCell(
          mercatorLat(y0 + (y1 - y0) * t),
          prevLng + (lng - prevLng) * t,
          resolution,
        ),
      );
    }
  });
  return [...cells];
}

/** Roughly how many cells a line passes through, without stepping along it. */
export function estimateLineCells(
  line: Position[],
  resolution: number,
): number {
  const edge = h3.getHexagonEdgeLengthAvg(resolution, h3.UNITS.km);
  return line.reduce((total, [lng, lat], i) => {
    if (i === 0) return 1;
    const [prevLng, prevLat] = line[i - 1];
    return (
      total +
      h3.greatCircleDistance([prevLat, prevLng], [lat, lng], h3.UNITS.km) / edge
    );
  }, 0);
}
