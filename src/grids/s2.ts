import { s1, s2, geojson as s2geojson } from 's2js';
import type { Polygon } from 'geojson';
import type { Bbox, GridCellFeature } from './types';

export const MIN_LEVEL = 1;
export const MAX_LEVEL = 24;

/** S2 cell level roughly matched to map zoom, clamped to a sane range. */
export function resolutionForZoom(zoom: number): number {
  return Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, Math.round(zoom - 1)));
}

function bboxToPolygonGeometry(bbox: Bbox): Polygon {
  const [west, south, east, north] = bbox;
  return {
    type: 'Polygon',
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

export function coverBbox(bbox: Bbox, level: number): GridCellFeature[] {
  const coverer = new s2geojson.RegionCoverer({ minLevel: level, maxLevel: level, maxCells: 4096 });
  const cellUnion = coverer.covering(bboxToPolygonGeometry(bbox));

  return cellUnion.map((cellId) => {
    const token = s2.cellid.toToken(cellId);
    return {
      type: 'Feature',
      properties: { id: token, label: token },
      geometry: { type: 'Polygon', coordinates: [cellToPolygonRing(cellId)] },
    };
  });
}
