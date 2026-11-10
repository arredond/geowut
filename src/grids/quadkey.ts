import { bboxAreaKm2 } from "../geometry";
import type { Polygon, Position } from "geojson";
import type { Bbox, CellStats, GridCellFeature } from "./types";

export const MIN_ZOOM = 0;
export const MAX_ZOOM = 23;

/** One above the map zoom gives classic 256px tiles, as MapLibre zoom levels are based on 512px ones. */
export function resolutionForZoom(zoom: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(zoom) + 1));
}

function lngToTileX(lng: number, z: number): number {
  return Math.floor(((lng + 180) / 360) * 2 ** z);
}

function latToTileY(lat: number, z: number): number {
  const latRad = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
      2 ** z,
  );
}

function tileXToLng(x: number, z: number): number {
  return (x / 2 ** z) * 360 - 180;
}

function tileYToLat(y: number, z: number): number {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

/** Google/XYZ (x,y,z) tile -> Bing-style quadkey string. */
export function tileToQuadkey(x: number, y: number, z: number): string {
  let quadkey = "";
  for (let i = z; i > 0; i--) {
    let digit = 0;
    const mask = 1 << (i - 1);
    if ((x & mask) !== 0) digit += 1;
    if ((y & mask) !== 0) digit += 2;
    quadkey += digit;
  }
  return quadkey;
}

const EARTH_RADIUS_KM = 6371;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** Tiles shrink away from the equator, by the cosine of latitude, so the table gives the largest: those on it. */
export function levelStats(zoom: number): CellStats {
  const edgeKm = (2 * Math.PI * EARTH_RADIUS_KM) / 2 ** zoom;
  return { areaKm2: edgeKm ** 2, edgeKm };
}

/** Exact for a lat/lng box: its sides run along meridians and parallels, which aren't the geodesics between corners. */
export function boxStats([west, south, east, north]: Bbox): CellStats {
  const width = toRadians(east - west) * EARTH_RADIUS_KM;
  const height = toRadians(north - south) * EARTH_RADIUS_KM;
  const top = width * Math.cos(toRadians(north));
  const bottom = width * Math.cos(toRadians(south));
  return {
    areaKm2: bboxAreaKm2([west, south, east, north]),
    edgeKm: (top + bottom + 2 * height) / 4,
  };
}

export function cellStats(quadkey: string): CellStats {
  return boxStats(quadkeyBounds(quadkey));
}

export function cellPolygon(quadkey: string): Polygon {
  const [w, s, e, n] = quadkeyBounds(quadkey);
  return {
    type: "Polygon",
    coordinates: [
      [
        [w, s],
        [e, s],
        [e, n],
        [w, n],
        [w, s],
      ],
    ],
  };
}

/** A quadkey's zoom is its number of digits. */
export function cellLevel(quadkey: string): number {
  return quadkey.length;
}

/** The tile one zoom up containing this one: the quadkey minus its last digit. Null at zoom 1, as zoom 0's whole world has no quadkey. */
export function parentCell(quadkey: string): string | null {
  return quadkey.length > Math.max(MIN_ZOOM, 1) ? quadkey.slice(0, -1) : null;
}

/** The four tiles one zoom down, which exactly tile this one. */
export function childCells(quadkey: string): string[] {
  return quadkey.length < MAX_ZOOM
    ? ["0", "1", "2", "3"].map((digit) => quadkey + digit)
    : [];
}

export function quadkeyBounds(quadkey: string): Bbox {
  let x = 0;
  let y = 0;
  for (const digit of quadkey) {
    x = x * 2 + (Number(digit) & 1);
    y = y * 2 + (Number(digit) >> 1);
  }
  return tileBounds(x, y, quadkey.length);
}

function tileBounds(x: number, y: number, z: number): Bbox {
  return [
    tileXToLng(x, z),
    tileYToLat(y + 1, z),
    tileXToLng(x + 1, z),
    tileYToLat(y, z),
  ];
}

function tileRange(
  [west, south, east, north]: Bbox,
  zoom: number,
): [number, number, number, number] {
  const maxTileIndex = 2 ** zoom - 1;
  const xMin = Math.max(0, lngToTileX(west, zoom));
  const xMax = Math.min(maxTileIndex, lngToTileX(east, zoom));
  // Latitude decreases as tile Y increases, so north maps to the smaller Y.
  const yMin = Math.max(0, latToTileY(north, zoom));
  const yMax = Math.min(maxTileIndex, latToTileY(south, zoom));
  return [xMin, xMax, yMin, yMax];
}

export function estimateCells(bbox: Bbox, zoom: number): number {
  const [xMin, xMax, yMin, yMax] = tileRange(bbox, zoom);
  return (xMax - xMin + 1) * (yMax - yMin + 1);
}

export function coverBbox(bbox: Bbox, zoom: number): GridCellFeature[] {
  const [xMin, xMax, yMin, yMax] = tileRange(bbox, zoom);

  const features: GridCellFeature[] = [];
  for (let x = xMin; x <= xMax; x++) {
    for (let y = yMin; y <= yMax; y++) {
      const [w, s, e, n] = tileBounds(x, y, zoom);
      const quadkey = tileToQuadkey(x, y, zoom);
      // TMS counts rows up from the south, Google/XYZ down from the north.
      const yTms = 2 ** zoom - y - 1;
      features.push({
        type: "Feature",
        properties: {
          id: quadkey,
          label: quadkey,
          googleTile: `${zoom}/${x}/${y}`,
          tmsTile: `${zoom}/${x}/${yTms}`,
        },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [w, s],
              [e, s],
              [e, n],
              [w, n],
              [w, s],
            ],
          ],
        },
      });
    }
  }
  return features;
}

/** Web Mercator stops here: tiles cover no more of the poles. */
const MAX_MERCATOR_LAT = 85.0511287798066;

/** Where a position falls in the tile grid of a zoom, in fractional tiles: what's straight on the map is straight here. */
function toTileSpace([lng, lat]: Position, zoom: number): [number, number] {
  const n = 2 ** zoom;
  const latRad = toRadians(
    Math.max(-MAX_MERCATOR_LAT, Math.min(MAX_MERCATOR_LAT, lat)),
  );
  return [
    ((lng + 180) / 360) * n,
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  ];
}

/** Collects tiles, ignoring any off the edge of the world. */
class TileSet {
  private keys = new Set<string>();
  private max: number;
  private zoom: number;

  constructor(zoom: number) {
    this.zoom = zoom;
    this.max = 2 ** zoom - 1;
  }

  add(x: number, y: number): void {
    if (x >= 0 && y >= 0 && x <= this.max && y <= this.max)
      this.keys.add(tileToQuadkey(x, y, this.zoom));
  }

  list(): string[] {
    return [...this.keys];
  }
}

/** Every tile a straight segment passes through (Amanatides and Woo's grid traversal). */
function traverseSegment(
  [x0, y0]: [number, number],
  [x1, y1]: [number, number],
  tiles: TileSet,
): void {
  let x = Math.floor(x0);
  let y = Math.floor(y0);
  const steps = Math.abs(Math.floor(x1) - x) + Math.abs(Math.floor(y1) - y);
  const dx = x1 - x0;
  const dy = y1 - y0;
  const stepX = Math.sign(dx);
  const stepY = Math.sign(dy);
  // How far along the segment, from 0 to 1, the next tile boundary of each axis lies, and the distance between boundaries.
  let nextX =
    dx === 0 ? Infinity : (stepX > 0 ? x + 1 - x0 : x0 - x) / Math.abs(dx);
  let nextY =
    dy === 0 ? Infinity : (stepY > 0 ? y + 1 - y0 : y0 - y) / Math.abs(dy);
  const deltaX = dx === 0 ? Infinity : 1 / Math.abs(dx);
  const deltaY = dy === 0 ? Infinity : 1 / Math.abs(dy);

  tiles.add(x, y);
  for (let i = 0; i < steps; i++) {
    if (nextX < nextY) {
      x += stepX;
      nextX += deltaX;
    } else {
      y += stepY;
      nextY += deltaY;
    }
    tiles.add(x, y);
  }
}

function traverseLine(line: Position[], zoom: number, tiles: TileSet): void {
  const points = line.map((position) => toTileSpace(position, zoom));
  if (points.length === 1) traverseSegment(points[0], points[0], tiles);
  for (let i = 1; i < points.length; i++)
    traverseSegment(points[i - 1], points[i], tiles);
}

export function pointTile(position: Position, zoom: number): string {
  const tiles = new TileSet(zoom);
  const [x, y] = toTileSpace(position, zoom);
  tiles.add(
    Math.min(Math.floor(x), 2 ** zoom - 1),
    Math.min(Math.floor(y), 2 ** zoom - 1),
  );
  return tiles.list()[0];
}

/** The tiles a line passes through, as drawn on the map. */
export function lineTiles(line: Position[], zoom: number): string[] {
  const tiles = new TileSet(zoom);
  traverseLine(line, zoom, tiles);
  return tiles.list();
}

/** How many tiles a line passes through, without listing them. */
export function estimateLineTiles(line: Position[], zoom: number): number {
  const points = line.map((position) => toTileSpace(position, zoom));
  return points.reduce((total, [x, y], i) => {
    if (i === 0) return 1;
    const [px, py] = points[i - 1];
    return (
      total +
      Math.abs(Math.floor(x) - Math.floor(px)) +
      Math.abs(Math.floor(y) - Math.floor(py))
    );
  }, 0);
}

/**
 * The tiles a polygon touches: those its edges pass through, and those inside it, found row by row from where
 * each row's middle crosses the rings. Crossings of holes count too, so tiles wholly inside a hole are left out.
 */
export function polygonTiles(polygon: Position[][], zoom: number): string[] {
  const tiles = new TileSet(zoom);
  for (const ring of polygon) traverseLine(ring, zoom, tiles);

  const rings = polygon.map((ring) =>
    ring.map((position) => toTileSpace(position, zoom)),
  );
  const ys = rings.flat().map(([, y]) => y);
  for (
    let row = Math.floor(Math.min(...ys));
    row <= Math.floor(Math.max(...ys));
    row++
  ) {
    const middle = row + 0.5;
    const crossings: number[] = [];
    for (const ring of rings) {
      for (let i = 1; i < ring.length; i++) {
        const [ax, ay] = ring[i - 1];
        const [bx, by] = ring[i];
        if (ay <= middle !== by <= middle)
          crossings.push(ax + ((middle - ay) * (bx - ax)) / (by - ay));
      }
    }
    crossings.sort((a, b) => a - b);
    for (let i = 0; i + 1 < crossings.length; i += 2) {
      for (
        let column = Math.ceil(crossings[i] - 0.5);
        column <= Math.floor(crossings[i + 1] - 0.5);
        column++
      ) {
        tiles.add(column, row);
      }
    }
  }
  return tiles.list();
}
