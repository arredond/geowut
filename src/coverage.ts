import * as h3 from 'h3-js';
import { s2, geojson as s2geojson } from 's2js';
import type { Geometry } from 'geojson';
import { geometryBbox } from './geometry';
import * as quadkey from './grids/quadkey';

/** H3 cell IDs covering an arbitrary geometry at the given resolution. */
export function h3Coverage(geometry: Geometry, resolution: number): string[] {
  if (geometry.type === 'Point') {
    const [lng, lat] = geometry.coordinates;
    return [h3.latLngToCell(lat, lng, resolution)];
  }
  if (geometry.type === 'Polygon') {
    return h3.polygonToCells(geometry.coordinates, resolution, true);
  }
  // Lines and other shapes: approximate coverage via their bounding box.
  const [west, south, east, north] = geometryBbox(geometry);
  const ring = [
    [west, south],
    [east, south],
    [east, north],
    [west, north],
    [west, south],
  ];
  return h3.polygonToCells([ring], resolution, true);
}

/** Quadkeys covering an arbitrary geometry's bounding box at the given zoom. */
export function quadkeyCoverage(geometry: Geometry, zoom: number): string[] {
  const bbox = geometryBbox(geometry);
  return quadkey.coverBbox(bbox, zoom).map((f) => f.properties.id);
}

/** S2 cell tokens covering an arbitrary geometry at the given level. */
export function s2Coverage(geometry: Geometry, level: number): string[] {
  const coverer = new s2geojson.RegionCoverer({ minLevel: level, maxLevel: level, maxCells: 256 });
  const cellUnion = coverer.covering(geometry);
  return cellUnion.map((id) => s2.cellid.toToken(id));
}
