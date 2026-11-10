import type { Feature, Geometry } from "geojson";
import Papa from "papaparse";
import { UnsupportedDataError } from "../errors";
import { validLngLat } from "../formats/common";
import { jsonToFeatures } from "../formats/text";
import { wkbFeature } from "../formats/wkb";
import { parseWkt } from "../formats/wkt";
import { decodeText, feature } from "./common";
import type { InputFile } from "./common";
import { CSV_COLUMNS } from "./csvColumns";

export interface CsvResult {
  features: Feature[];
  /** Rows with no geometry that could be read: empty, or in no format above. */
  skipped: number;
}

/** A geometry column's cell as a geometry: null if empty, or not one it can read. */
function cellGeometry(value: string): Geometry | null {
  const text = value.trim();
  if (!text) return null;
  if (text.startsWith("{")) {
    try {
      return jsonToFeatures(JSON.parse(text))[0]?.geometry ?? null;
    } catch {
      return null;
    }
  }
  return wkbFeature(text)?.geometry ?? parseWkt(text);
}

function findColumn(fields: string[], names: string[]): string | undefined {
  for (const name of names) {
    const field = fields.find((f) => f.trim().toLowerCase() === name);
    if (field !== undefined) return field;
  }
}

/**
 * A CSV (or TSV, or semicolon-separated, as European spreadsheets write them) with a header row,
 * as features: from its geometry column if it has one, else from its latitude and longitude ones.
 * The other columns become properties. Coordinates are taken for WGS84, as CSV says nothing of it.
 */
export function readCsv(file: InputFile): CsvResult {
  const { data, meta } = Papa.parse<Record<string, string>>(
    decodeText(file.bytes),
    { header: true, skipEmptyLines: "greedy" },
  );
  const fields = meta.fields ?? [];
  const geometryColumn = findColumn(fields, CSV_COLUMNS.geometry);
  const latColumn = findColumn(fields, CSV_COLUMNS.latitude);
  const lngColumn = findColumn(fields, CSV_COLUMNS.longitude);
  if (!geometryColumn && !(latColumn && lngColumn))
    throw new UnsupportedDataError(
      `${file.name} has no column GeoWut reads as a location. Name one ${CSV_COLUMNS.geometry.join(", ")} (for WKT, WKB or GeoJSON), or two latitude and longitude (as lat and lon).`,
    );
  const used = geometryColumn ? [geometryColumn] : [latColumn!, lngColumn!];

  const features: Feature[] = [];
  let skipped = 0;
  for (const row of data) {
    let geometry: Geometry | null;
    if (geometryColumn) {
      geometry = cellGeometry(row[geometryColumn] ?? "");
    } else {
      const lat = parseCoordinate(row[latColumn!]);
      const lng = parseCoordinate(row[lngColumn!]);
      geometry = validLngLat(lng, lat)
        ? { type: "Point", coordinates: [lng, lat] }
        : null;
    }
    if (!geometry) {
      skipped++;
      continue;
    }
    const properties = Object.fromEntries(
      Object.entries(row).filter(([key]) => !used.includes(key)),
    );
    features.push(feature(geometry, properties));
  }
  return { features, skipped };
}

/** A number, with a decimal comma too ("40,4168"), as some locales write them: NaN if none. */
function parseCoordinate(value: string | undefined): number {
  const text = value?.trim().replace(/^([-+]?\d+),(\d+)$/, "$1.$2");
  return text ? Number(text) : NaN;
}
