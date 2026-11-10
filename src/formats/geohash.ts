import type { Feature } from "geojson";
import { rectangleFeature } from "./common";

const ALPHABET = "0123456789bcdefghjkmnpqrstuvwxyz";
export const MAX_LENGTH = 12;

/** A geohash's cell as [west, south, east, north], or null if it isn't one. */
export function geohashBounds(
  geohash: string,
): [number, number, number, number] | null {
  const hash = geohash.toLowerCase();
  if (hash.length === 0 || hash.length > MAX_LENGTH) return null;
  let [west, east, south, north] = [-180, 180, -90, 90];
  // Bits alternate between longitude and latitude, longitude first, five to a character.
  let isLng = true;
  for (const char of hash) {
    const value = ALPHABET.indexOf(char);
    if (value < 0) return null;
    for (let bit = 4; bit >= 0; bit--) {
      const high = (value >> bit) & 1;
      if (isLng) {
        const mid = (west + east) / 2;
        if (high) west = mid;
        else east = mid;
      } else {
        const mid = (south + north) / 2;
        if (high) south = mid;
        else north = mid;
      }
      isLng = !isLng;
    }
  }
  return [west, south, east, north];
}

/**
 * A geohash's cell as a polygon, or null. Unprefixed, it needs two characters at least, as a lone
 * one is more likely a typo than a cell an eighth of the world wide.
 */
export function geohashFeature(text: string, forced: boolean): Feature | null {
  if (!forced && text.length < 2) return null;
  const bounds = geohashBounds(text);
  return bounds && rectangleFeature(bounds, { geohash: text.toLowerCase() });
}
