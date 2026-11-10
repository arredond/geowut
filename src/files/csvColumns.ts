/**
 * The column names read as coordinates or geometries, in order of preference, matched ignoring
 * case and surrounding spaces. A geometry column wins over latitude and longitude ones.
 */
export const CSV_COLUMNS = {
  latitude: ["latitude", "lat", "y"],
  longitude: ["longitude", "lon", "lng", "long", "x"],
  /** Holding WKT, EWKT, hex WKB or EWKB, or GeoJSON, told apart cell by cell. */
  geometry: [
    "geometry",
    "geom",
    "the_geom",
    "wkt",
    "wkb",
    "wkb_geometry",
    "geojson",
    "geography",
    "geog",
    "shape",
  ],
};
