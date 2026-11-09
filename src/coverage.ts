import * as h3 from 'h3-js';
import { s2, geojson as s2geojson } from 's2js';
import type { Geometry, Position } from 'geojson';
import { geometryBbox, lengthKm } from './geometry';
import * as h3Grid from './grids/h3';
import * as quadkey from './grids/quadkey';
import * as s2Grid from './grids/s2';
import type { Bbox } from './grids/types';

/** Coverings past this estimate take far too long to compute on the main thread (S2 eventually overflows the stack). */
const MAX_COVERAGE_CELLS = 50_000;

export class TooManyCellsError extends Error {}

/** Any geometry, as the points, lines and polygons it's made of. */
interface Parts {
  points: Position[];
  lines: Position[][];
  polygons: Position[][][];
}

function parts(geometry: Geometry, into: Parts = { points: [], lines: [], polygons: [] }): Parts {
  switch (geometry.type) {
    case 'Point':
      into.points.push(geometry.coordinates);
      break;
    case 'MultiPoint':
      into.points.push(...geometry.coordinates);
      break;
    case 'LineString':
      into.lines.push(geometry.coordinates);
      break;
    case 'MultiLineString':
      into.lines.push(...geometry.coordinates);
      break;
    case 'Polygon':
      into.polygons.push(geometry.coordinates);
      break;
    case 'MultiPolygon':
      into.polygons.push(...geometry.coordinates);
      break;
    case 'GeometryCollection':
      geometry.geometries.forEach((part) => parts(part, into));
      break;
  }
  return into;
}

interface Estimators {
  /** For polygons: the cells in their bbox, which can only overcount. */
  bbox: (bbox: Bbox, resolution: number) => number;
  /** For lines: their bbox says little, as a long diagonal line only crosses a thin strip of it. */
  line: (line: Position[], resolution: number) => number;
}

/** Every part counts on its own, as the parts of a multi-geometry can be far apart. */
function assertCoverable({ points, lines, polygons }: Parts, estimate: Estimators, resolution: number): void {
  const polygonCells = polygons.reduce(
    (total, [outer]) => total + estimate.bbox(geometryBbox({ type: 'LineString', coordinates: outer }), resolution),
    0,
  );
  const lineCells = lines.reduce((total, line) => total + estimate.line(line, resolution), 0);
  if (points.length + lineCells + polygonCells > MAX_COVERAGE_CELLS) throw new TooManyCellsError();
}

const union = (...lists: string[][]) => [...new Set(lists.flat())];

/**
 * Every cell that touches the polygon. H3's default polyfill only keeps cells whose center falls inside,
 * which leaves edges uncovered, and a polygon smaller than a cell with no cells at all.
 */
function h3Polyfill(polygon: Position[][], resolution: number): string[] {
  return h3.polygonToCellsExperimental(polygon, resolution, h3.POLYGON_TO_CELLS_FLAGS.containmentOverlapping, true);
}

/** H3 cell IDs of every cell the geometry touches, at the given resolution. */
export function h3Coverage(geometry: Geometry, resolution: number): string[] {
  const { points, lines, polygons } = parts(geometry);
  assertCoverable({ points, lines, polygons }, { bbox: h3Grid.estimateCells, line: h3Grid.estimateLineCells }, resolution);
  return union(
    points.map(([lng, lat]) => h3.latLngToCell(lat, lng, resolution)),
    ...lines.map((line) => h3Grid.lineCells(line, resolution)),
    ...polygons.map((polygon) => h3Polyfill(polygon, resolution)),
  );
}

/** Quadkeys of every tile the geometry touches, at the given zoom. */
export function quadkeyCoverage(geometry: Geometry, zoom: number): string[] {
  const { points, lines, polygons } = parts(geometry);
  assertCoverable({ points, lines, polygons }, { bbox: quadkey.estimateCells, line: quadkey.estimateLineTiles }, zoom);
  return union(
    points.map((point) => quadkey.pointTile(point, zoom)),
    ...lines.map((line) => quadkey.lineTiles(line, zoom)),
    ...polygons.map((polygon) => quadkey.polygonTiles(polygon, zoom)),
  );
}

/** Drop each vertex that repeats the one before, as freehand drawing leaves at its start. */
function withoutRepeats(ring: Position[]): Position[] {
  return ring.filter((position, i) => i === 0 || position[0] !== ring[i - 1][0] || position[1] !== ring[i - 1][1]);
}

/** S2 reads a ring with a repeated vertex as an invalid loop, and covers it with nothing at all. */
function s2Ready(geometry: Geometry): Geometry {
  if (geometry.type === 'Polygon') return { ...geometry, coordinates: geometry.coordinates.map(withoutRepeats) };
  if (geometry.type === 'MultiPolygon') return { ...geometry, coordinates: geometry.coordinates.map((polygon) => polygon.map(withoutRepeats)) };
  return geometry;
}

const s2LineEstimate = (line: Position[], level: number) => lengthKm(line) / s2Grid.levelStats(level).edgeKm + 1;

/** S2 cell tokens covering an arbitrary geometry at the given level. */
export function s2Coverage(geometry: Geometry, level: number): string[] {
  assertCoverable(parts(geometry), { bbox: s2Grid.estimateCells, line: s2LineEstimate }, level);
  const coverer = new s2geojson.RegionCoverer({ minLevel: level, maxLevel: level, maxCells: 256 });
  const cellUnion = coverer.covering(s2Ready(geometry));
  return cellUnion.map((id) => s2.cellid.toToken(id));
}
