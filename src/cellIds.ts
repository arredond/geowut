import * as a5 from "a5-js";
import * as h3 from "h3-js";
import { s2 } from "s2js";
import type { Feature } from "geojson";
import { cellFeature, GRID_DEFINITIONS } from "./grids";
import type { GridId } from "./grids";
import * as xyz from "./grids/xyz";
import * as s2Grid from "./grids/s2";

/** A reading of an ID as one grid's cell, by its canonical ID there. */
interface Reading {
  grid: GridId;
  id: string;
}

const PREFIXES: Record<string, GridId> = {
  h3: "h3",
  s2: "s2",
  a5: "a5",
  xyz: "xyz",
  quadkey: "xyz",
  qk: "xyz",
};

/** Real H3, S2 and A5 integer IDs are all far bigger; smaller numbers are just numbers. */
const MIN_INTEGER_ID = 2n ** 32n;

/**
 * The cells a 64-bit integer could be, most likely first. H3 indexes have a structure that's
 * hard to hit by chance, so they win; S2 and A5 accept so many values that both often do.
 */
function integerReadings(value: bigint): Reading[] {
  const readings: Reading[] = [];
  const hex = value.toString(16);
  if (hex.length === 15 && h3.isValidCell(hex))
    readings.push({ grid: "h3", id: hex });
  if (s2.cellid.valid(value) && s2.cellid.level(value) >= s2Grid.MIN_LEVEL)
    readings.push({ grid: "s2", id: s2.cellid.toToken(value) });
  if (value !== a5.WORLD_CELL && a5.isValidCell(value))
    readings.push({ grid: "a5", id: a5.u64ToHex(value) });
  return readings;
}

/**
 * The cells a hex ID could be, most likely first. H3 writes exactly 15 characters. S2 tokens
 * are the ID's leading hex digits, its trailing zeros dropped; A5 writes the whole number,
 * trailing zeros and all. So a trailing zero points to A5, and its absence to S2.
 */
function hexReadings(text: string, forced: boolean): Reading[] {
  const hex = text.toLowerCase();
  if (hex.length === 15 && h3.isValidCell(hex))
    return [{ grid: "h3", id: hex }];

  const readings: Reading[] = [];
  const s2Id = s2.cellid.fromToken(hex);
  if (s2.cellid.valid(s2Id) && s2.cellid.level(s2Id) >= s2Grid.MIN_LEVEL)
    readings.push({ grid: "s2", id: s2.cellid.toToken(s2Id) });
  // A5's validity check alone would take a stray "5" for a cell: real IDs are far bigger.
  const a5Id = BigInt(`0x${hex}`);
  if (
    (a5Id >= MIN_INTEGER_ID || forced) &&
    a5Id !== a5.WORLD_CELL &&
    a5.isValidCell(a5Id)
  )
    readings.push({ grid: "a5", id: a5.u64ToHex(a5Id) });
  return hex.endsWith("0") ? readings.reverse() : readings;
}

/** Every way to read one ID, most likely first: none if it isn't a cell ID at all. */
export function cellReadings(token: string): Reading[] {
  const prefixed = /^([a-z0-9]+):(.+)$/i.exec(token);
  const forced = prefixed && PREFIXES[prefixed[1].toLowerCase()];
  const text = forced ? prefixed[2] : token;

  const readings: Reading[] = [];
  // Z/X/Y, as map tiles are written (the XYZ scheme, y counting down from the north).
  const tile = /^(\d{1,2})\/(\d+)\/(\d+)$/.exec(text);
  if (tile) {
    const [z, x, y] = tile.slice(1).map(Number);
    if (z <= xyz.MAX_ZOOM && x < 2 ** z && y < 2 ** z)
      readings.push({ grid: "xyz", id: xyz.tileId(x, y, z) });
  }
  // A lone digit is more likely a number than a whole hemisphere's tile, unless asked for.
  const minQuadkey = forced === "xyz" ? 1 : 2;
  const quadkeyReadings: Reading[] = new RegExp(
    `^[0-3]{${minQuadkey},${xyz.MAX_ZOOM}}$`,
  ).test(text)
    ? [{ grid: "xyz", id: xyz.quadkeyToTileId(text) }]
    : [];
  // Hex IDs are at most 16 characters, and may be all digits (A5's 5180000000000000, say),
  // while decimal IDs run to 18-20 digits: short digit strings are read as hex first.
  const hex = /^(?:0x)?([0-9a-f]{1,16})$/i.exec(text);
  const hexes =
    hex && forced !== "xyz" ? hexReadings(hex[1], Boolean(forced)) : [];
  // A long quadkey ending in a run of zeros is the same corner tile over and over, which real
  // tiles rarely are, and A5's coarse IDs (15-16 digits) always are: then hex comes first.
  if (text.length >= 14 && /0{6}$/.test(text))
    readings.push(...hexes, ...quadkeyReadings);
  else readings.push(...quadkeyReadings, ...hexes);
  if (/^-?\d+$/.test(text)) {
    const value = BigInt(text);
    // Signed, as BigQuery and Java store 64-bit IDs.
    if (value >= -(2n ** 63n) && value < 2n ** 64n) {
      const unsigned = BigInt.asUintN(64, value);
      if (unsigned >= MIN_INTEGER_ID || forced)
        readings.push(...integerReadings(unsigned));
    }
  }

  const unique = readings.filter(
    (r, i) =>
      readings.findIndex((o) => o.grid === r.grid && o.id === r.id) === i,
  );
  return forced ? unique.filter(({ grid }) => grid === forced) : unique;
}

/**
 * Cell IDs, one or many (split by commas, spaces or lines, as coverings copy), as features
 * to draw: null unless every one is a cell ID. A list is read in the one grid that fits all
 * of its IDs where there is one, as IDs of a single grid tend to come together.
 */
export function parseCellIds(text: string): Feature[] | null {
  const tokens = text.split(/[\s,;]+/).filter(Boolean);
  if (tokens.length === 0) return null;
  const readings = tokens.map(cellReadings);
  if (readings.some((r) => r.length === 0)) return null;

  const shared = readings[0]
    .map(({ grid }) => grid)
    .find((grid) => readings.every((r) => r.some((o) => o.grid === grid)));
  return readings.map((options) => {
    const { grid, id } = options.find((o) => o.grid === shared) ?? options[0];
    const def = GRID_DEFINITIONS.find((d) => d.id === grid)!;
    return cellFeature(def, id, def.cellLevel(id));
  });
}
