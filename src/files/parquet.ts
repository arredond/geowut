import type { Feature, Geometry } from "geojson";
import { gunzipSync } from "fflate";
import { decompress as zstd } from "fzstd";
import { parquetMetadata, parquetReadObjects } from "hyparquet";
import type { Compressors } from "hyparquet";
import { UnsupportedDataError } from "../errors";
import { crsTransform } from "../projection";
import type { Crs } from "../projection";
import { feature } from "./common";
import type { InputFile } from "./common";
import { parseCrsString } from "./crs";

/**
 * Codecs beyond the snappy hyparquet reads itself: the ones GeoParquet writers use (GDAL,
 * GeoPandas and DuckDB default to snappy, and offer zstd and gzip). Brotli and LZ4 are refused.
 */
const COMPRESSORS: Compressors = {
  GZIP: (input) => gunzipSync(input),
  ZSTD: (input) => zstd(input),
};

interface GeoMetadata {
  primary_column?: string;
  columns?: Record<string, { crs?: object | string | null }>;
}

/** The CRS of a column: in GeoParquet's metadata (PROJJSON, longitude and latitude if left out), else in Parquet's geometry type. */
function columnCrs(
  column: string,
  geo: GeoMetadata | undefined,
  logicalCrs: string | undefined,
): Crs | null {
  const crs = geo?.columns?.[column]?.crs;
  if (crs && typeof crs === "object") return { projjson: crs };
  if (typeof crs === "string") return parseCrsString(crs);
  // Null says the CRS is unknown: drawn as longitude and latitude, as nothing else can be.
  if (crs === null || geo?.columns?.[column]) return null;
  return logicalCrs ? parseCrsString(logicalCrs) : null;
}

/**
 * A GeoParquet file (or plain Parquet with a geometry column), as features with its other columns
 * as properties, reprojected as its metadata says. Its primary geometry column is the one drawn.
 */
export async function readParquet(file: InputFile): Promise<Feature[]> {
  const buffer = file.bytes.buffer.slice(
    file.bytes.byteOffset,
    file.bytes.byteOffset + file.bytes.byteLength,
  ) as ArrayBuffer;
  const metadata = parquetMetadata(buffer);
  const geoValue = metadata.key_value_metadata?.find(
    (kv) => kv.key === "geo",
  )?.value;
  const geo: GeoMetadata | undefined = geoValue
    ? JSON.parse(geoValue)
    : undefined;

  const geometryColumns = metadata.schema.filter(
    (s) =>
      s.logical_type?.type === "GEOMETRY" ||
      s.logical_type?.type === "GEOGRAPHY",
  );
  const column = geo?.primary_column ?? geometryColumns[0]?.name;
  if (!column)
    throw new UnsupportedDataError(
      `${file.name} has no geometry column: it isn't GeoParquet.`,
    );
  const logical = geometryColumns.find((s) => s.name === column)?.logical_type;
  const crs = columnCrs(
    column,
    geo,
    logical && "crs" in logical ? logical.crs : undefined,
  );
  const transform = crs ? crsTransform(crs, file.name) : null;

  let rows: Record<string, unknown>[];
  try {
    rows = await parquetReadObjects({
      file: buffer,
      metadata,
      compressors: COMPRESSORS,
    });
  } catch (error) {
    const codec = /unsupported compression codec: (\w+)/.exec(
      String(error),
    )?.[1];
    if (codec)
      throw new UnsupportedDataError(
        `${file.name} is compressed with ${codec}, which GeoWut can't read: snappy, gzip and zstd only.`,
      );
    throw error;
  }
  return rows.flatMap(({ [column]: geometry, ...properties }) =>
    geometry ? [feature(geometry as Geometry, properties, transform)] : [],
  );
}
