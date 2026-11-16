import type { Feature, FeatureCollection, LineString, Position } from "geojson";

/** A cell's place along its grid's space-filling curve, and where it sits on the map. */
export interface CurveStop {
  /** Consecutive cells along the curve are exactly 1 apart. */
  index: bigint;
  center: Position;
}

/**
 * Where tile x, y sits along the Hilbert curve through the 2^z × 2^z tiles of a zoom: the order
 * PMTiles stores tiles in, from the top left corner to the top right one.
 */
export function hilbertIndex(x: number, y: number, z: number): bigint {
  const n = 2 ** z;
  let d = 0;
  for (let s = n / 2; s >= 1; s /= 2) {
    const rx = (x & s) > 0 ? 1 : 0;
    const ry = (y & s) > 0 ? 1 : 0;
    d += s * s * ((3 * rx) ^ ry);
    // Turn the quadrant so the curve's next level runs on from this one.
    if (ry === 0) {
      if (rx === 1) [x, y] = [n - 1 - x, n - 1 - y];
      [x, y] = [y, x];
    }
  }
  // Up to 4^23 at zoom 23: past 32 bits, but well within a double's exact integers.
  return BigInt(d);
}

/**
 * The curve through some cells of a grid, in order, as lines through their centers. Where cells
 * in between aren't among them (off screen), the line breaks rather than cut across.
 */
export function curveLines(stops: CurveStop[]): FeatureCollection<LineString> {
  const sorted = [...stops].sort((a, b) =>
    a.index < b.index ? -1 : a.index > b.index ? 1 : 0,
  );
  const lines: Position[][] = [];
  let line: Position[] = [];
  let previous: CurveStop | undefined;
  for (const stop of sorted) {
    if (previous && stop.index === previous.index) continue;
    if (!previous || stop.index !== previous.index + 1n) {
      if (line.length > 1) lines.push(line);
      line = [];
    }
    const [lng, lat] = stop.center;
    // Across the antimeridian, the longitude nearest the last one, so the line steps over it.
    const last = line.at(-1);
    const shift = last ? Math.round((last[0] - lng) / 360) * 360 : 0;
    line.push([lng + shift, lat]);
    previous = stop;
  }
  if (line.length > 1) lines.push(line);
  return {
    type: "FeatureCollection",
    features: lines.map((coordinates): Feature<LineString> => ({
      type: "Feature",
      geometry: { type: "LineString", coordinates },
      properties: {},
    })),
  };
}

/** An order-2 Hilbert curve, for the button that shows a grid's curve. */
export const CURVE_SHAPE =
  '<path d="M2.5 13.5H6.2V9.8H2.5V2.5H6.2V6.2H9.8V2.5H13.5V9.8H9.8V13.5H13.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>';
