# GeoWut

GeoWut is a simple cartographic tool that aims to help you figure out where stuff is in many, many
different ways. It builds on the work of many others, and hopes to do what they've done great just,
well, good enough.

## But why?

Working with geospatial data can be confusing, to say the least. There are so many standards (eg. TMS vs OGC),
formats (eg. WKT vs. GeoJSON), grid types (eg. H3 vs. Quadkeys vs. S2) that it's easy to get lost. This is
partly why you may have ended up using a ton of little browser tools, such as:

- [bboxfinder.com](http://bboxfinder.com)
- [LatLong.net](https://www.latlong.net/)
- [geojson.io](https://www.latlong.net/)
- [Wicket](https://arthur-e.github.io/Wicket/)
- [Tiles à la Google Maps](https://www.maptiler.com/google-maps-coordinates-tile-bounds-projection/)
- [S2 Region Coverer](https://s2.sidewalklabs.com/regioncoverer/)

...and many more. These tools are awesome and I've used them for many years now (kudos to the creators!)
but I've always wanted a one-stop-shop for all those pesky needs, from "I need the WKT of a line",
to "no, better make it GeoJSON", all the way to "gimme a level 14 tile in Manhattan".

## How to use it

Draw a point, line, polygon, rectangle, circle or freehand shape and a panel opens with buttons to copy a bunch of info to your
clipboard: WKT, GeoJSON, bounding box, center, and H3 / Quadkey / S2 cell coverings. You can also add data
via the "Add data" button. Simply paste GeoJSON, WKT, Esri JSON (geometries, features or a REST query response, in WGS84 or Web Mercator), a bounding box (`xmin ymin xmax ymax`, including GDAL's
`-te`/`-spat`/`-projwin` and ogrinfo's `Extent:` lines) or `lat, lng` pairs, one per line! Or skip the button and paste it straight onto the map. Click any geometry to bring that panel
back, along with a popup to edit or delete it. The popup also shows the feature's measurements (coordinates,
length, perimeter, area) and, for pasted GeoJSON features, their properties. The
trash button stays on so you can delete several features, or all of them. Esc takes you out of any tool, Ctrl/Cmd+Z and
Ctrl/Cmd+Shift+Z undo and redo, and Backspace deletes the clicked feature.

The search box at the top suggests places as you type, with [Photon](https://photon.komoot.io/): pick one and the
map flies there. The + next to a suggestion adds it to the map instead, with its full outline (a city's boundary, a
road's line) from [Nominatim](https://nominatim.org/). Both are free public services with fair-use limits, so the box
waits for a pause in typing before searching, and remembers answers.

H3, Quadkey and S2 grid cells covering the current viewport are also available by toggling the layers in
the bottom-left panel. Each grid picks its resolution from the map zoom; untick "Auto" to set your own. The
panel's top toggle hides all grids and collapses the card. Click a cell's label to copy its name, along with
its Google and TMS tile identifiers for quadkeys.

The gear button holds settings for units, theme and basemap: any of [OpenFreeMap](https://openfreemap.org/)'s
styles, or "Custom" with your own raster tiles. Paste a tile URL template, either XYZ (`https://…/{z}/{x}/{y}.png`,
with `{s}` and `{-y}` too), WMTS (`{TileMatrix}/{TileRow}/{TileCol}`) or a WMS GetMap with `{bbox-epsg-3857}`, or
paste a WMS or WMTS service or GetCapabilities URL and pick one of its layers. Only Web Mercator (EPSG:3857) layers
are offered, and the server must allow cross-origin requests.

## Stack

Rewritten as a frontend-only static app: [Vite](https://vite.dev/) + TypeScript,
[MapLibre GL JS](https://maplibre.org/) for the map, [OpenFreeMap](https://openfreemap.org/) for the basemaps,
[Photon](https://photon.komoot.io/), [Nominatim](https://nominatim.org/) and [maplibre-gl-geocoder](https://github.com/maplibre/maplibre-gl-geocoder) for place search, [Terra Draw](https://terradraw.io/) for drawing/editing
geometries, [Terraformer](https://github.com/terraformer-js/terraformer) for WKT and Esri JSON ↔ GeoJSON,
[h3-js](https://github.com/uber/h3-js) for H3, [s2js](https://github.com/missinglink/s2js) for S2,
[ogc-client](https://github.com/camptocamp/ogc-client) for reading WMS/WMTS capabilities, and
[GeographicLib](https://geographiclib.sourceforge.io/) for measuring on the WGS84 ellipsoid. No
backend, no database — `npm run build` produces a static `dist/` you can host anywhere.

The quickest way to run it locally is the `bin/geowut` script, which runs the dev server in the background at
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

## Massive props to

The maintainers of all the aforementioned sites, plus:

- [MapLibre](https://maplibre.org/) and the original [Leaflet](https://leafletjs.com/), which was the
  backbone of web mapping (and of this project) for a very long time.
- [OpenFreeMap](https://openfreemap.org/) for the free basemap styles and tiles, and its fonts, which also label the grids.
- [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors for the map data under those basemaps and
  place search.
- [komoot](https://www.komoot.com/) for running the public [Photon](https://photon.komoot.io/) service, the
  [OpenStreetMap Foundation](https://osmfoundation.org/) for the public [Nominatim](https://nominatim.org/) one, and
  MapLibre for [maplibre-gl-geocoder](https://github.com/maplibre/maplibre-gl-geocoder).
- [James Milner](https://github.com/JamesLMilner) for [Terra Draw](https://github.com/JamesLMilner/terra-draw) and its
  MapLibre adapter.
- The [Terraformer](https://github.com/terraformer-js/terraformer) maintainers for `@terraformer/wkt` and `@terraformer/arcgis`.
- [Uber](https://github.com/uber/h3-js) for the H3 geographic grid system and JS library.
- [Charles Karney](https://geographiclib.sourceforge.io/) for GeographicLib.
- [Camptocamp](https://github.com/camptocamp) for [ogc-client](https://github.com/camptocamp/ogc-client), which reads
  the WMS and WMTS capabilities behind custom basemaps.
- [missinglink](https://github.com/missinglink) for [s2js](https://github.com/missinglink/s2js), a pure
  TypeScript port of Google's S2 geometry library.
