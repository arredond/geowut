import * as h3 from 'h3-js';
import { s2, geojson as s2geojson } from 's2js';
import type { Geometry } from 'geojson';
import { geometryBbox } from './geometry';
import * as h3Grid from './grids/h3';
import * as quadkey from './grids/quadkey';
import * as s2Grid from './grids/s2';
import type { Bbox } from './grids/types';

/** Coverings past this estimate take far too long to compute on the main thread (S2 eventually overflows the stack). */
const MAX_COVERAGE_CELLS = 50_000;

export class TooManyCellsError extends Error {}

function assertCoverable(estimateCells: (bbox: Bbox, resolution: number) => number, geometry: Geometry, resolution: number): void {
  // The parts of a MultiPolygon can be far apart, so the bbox around them all says nothing about their size.
  const parts: Geometry[] =
    geometry.type === 'MultiPolygon'
      ? geometry.coordinates.map((coordinates) => ({ type: 'Polygon', coordinates }))
      : [geometry];
  const estimate = parts.reduce((total, part) => total + estimateCells(geometryBbox(part), resolution), 0);
  if (estimate > MAX_COVERAGE_CELLS) throw new TooManyCellsError();
}

/** H3 cell IDs covering an arbitrary geometry at the given resolution. */
export function h3Coverage(geometry: Geometry, resolution: number): string[] {
  if (geometry.type === 'Point') {
    const [lng, lat] = geometry.coordinates;
    return [h3.latLngToCell(lat, lng, resolution)];
  }
  assertCoverable(h3Grid.estimateCells, geometry, resolution);
  if (geometry.type === 'Polygon') {
    return h3.polygonToCells(geometry.coordinates, resolution, true);
  }
  if (geometry.type === 'MultiPolygon') {
    return [...new Set(geometry.coordinates.flatMap((polygon) => h3.polygonToCells(polygon, resolution, true)))];
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
  assertCoverable(quadkey.estimateCells, geometry, zoom);
  return quadkey.coverBbox(bbox, zoom).map((f) => f.properties.id);
}

/** S2 cell tokens covering an arbitrary geometry at the given level. */
export function s2Coverage(geometry: Geometry, level: number): string[] {
  // A line's bbox says little about how many cells it touches.
  if (geometry.type !== 'LineString') assertCoverable(s2Grid.estimateCells, geometry, level);
  const coverer = new s2geojson.RegionCoverer({ minLevel: level, maxLevel: level, maxCells: 256 });
  const cellUnion = coverer.covering(geometry);
  return cellUnion.map((id) => s2.cellid.toToken(id));
}
