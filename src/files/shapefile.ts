import type { Feature } from "geojson";
import { parseDbf, parseShp } from "shpjs";
import { UnsupportedDataError } from "../errors";
import { crsTransform } from "../projection";
import { decodeText, feature } from "./common";
import type { InputFile } from "./common";

/** A Shapefile's parts: its geometries (.shp), and its attributes, projection and encoding if there. */
export interface ShapefileParts {
  name: string;
  shp: InputFile;
  dbf?: InputFile;
  prj?: InputFile;
  cpg?: InputFile;
}

/**
 * The .dbf's text encoding: as its .cpg says, else UTF-8 if it decodes as such, else
 * Windows-1252 (Latin-1 and then some), as most tools without a .cpg wrote, Esri's included.
 */
function dbfEncoding(dbf: InputFile, cpg?: InputFile): string {
  if (cpg) return decodeText(cpg.bytes).trim();
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(dbf.bytes);
    return "utf-8";
  } catch {
    return "windows-1252";
  }
}

/**
 * A Shapefile's features, with its attributes as properties, reprojected as its .prj says.
 * Without one it's taken for WGS84, as most tools do.
 */
export function readShapefile({
  name,
  shp,
  dbf,
  prj,
  cpg,
}: ShapefileParts): Feature[] {
  const transform = prj
    ? crsTransform({ wkt: decodeText(prj.bytes) }, name)
    : null;
  const geometries = parseShp(shp.bytes);
  const rows = dbf ? parseDbf(dbf.bytes, dbfEncoding(dbf, cpg)) : [];
  if (dbf && rows.length !== geometries.length)
    throw new UnsupportedDataError(
      `${name}'s .shp and .dbf don't match: ${geometries.length} shapes for ${rows.length} rows.`,
    );
  return geometries.flatMap((geometry, i) =>
    geometry ? [feature(geometry, rows[i] ?? {}, transform)] : [],
  );
}
