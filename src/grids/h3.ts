import * as h3 from 'h3-js';
import { bboxAreaKm2 } from '../geometry';
import type { Bbox, GridCellFeature } from './types';

export const MIN_RESOLUTION = 0;
export const MAX_RESOLUTION = 15;

/** H3 bboxes wider than this are split up: edges are read as the shorter way round the globe. */
const MAX_POLYGON_WIDTH = 90;

/** Each resolution is ~1.4 zooms apart (cells shrink by sqrt(7)); this keeps cells ~120px across. */
export function resolutionForZoom(zoom: number): number {
  return Math.max(MIN_RESOLUTION, Math.min(MAX_RESOLUTION, Math.round(0.71 * zoom - 1.3)));
}

/** Split a lng range into narrow slices, each wrapped into -180..180. */
function lngSlices(west: number, east: number): [number, number][] {
  const slices: [number, number][] = [];
  for (let start = west; start < east; ) {
    const end = Math.min(east, (Math.floor(start / MAX_POLYGON_WIDTH) + 1) * MAX_POLYGON_WIDTH);
    const offset = 360 * Math.floor((start + 180) / 360);
    slices.push([start - offset, end - offset]);
    start = end;
  }
  return slices;
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
    const overlapping = h3.polygonToCellsExperimental(ring, resolution, h3.POLYGON_TO_CELLS_FLAGS.containmentOverlapping);
    for (const cell of overlapping) cells.add(cell);
  }

  return [...cells].map((cell) => ({
    type: 'Feature',
    properties: { id: cell, label: cell },
    geometry: {
      type: 'Polygon',
      coordinates: [unwrapRing(h3.cellToBoundary(cell, true))],
    },
  }));
}

/** Keep antimeridian-crossing cells contiguous instead of letting them smear across the whole map. */
function unwrapRing(ring: number[][]): number[][] {
  const crossesAntimeridian = ring.some(([lng]) => Math.abs(lng - ring[0][0]) > 180);
  return crossesAntimeridian ? ring.map(([lng, lat]) => [lng < 0 ? lng + 360 : lng, lat]) : ring;
}
