# _geowut_

_geowut_ is a simple cartographic tool that aims to help you figure out where stuff is in many, many
different ways. It builds on the work of many others, and hopes to do what they've done great just,
well, good enough.

It's a frontend-only static app: no servers means no data ever leaves your machine. The only external requests the browser makes are for basemap tiles and place search.

## But why?

Working with geospatial data can be confusing, to say the least. There are so many standards (eg. TMS vs OGC),
formats (eg. WKT vs. GeoJSON), grid types (eg. H3 vs. Quadkeys vs. S2) that it's easy to get lost. This is
partly why you may have ended up using a ton of little browser tools, such as:

- [bboxfinder.com](http://bboxfinder.com)
- [LatLong.net](https://www.latlong.net/)
- [geojson.io](https://www.geojson.io/)
- [Wicket](https://arthur-e.github.io/Wicket/)
- [Tiles à la Google Maps](https://www.maptiler.com/google-maps-coordinates-tile-bounds-projection/)
- [h3geo.org](https://h3geo.org/)
- [S2 Region Coverer](https://s2.sidewalklabs.com/regioncoverer/)

...and many more. These tools are awesome and I've used them for many years now (kudos to the creators!)
but I've always wanted a one-stop-shop for all those pesky needs, from "I need the WKT of a line",
to "no, better make it GeoJSON", all the way to "gimme a level 14 tile in Manhattan".

## How to use it

- Drawing features: the toolbar on the left-hand side lets you draw a variety of shapes or measure on the map.
- Adding data: use the "Add data" button (or simply copy/paste on the map) to create features from a number of formats, such as GeoJSON, WKT and WKB, GDAL bboxes, lat/long pairs in decimal or DMS, map links, H3 IDs, geohashes, plus codes, encoded polylines, etc. Anything _geowut_ can export, it can import as well.
- Adding files: open them from "Add data", or drop or paste them anywhere on the map. GeoJSON (and GeoJSON lines), CSV
  (with lat/lon columns, or a WKT/WKB/GeoJSON geometry column: the dialog lists the column names it reads), KML, KMZ,
  GPX, Shapefiles (zipped, or their parts together), GeoParquet, FlatGeobuf and GeoPackage. Files are read in your
  browser and never uploaded; the code for each format only loads when you first open one.
- Projections: data in other coordinate systems is reprojected to WGS84 when it says which, be it an EWKT/EWKB SRID, an
  Esri JSON spatial reference, a `.prj` or a file's own metadata. Any EPSG code for a 2D system works.
- Z values: kept from every format, shown in a feature's details and kept in exports. Tilt the map (click the compass, or
  Ctrl-drag) to see polygons with Z extruded to their highest Z; MapLibre can't raise lines or points.
- Grid layers: visualize the most common geospatial indexes (H3, S2, A5, XYZ tiles) at any zoom level. Clicking on the label shows you all the properties you need, including IDs, parents and children.
- Search: powered by [Photon](https://photon.komoot.io/) and [Nominatim](https://nominatim.org/). Click the "+" button next to a result to add the feature to the map (simplified to avoid crashing your browser).
- Settings: light/dark/auto mode, basemap picker, etc.

## Stack

_geowut_ is a simple frontend-only static app ([Vite](https://vite.dev/) + TypeScript) that relies on _a lot_ of fantastic, open tools such as:

- [MapLibre GL JS](https://maplibre.org/) for rendering.
- [OpenFreeMap](https://openfreemap.org/) for basemap tiles and styles.
- [Photon](https://photon.komoot.io/), [Nominatim](https://nominatim.org/) and [maplibre-gl-geocoder](https://github.com/maplibre/maplibre-gl-geocoder) for place search. _geowut_ currently uses their public APIs -- be nice!
- [Terra Draw](https://terradraw.io/) for drawing and editing geometries.
- [betterknown](https://github.com/placemark/betterknown) for WKT and EWKT.
- [proj4js](https://github.com/proj4js/proj4js) for reprojection, with EPSG definitions from
  [epsg-index](https://github.com/derhuerst/epsg-index).
- [Papa Parse](https://www.papaparse.com/) for CSV, [togeojson](https://github.com/placemark/togeojson) for KML and GPX,
  [shpjs](https://github.com/calvinmetcalf/shapefile-js) for Shapefiles, [hyparquet](https://github.com/hyparam/hyparquet)
  for GeoParquet, [flatgeobuf](https://github.com/flatgeobuf/flatgeobuf) for FlatGeobuf and
  [sql.js](https://github.com/sql-js/sql.js) for GeoPackage, plus [fflate](https://github.com/101arrowz/fflate) and
  [fzstd](https://github.com/101arrowz/fzstd) for zips and compression.
- [Terraformer](https://github.com/terraformer-js/terraformer) for Esri JSON parsing.
- [GeographicLib](https://geographiclib.sourceforge.io/) for measurements on the WGS84 ellipsoid.
- [h3-js](https://github.com/uber/h3-js) for H3 hexagons.
- [s2js](https://github.com/missinglink/s2js) for S2 cells.
- [a5](https://github.com/felixpalmer/a5) for A5 pentagons.
- [ogc-client](https://github.com/camptocamp/ogc-client) for WMS and WMTS capabilities (custom basemaps).

### Development

Contributions are welcome!

To start the app locally simply run the `bin/geowut` script, which runs the dev server in the background at
http://localhost:5173 (set `PORT` to change it) and installs or updates dependencies first when needed:

```
bin/geowut start   # install dependencies if needed, then start the dev server
bin/geowut stop    # stop it
```

Or use npm directly:

```
npm install
npm run dev      # local dev server
npm run build    # production build to dist/
npm run preview  # serve the production build locally
npm test         # unit tests
```

Tests run on [Vitest](https://vitest.dev/) with [jsdom](https://github.com/jsdom/jsdom). The file readers are tested
against small files written by GDAL (through DuckDB's spatial extension), in `src/files/fixtures/`; `make-fixtures.sql`
there regenerates them. [Prettier](https://prettier.io/), [oxlint](https://oxc.rs/) and `tsc` run as [pre-commit](https://pre-commit.com/) hooks (`pre-commit install` to set them up).

## Massive props to

The maintainers of all the aforementioned sites, plus:

- [MapLibre](https://maplibre.org/) and the original [Leaflet](https://leafletjs.com/), which was the
  backbone of web mapping (and of this project) for a very long time.
- [OpenFreeMap](https://openfreemap.org/) for the free basemap styles and tiles, and its fonts, which also label the grids.
- [OpenMapTiles](https://openmaptiles.org/) for the vector tile schema and styles OpenFreeMap builds on.
- [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors for the map data under those basemaps and
  place search.
- [komoot](https://www.komoot.com/) for running the public [Photon](https://photon.komoot.io/) service, the
  [OpenStreetMap Foundation](https://osmfoundation.org/) for the public [Nominatim](https://nominatim.org/) one, and
  MapLibre for [maplibre-gl-geocoder](https://github.com/maplibre/maplibre-gl-geocoder).
- [James Milner](https://github.com/JamesLMilner) for [Terra Draw](https://github.com/JamesLMilner/terra-draw) and its
  MapLibre adapter.
- [Tom MacWright](https://github.com/tmcw) and [Placemark](https://www.placemark.io/) for betterknown and togeojson.
- The [proj4js](https://github.com/proj4js/proj4js) maintainers, and [Jannis R](https://github.com/derhuerst) for epsg-index.
- [Calvin Metcalf](https://github.com/calvinmetcalf) for shpjs, [Hyperparam](https://github.com/hyparam) for hyparquet,
  [Björn Harrtell](https://github.com/bjornharrtell) and contributors for FlatGeobuf, the sql.js maintainers, and
  [101arrowz](https://github.com/101arrowz) for fflate and fzstd.
- The [Terraformer](https://github.com/terraformer-js/terraformer) maintainers for `@terraformer/arcgis`.
- [Uber](https://github.com/uber/h3-js) for the H3 geographic grid system and JS library.
- [Charles Karney](https://geographiclib.sourceforge.io/) for GeographicLib.
- [Camptocamp](https://github.com/camptocamp) for [ogc-client](https://github.com/camptocamp/ogc-client), which reads
  the WMS and WMTS capabilities behind custom basemaps.
- [Peter Johnson](https://github.com/missinglink) for [s2js](https://github.com/missinglink/s2js), a pure
  TypeScript port of Google's S2 geometry library.
- [Felix Palmer](https://github.com/felixpalmer) for [the A5 tiling system](https://a5geo.org/) and its [official TS library](https://github.com/felixpalmer/a5).
- Google's [Noto Sans](https://fonts.google.com/noto/specimen/Noto+Sans) ([SIL Open Font License](https://openfontlicense.org/)), the typeface of every label on the map, basemap and grids alike.

## License

_geowut_ is [MIT licensed](LICENSE). It's built on the open-source packages credited above, under their own
permissive licenses (MIT, ISC, BSD and Apache-2.0): `npm run build` writes them all, with their full texts, to
`dist/third-party-licenses.txt`, which the site serves and links from its settings.
