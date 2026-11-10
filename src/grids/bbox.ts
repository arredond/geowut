/** Widest slice, in degrees, a bbox is cut into before filling it with cells. */
const MAX_SLICE_WIDTH = 90;

/**
 * Split a lng range into narrow slices, each wrapped into -180..180. Grid libraries read a polygon's
 * edges as the shorter way round the globe, so a wide bbox (or one past the antimeridian) would be
 * misread, or wrap onto itself.
 */
export function lngSlices(west: number, east: number): [number, number][] {
  const slices: [number, number][] = [];
  for (let start = west; start < east;) {
    const end = Math.min(
      east,
      (Math.floor(start / MAX_SLICE_WIDTH) + 1) * MAX_SLICE_WIDTH,
    );
    const offset = 360 * Math.floor((start + 180) / 360);
    slices.push([start - offset, end - offset]);
    start = end;
  }
  return slices;
}
