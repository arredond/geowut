import type { Feature, Geometry } from "geojson";
import { deserialize } from "flatgeobuf/geojson";
import type { HeaderMeta } from "flatgeobuf";
import { crsTransform } from "../projection";
import type { Crs } from "../projection";
import { feature } from "./common";
import type { InputFile } from "./common";

/** The CRS a FlatGeobuf header names: its EPSG code and WKT, either of which may be missing. */
function headerCrs(header: HeaderMeta | undefined): Crs | null {
  const crs = header?.crs;
  if (!crs) return null;
  const epsg =
    crs.code > 0 && (!crs.org || crs.org.toUpperCase() === "EPSG")
      ? crs.code
      : undefined;
  const wkt = crs.wkt ?? undefined;
  return epsg === undefined && !wkt ? null : { epsg, wkt };
}

/** A FlatGeobuf's features, with their properties, reprojected as its header says. */
export async function readFlatGeobuf(file: InputFile): Promise<Feature[]> {
  let header: HeaderMeta | undefined;
  const raw: Feature[] = [];
  for await (const f of deserialize(file.bytes, {
    headerMetaFn: (meta) => (header = meta),
  }))
    raw.push(f as Feature);

  const crs = headerCrs(header);
  const transform = crs ? crsTransform(crs, file.name) : null;
  return raw.flatMap((f) =>
    f.geometry
      ? [feature(f.geometry as Geometry, f.properties ?? {}, transform)]
      : [],
  );
}
