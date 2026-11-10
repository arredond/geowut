import type { Feature, Position } from "geojson";
import { toFeature, validLngLat } from "./common";

/**
 * The numbers an encoded polyline holds, or null unless it's made of whole ones. Each is split
 * into 5-bit chunks, lowest first, every chunk but the last flagged with 0x20, plus 63.
 */
function decodeValues(text: string): number[] | null {
  const values: number[] = [];
  let result = 0;
  let shift = 0;
  for (let i = 0; i < text.length; i++) {
    const chunk = text.charCodeAt(i) - 63;
    if (chunk < 0 || chunk > 63) return null;
    // Past 32 bits it can't be a coordinate, and JavaScript's bitwise operators would overflow.
    if (shift > 30) return null;
    result |= (chunk & 0x1f) << shift;
    shift += 5;
    if (chunk < 0x20) {
      values.push(result & 1 ? ~(result >> 1) : result >> 1);
      result = 0;
      shift = 0;
    }
  }
  return shift === 0 ? values : null;
}

/** The positions of an encoded polyline at a precision, or null if they aren't on the globe. */
export function decodePolyline(
  text: string,
  precision: number,
): Position[] | null {
  const values = decodeValues(text);
  if (!values || values.length === 0 || values.length % 2) return null;
  const factor = 10 ** precision;
  const positions: Position[] = [];
  let lat = 0;
  let lng = 0;
  // Latitude first, each pair a change from the last.
  for (let i = 0; i < values.length; i += 2) {
    lat += values[i];
    lng += values[i + 1];
    const position = [lng / factor, lat / factor];
    if (!validLngLat(position[0], position[1])) return null;
    positions.push(position);
  }
  return positions;
}

/**
 * An encoded polyline, as Google's, OSRM's and Valhalla's APIs return routes, as a line: null
 * if it isn't one. Precision 5 (Google, OSRM) is tried before 6 (Valhalla), as precision 6 read
 * as 5 lands ten times too far out and off the globe, but not the other way around: so near the
 * equator a precision 6 line needs the prefix to say so. Unprefixed, it takes two points at least,
 * not starting at 0, 0, as letters can spell a short polyline by chance.
 */
export function polylineFeature(
  text: string,
  precision?: 5 | 6,
): Feature | null {
  // Copied out of JSON, backslashes come doubled and the whole quoted.
  const quoted = /^"(.*)"$/.exec(text);
  const encoded = quoted ? quoted[1].replace(/\\\\/g, "\\") : text;
  for (const p of precision ? [precision] : ([5, 6] as const)) {
    const positions = decodePolyline(encoded, p);
    if (!positions) continue;
    if (!precision) {
      const [lng, lat] = positions[0];
      if (
        positions.length < 2 ||
        (Math.abs(lng) < 0.01 && Math.abs(lat) < 0.01)
      )
        return null;
    }
    return toFeature(
      positions.length === 1
        ? { type: "Point", coordinates: positions[0] }
        : { type: "LineString", coordinates: positions },
    );
  }
  return null;
}
