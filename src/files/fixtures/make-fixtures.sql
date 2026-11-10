-- Regenerates the file fixtures with DuckDB's spatial extension (its GDAL drivers):
--   cd src/files/fixtures && duckdb < make-fixtures.sql && python3 make-zips.py
-- places.gpx is written by hand, GDAL's GPX driver being picky about fields.
-- Three places in Madrid, as points, in WGS84 and in ETRS89 / UTM zone 30N (EPSG:25830).
INSTALL spatial;
LOAD spatial;

CREATE TABLE places AS
SELECT * FROM (VALUES
  ('Puerta del Sol', 1, ST_Point(-3.7038, 40.4168)),
  ('Retiro', 2, ST_Point(-3.6823, 40.4153)),
  ('Bernabéu', 3, ST_Point(-3.6883, 40.4531))
) AS t(name, rank, geom);

CREATE TABLE places_utm AS
SELECT name, rank, ST_Transform(geom, 'EPSG:4326', 'EPSG:25830', always_xy := true) AS geom
FROM places;

COPY places_utm TO 'places-utm.shp' WITH (FORMAT gdal, DRIVER 'ESRI Shapefile', SRS 'EPSG:25830');
COPY places_utm TO 'places-utm.fgb' WITH (FORMAT gdal, DRIVER 'FlatGeobuf', SRS 'EPSG:25830');
COPY places_utm TO 'places-utm.gpkg' WITH (FORMAT gdal, DRIVER 'GPKG', SRS 'EPSG:25830');
COPY places TO 'places.kml' WITH (FORMAT gdal, DRIVER 'KML', SRS 'OGC:CRS84');
COPY places TO 'places.parquet' (FORMAT parquet);
COPY places TO 'places-zstd.parquet' (FORMAT parquet, COMPRESSION zstd);
COPY places TO 'places-gzip.parquet' (FORMAT parquet, COMPRESSION gzip);
-- With its CRS in the GeoParquet metadata, as PROJJSON.
COPY (SELECT name, rank, geom::GEOMETRY('EPSG:25830') AS geom FROM places_utm) TO 'places-utm.parquet' (FORMAT parquet);
