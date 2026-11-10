import type { Position } from "geojson";
import { validLngLat } from "./common";

type Token =
  | { kind: "number"; value: number; text: string; unit?: Unit }
  | { kind: "hemisphere"; value: Hemisphere }
  | { kind: "break" };

type Unit = "deg" | "min" | "sec";
type Hemisphere = "N" | "S" | "E" | "W";

const UNITS: [RegExp, Unit][] = [
  [/^(?:°|º|˚|deg)/i, "deg"],
  // Two single quotes, as seconds are often typed, before one, as minutes.
  [/^(?:"|″|”|“|''|′′|’’)/, "sec"],
  [/^(?:'|′|’|‘)/, "min"],
];

/** Numbers, their units, hemisphere letters, and commas or semicolons as breaks; null if anything else. */
function tokenize(text: string): Token[] | null {
  const tokens: Token[] = [];
  text = text.trim();
  let rest = text;
  while (rest) {
    let match: RegExpExecArray | null;
    if ((match = /^\s+/.exec(rest))) {
      // Spaces only split tokens.
    } else if ((match = /^[,;]/.exec(rest))) {
      tokens.push({ kind: "break" });
    } else if ((match = /^[-+−]?(?:\d+(?:\.\d*)?|\.\d+)/.exec(rest))) {
      const text = match[0].replace("−", "-");
      tokens.push({ kind: "number", value: Number(text), text });
    } else if (
      (match = /^[NSEW](?![a-z])/i.exec(rest)) &&
      // Between digits, as in 4e3, it's more likely a hex ID or an exponent.
      !(
        /\d$/.test(text.slice(0, text.length - rest.length)) &&
        /^.\d/.test(rest)
      )
    ) {
      tokens.push({
        kind: "hemisphere",
        value: match[0].toUpperCase() as Hemisphere,
      });
    } else {
      const unit = UNITS.find(([pattern]) => (match = pattern.exec(rest)));
      const last = tokens.at(-1);
      if (!unit || last?.kind !== "number" || last.unit) return null;
      last.unit = unit[1];
    }
    rest = rest.slice(match![0].length);
  }
  return tokens;
}

interface Coordinate {
  numbers: Extract<Token, { kind: "number" }>[];
  hemisphere?: Hemisphere;
}

/**
 * Splits the tokens into the two coordinates: at a comma, else after a trailing hemisphere
 * letter or before a leading one, else before the second number with degrees marked.
 */
function splitCoordinates(tokens: Token[]): Coordinate[] | null {
  const breaks = tokens.filter((t) => t.kind === "break").length;
  if (breaks > 1) return null;
  const hemispheres = tokens.filter((t) => t.kind === "hemisphere");
  const leading = tokens[0]?.kind === "hemisphere";

  const coordinates: Coordinate[] = [{ numbers: [] }];
  let current = coordinates[0];
  const next = () => {
    current = { numbers: [] };
    coordinates.push(current);
  };
  for (const [i, token] of tokens.entries()) {
    if (token.kind === "break") {
      if (current.numbers.length > 0 || current.hemisphere) next();
    } else if (token.kind === "hemisphere") {
      if (leading && current.numbers.length > 0) next();
      if (current.hemisphere) return null;
      current.hemisphere = token.value;
      const following = tokens[i + 1];
      if (!leading && following && following.kind !== "break") next();
    } else {
      const startsAnother =
        breaks === 0 &&
        hemispheres.length === 0 &&
        token.unit === "deg" &&
        current.numbers.length > 0;
      if (startsAnother) next();
      current.numbers.push(token);
    }
  }
  return coordinates.filter((c) => c.numbers.length > 0 || c.hemisphere);
}

const UNIT_ORDER: Unit[] = ["deg", "min", "sec"];

/** A coordinate's value in degrees, or null if its parts don't make one. */
function degrees({ numbers, hemisphere }: Coordinate): number | null {
  if (numbers.length === 0 || numbers.length > 3) return null;
  // Units, where given, must run in order; unmarked numbers take the next one along.
  let value = 0;
  let unitIndex = 0;
  for (const [i, { value: n, text, unit }] of numbers.entries()) {
    const index = unit ? UNIT_ORDER.indexOf(unit) : unitIndex;
    if (index < unitIndex || index > 2) return null;
    // Only the degrees carry a sign, and only the last part a fraction.
    if (i > 0 && /^[-+]/.test(text)) return null;
    if (i < numbers.length - 1 && text.includes(".")) return null;
    if (index > 0 && n >= 60) return null;
    value += Math.abs(n) / 60 ** index;
    unitIndex = index + 1;
  }
  const negative = numbers[0].text.startsWith("-");
  if (negative && hemisphere) return null;
  return negative || hemisphere === "S" || hemisphere === "W" ? -value : value;
}

/**
 * A point written in degrees, minutes and seconds, degrees and decimal minutes, or decimal degrees
 * with symbols or hemisphere letters: 40°25'0.6"N 3°42'13.7"W, 40° 25.01' N, 3° 42.23' W, or
 * N 40.4168 W 3.7038. Hemisphere letters say which is which, so they can come in either order;
 * without them, latitude comes first. Null for text that isn't one, plain numbers included, which
 * are read elsewhere.
 */
export function parseDms(text: string): Position | null {
  const tokens = tokenize(text);
  if (!tokens) return null;
  const marked = tokens.some(
    (t) => t.kind === "hemisphere" || (t.kind === "number" && t.unit),
  );
  if (!marked) return null;

  const coordinates = splitCoordinates(tokens);
  if (coordinates?.length !== 2) return null;
  const values = coordinates.map(degrees);
  if (values.some((v) => v === null)) return null;

  const [a, b] = coordinates.map((c) => c.hemisphere);
  const isLat = (h?: Hemisphere) => h === "N" || h === "S";
  const isLng = (h?: Hemisphere) => h === "E" || h === "W";
  let latFirst: boolean;
  if (isLng(a) || isLat(b)) latFirst = false;
  else latFirst = true;
  // Both on the same axis, as N and S, can't be a point.
  if ((isLat(a) && isLat(b)) || (isLng(a) && isLng(b))) return null;

  const [lat, lng] = latFirst ? values : [values[1], values[0]];
  return validLngLat(lng!, lat!) ? [lng!, lat!] : null;
}
