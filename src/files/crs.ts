import type { Crs } from "../projection";

/**
 * A CRS written as a string, as GeoParquet and Parquet's geometry type may: "EPSG:25830",
 * "OGC:CRS84" (null: longitude and latitude), PROJJSON, or WKT.
 */
export function parseCrsString(text: string): Crs | null {
  const trimmed = text.trim();
  const code =
    /^(?:EPSG|epsg):(\d+)$/.exec(trimmed) ?? /^srid:(\d+)$/i.exec(trimmed);
  if (code) return { epsg: Number(code[1]) };
  if (/^OGC:CRS(84|84h)$/i.test(trimmed)) return null;
  if (trimmed.startsWith("{")) return { projjson: JSON.parse(trimmed) };
  return { wkt: trimmed };
}
