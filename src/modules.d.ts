declare module "virtual:epsg-proj4" {
  /** proj4 definitions by EPSG code, from epsg-index (see build/epsgTable.ts). */
  const table: Record<string, string>;
  export default table;
}

declare module "shpjs" {
  import type { Geometry } from "geojson";
  /** A .shp's geometries, in its own coordinates when given no .prj. */
  export function parseShp(
    shp: ArrayBufferView | ArrayBuffer,
    prj?: string,
  ): (Geometry | null)[];
  /** A .dbf's rows, decoded as its .cpg says (or as Latin-1 / UTF-8 without one). */
  export function parseDbf(
    dbf: ArrayBufferView | ArrayBuffer,
    cpg?: string,
  ): Record<string, unknown>[];
}
