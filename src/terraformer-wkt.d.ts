declare module '@terraformer/wkt' {
  import type { Geometry, GeometryCollection } from 'geojson';

  export function wktToGeoJSON(wkt: string): Geometry;
  export function geojsonToWKT(geojson: Geometry | GeometryCollection): string;
}
