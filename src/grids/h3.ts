import * as h3 from 'h3-js';
import type { Bbox, GridCellFeature } from './types';

export const MIN_RESOLUTION = 2;
export const MAX_RESOLUTION = 15;

/** H3 resolution roughly matched to map zoom, clamped to a sane minimum. */
export function resolutionForZoom(zoom: number): number {
  return Math.max(MIN_RESOLUTION, Math.min(MAX_RESOLUTION, Math.round(zoom - 8)));
}

export function coverBbox(bbox: Bbox, resolution: number): GridCellFeature[] {
  const [west, south, east, north] = bbox;
  const ring = [
    [south, west],
    [north, west],
    [north, east],
    [south, east],
  ];
  const cells = h3.polygonToCells(ring, resolution);

  return cells.map((cell) => ({
    type: 'Feature',
    properties: { id: cell, label: cell },
    geometry: {
      type: 'Polygon',
      coordinates: [h3.cellToBoundary(cell, true)],
    },
  }));
}
