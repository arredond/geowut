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
in GeoJSON or WKT via the "Add data" button. Simply paste your text! Click any geometry to bring that panel
back, along with a popup to edit or delete it. The popup also shows the feature's measurements (coordinates,
length, perimeter, area) and, for pasted GeoJSON features, their properties. The
trash button stays on so you can delete several features, or all of them. Esc takes you out of any tool, Ctrl/Cmd+Z and
Ctrl/Cmd+Shift+Z undo and redo, and Backspace deletes the clicked feature.

H3, Quadkey and S2 grid cells covering the current viewport are also available by toggling the layers in
the bottom-left panel. Each grid picks its resolution from the map zoom; untick "Auto" to set your own. The
panel's top toggle hides all grids and collapses the card. Click a cell's label to copy its name, along with
its Google and TMS tile identifiers for quadkeys.

## Stack

Rewritten as a frontend-only static app: [Vite](https://vite.dev/) + TypeScript,
[MapLibre GL JS](https://maplibre.org/) for the map, [Terra Draw](https://terradraw.io/) for drawing/editing
geometries, [@terraformer/wkt](https://github.com/terraformer-js/terraformer) for WKT↔GeoJSON,
[h3-js](https://github.com/uber/h3-js) for H3, [s2js](https://github.com/missinglink/s2js) for S2, and
[GeographicLib](https://geographiclib.sourceforge.io/) for measuring on the WGS84 ellipsoid. No
backend, no database — `npm run build` produces a static `dist/` you can host anywhere.

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
- [CARTO](https://carto.com/) for their awesome basemaps.
- [James Milner](https://github.com/JamesLMilner) for [Terra Draw](https://github.com/JamesLMilner/terra-draw).
- The [Terraformer](https://github.com/terraformer-js/terraformer) maintainers for `@terraformer/wkt`.
- [Uber](https://github.com/uber/h3-js) for the H3 geographic grid system and JS library.
- [Charles Karney](https://geographiclib.sourceforge.io/) for GeographicLib.
- [missinglink](https://github.com/missinglink) for [s2js](https://github.com/missinglink/s2js), a pure
  TypeScript port of Google's S2 geometry library.
