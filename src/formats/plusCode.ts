import type { Feature } from "geojson";
import { UnsupportedDataError } from "../errors";
import { rectangleFeature } from "./common";

const ALPHABET = "23456789CFGHJMPQRVWX";
const SEPARATOR_POSITION = 8;
const PAIR_RESOLUTIONS = [20, 1, 0.05, 0.0025, 0.000125];
const GRID_ROWS = 5;
const GRID_COLUMNS = 4;

/** Looks like a plus code, full or short: a "+" after two to eight of its characters. */
const PLUS_CODE = new RegExp(`^([${ALPHABET}0]{2,8})\\+([${ALPHABET}]*)$`, "i");

/** A full plus code's area as [west, south, east, north], or null if it isn't one. */
export function plusCodeBounds(
  code: string,
): [number, number, number, number] | null {
  const match = PLUS_CODE.exec(code);
  if (!match) return null;
  const head = match[1].toUpperCase();
  const tail = match[2].toUpperCase();
  if (head.length !== SEPARATOR_POSITION || tail.length === 1) return null;

  // Padding zeros come in pairs at the end, and nothing may follow the "+" then.
  const padding = /0+$/.exec(head)?.[0].length ?? 0;
  const digits = head.slice(0, SEPARATOR_POSITION - padding);
  if (padding % 2 || digits.includes("0") || (padding && tail)) return null;
  // The first pair can't go past the poles or the antimeridian.
  if (
    ALPHABET.indexOf(digits[0]) * 20 >= 180 ||
    ALPHABET.indexOf(digits[1]) * 20 >= 360
  )
    return null;

  let south = -90;
  let west = -180;
  let latSize = 0;
  let lngSize = 0;
  const pairs = digits + tail.slice(0, 2);
  for (let i = 0; i < pairs.length; i += 2) {
    latSize = lngSize = PAIR_RESOLUTIONS[i / 2];
    south += ALPHABET.indexOf(pairs[i]) * latSize;
    west += ALPHABET.indexOf(pairs[i + 1]) * lngSize;
  }
  // Past the tenth digit, each one picks a cell of a 4 by 5 grid, down to the fifteenth.
  for (const char of tail.slice(2, 7)) {
    const value = ALPHABET.indexOf(char);
    latSize /= GRID_ROWS;
    lngSize /= GRID_COLUMNS;
    south += Math.floor(value / GRID_COLUMNS) * latSize;
    west += (value % GRID_COLUMNS) * lngSize;
  }
  return [west, south, west + lngSize, Math.min(90, south + latSize)];
}

/**
 * A full plus code's area as a polygon, or null if the text isn't a plus code. Short codes, which
 * Google Maps shows before a place name, can't be placed without that place: they're refused,
 * saying so.
 */
export function plusCodeFeature(text: string): Feature | null {
  const bounds = plusCodeBounds(text);
  if (bounds) return rectangleFeature(bounds, { plusCode: text.toUpperCase() });
  const match = PLUS_CODE.exec(text);
  if (match && match[1].length < SEPARATOR_POSITION && !match[1].includes("0"))
    throw new UnsupportedDataError(
      `${text.toUpperCase()} is a short plus code, which only makes sense next to a place. Paste the full code instead, with 8 characters before the "+".`,
    );
  return null;
}
