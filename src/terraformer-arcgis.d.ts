declare module "@terraformer/arcgis" {
  import type { GeoJSON } from "geojson";

  /** Esri JSON geometries, features and feature sets to GeoJSON, ids from OBJECTID or FID (or idAttribute). */
  export function arcgisToGeoJSON(
    arcgis: object,
    idAttribute?: string,
  ): GeoJSON;
  export function geojsonToArcGIS(
    geojson: GeoJSON,
    idAttribute?: string,
  ): object;
}
