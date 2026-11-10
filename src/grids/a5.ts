import * as a5 from "a5-js";
import type { Polygon, Position } from "geojson";
import { bboxAreaKm2, lengthKm, ringMeasurements } from "../geometry";
import { lngSlices } from "./bbox";
import type { Bbox, CellStats, GridCellFeature } from "./types";

export const MIN_RESOLUTION = 0;
export const MAX_RESOLUTION = a5.MAX_RESOLUTION;

/**
 * A5 cells are a quarter of the area of the resolution before, like S2 cells per level,
 * but 2.5 times smaller than S2's at the same number: a resolution log4(2.5) ≈ 0.66 behind
 * S2's level per zoom keeps cells a similar ~130px across.
 */
export function resolutionForZoom(zoom: number): number {
  return Math.max(
    MIN_RESOLUTION,
    Math.min(MAX_RESOLUTION, Math.round(zoom - 0.66)),
  );
}

/** A5 brands its degrees as a type of their own; GeoJSON positions are plain numbers. */
type LonLat = Parameters<typeof a5.lonLatToCell>[0];
const asLonLat = ([lng, lat]: Position) => [lng, lat] as unknown as LonLat;

/** IDs are A5's canonical hex, eg. 51ad118000000000. */
const toBigint = (id: string) => a5.hexToU64(id);
const toId = (cell: bigint) => a5.u64ToHex(cell);

/** A5 already gives rings that don't jump at the antimeridian, and that reach the poles. */
function boundary(cell: bigint): Position[] {
  return a5.cellToBoundary(cell);
}

export function cellPolygon(id: string): Polygon {
  return { type: "Polygon", coordinates: [boundary(toBigint(id))] };
}

/** Every cell of a resolution has exactly the same area. */
export function levelStats(resolution: number): CellStats {
  return {
    areaKm2: a5.cellArea(resolution) / 1e6,
    edgeKm: a5.cellEdgeLengthAvg(resolution) / 1e3,
  };
}

/** Exact area; edges traced along the boundary, whose points follow the curved edges. */
export function cellStats(id: string): CellStats {
  const cell = toBigint(id);
  const { perimeterKm } = ringMeasurements(boundary(cell));
  return {
    areaKm2: a5.cellArea(a5.getResolution(cell)) / 1e6,
    edgeKm: perimeterKm / 5,
  };
}

export function cellLevel(id: string): number {
  return a5.getResolution(toBigint(id));
}

/** The same 64-bit ID as an unsigned integer. */
export function cellInteger(id: string): bigint {
  return toBigint(id);
}

/** The cell one resolution up containing this one, or null at resolution 0, whose only parent is the whole world. */
export function parentCell(id: string): string | null {
  const cell = toBigint(id);
  const resolution = a5.getResolution(cell);
  return resolution > MIN_RESOLUTION
    ? toId(a5.cellToParent(cell, resolution - 1))
    : null;
}

/** The cells one resolution down: 4, or 5 under a resolution 0 cell. */
export function childCells(id: string): string[] {
  const cell = toBigint(id);
  return a5.getResolution(cell) < MAX_RESOLUTION
    ? a5.cellToChildren(cell).map(toId)
    : [];
}

export function estimateCells(bbox: Bbox, resolution: number): number {
  return bboxAreaKm2(bbox) / levelStats(resolution).areaKm2;
}

export function estimateLineCells(
  line: Position[],
  resolution: number,
): number {
  return lengthKm(line) / levelStats(resolution).edgeKm + 1;
}

/** Degrees between the points added along a bbox's edges, so they follow the parallels and meridians. */
const DENSIFY_STEP = 1;

/** A bbox as a ring with points along its edges, so edges drawn as great circles still follow it. */
function bboxRing([west, south, east, north]: Bbox): Position[] {
  const steps = (from: number, to: number) => {
    const n = Math.max(1, Math.ceil(Math.abs(to - from) / DENSIFY_STEP));
    return Array.from({ length: n }, (_, i) => from + ((to - from) * i) / n);
  };
  return [
    ...steps(west, east).map((lng) => [lng, south]),
    ...steps(south, north).map((lat) => [east, lat]),
    ...steps(east, west).map((lng) => [lng, north]),
    ...steps(north, south).map((lat) => [west, lat]),
    [west, south],
  ];
}

/** Every cell the polygon touches, not only those whose center it holds, which would leave its edges bare. */
export function polygonCells(
  polygon: Position[][],
  resolution: number,
): string[] {
  const compacted = a5.polygonToCells(
    polygon.map((ring) => ring.map(asLonLat)),
    resolution,
    { containment: "overlapping" },
  );
  return [...a5.uncompact(compacted)].map(toId);
}

export function pointCell(position: Position, resolution: number): string {
  return toId(a5.lonLatToCell(asLonLat(position), resolution));
}

export function lineCells(line: Position[], resolution: number): string[] {
  return a5.lineStringToCells(line.map(asLonLat), resolution).map(toId);
}

export function coverBbox(bbox: Bbox, resolution: number): GridCellFeature[] {
  const [west, south, east, north] = bbox;
  const cells = new Set<string>();
  for (const [sliceWest, sliceEast] of lngSlices(west, east))
    for (const id of polygonCells(
      [bboxRing([sliceWest, south, sliceEast, north])],
      resolution,
    ))
      cells.add(id);
  return [...cells].map((id) => ({
    type: "Feature",
    properties: { id, label: id },
    geometry: cellPolygon(id),
  }));
}
