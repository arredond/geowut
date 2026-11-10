import type { Feature, Geometry } from "geojson";
import type { Database, SqlValue } from "sql.js";
import { UnsupportedDataError } from "../errors";
import { readWkb } from "../formats/wkb";
import { crsTransform } from "../projection";
import type { Crs } from "../projection";
import { feature } from "./common";
import type { InputFile } from "./common";

/** SQLite compiled to WebAssembly (~340 kB gzipped), loaded the first time a GeoPackage is read. */
async function openDatabase(bytes: Uint8Array): Promise<Database> {
  const [{ default: initSqlJs }, { default: wasmUrl }] = await Promise.all([
    import("sql.js"),
    import("sql.js/dist/sql-wasm-browser.wasm?url"),
  ]);
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  return new SQL.Database(bytes);
}

/** Envelope sizes in bytes, by the flags' envelope indicator: none, XY, XYZ, XYM, XYZM. */
const ENVELOPE_BYTES = [0, 32, 48, 48, 64];

/**
 * A GeoPackage geometry blob: "GP", a version, flags, the SRS ID and an optional envelope, then
 * standard WKB. Null if it's empty or not a GeoPackage blob.
 */
export function readGeoPackageGeometry(blob: Uint8Array): Geometry | null {
  if (blob.length < 8 || blob[0] !== 0x47 || blob[1] !== 0x50) return null;
  const flags = blob[3];
  const empty = (flags >> 4) & 1;
  const envelope = ENVELOPE_BYTES[(flags >> 1) & 0b111];
  if (empty || envelope === undefined) return null;
  return readWkb(blob.subarray(8 + envelope))?.geometry ?? null;
}

const rows = (db: Database, sql: string, params: SqlValue[] = []) => {
  const [result] = db.exec(sql, params);
  return (result?.values ?? []).map((values) =>
    Object.fromEntries(result.columns.map((c, i) => [c, values[i]])),
  );
};

/** The CRS of an SRS ID: GeoPackage's table holds each one's WKT, and the organisation's code. */
function srsCrs(db: Database, srsId: number): Crs | null {
  // -1 and 0 are GeoPackage's undefined Cartesian and geographic systems: nothing to reproject.
  if (srsId <= 0) return null;
  const [srs] = rows(
    db,
    "SELECT definition, organization, organization_coordsys_id FROM gpkg_spatial_ref_sys WHERE srs_id = ?",
    [srsId],
  );
  if (!srs) return { epsg: srsId };
  const epsg =
    String(srs.organization).toUpperCase() === "EPSG"
      ? Number(srs.organization_coordsys_id)
      : undefined;
  const definition = String(srs.definition ?? "");
  const wkt = definition && definition !== "undefined" ? definition : undefined;
  return epsg === undefined && !wkt ? null : { epsg, wkt };
}

/**
 * Every feature table of a GeoPackage, as features with their columns as properties, each
 * reprojected as its SRS says. Attribute-only tables and tile pyramids are left out.
 */
export async function readGeoPackage(file: InputFile): Promise<Feature[]> {
  const db = await openDatabase(file.bytes);
  try {
    let tables: Record<string, SqlValue>[];
    try {
      tables = rows(
        db,
        "SELECT g.table_name, g.column_name, g.srs_id FROM gpkg_geometry_columns g JOIN gpkg_contents c ON c.table_name = g.table_name WHERE c.data_type = 'features'",
      );
    } catch {
      throw new UnsupportedDataError(`${file.name} isn't a GeoPackage.`);
    }
    if (tables.length === 0)
      throw new UnsupportedDataError(`${file.name} has no feature tables.`);

    return tables.flatMap(({ table_name, column_name, srs_id }) => {
      const crs = srsCrs(db, Number(srs_id));
      const transform = crs ? crsTransform(crs, file.name) : null;
      const quoted = (name: unknown) =>
        `"${String(name).replaceAll('"', '""')}"`;
      return rows(db, `SELECT * FROM ${quoted(table_name)}`).flatMap(
        ({ [String(column_name)]: blob, ...properties }) => {
          const geometry =
            blob instanceof Uint8Array ? readGeoPackageGeometry(blob) : null;
          return geometry ? [feature(geometry, properties, transform)] : [];
        },
      );
    });
  } finally {
    db.close();
  }
}
