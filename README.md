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

For now, just draw a marker, line or polygon and click on it for a popup that allows you to copy a bunch of
info to your clipboard (WKT, GeoJSON, BBox and quadkey and h3 cell coverings). You can also add data in GeoJSON
or WKT using the upload button. Simply paste your text!

Finally, h3 and quadkey cells are also available by toggling the layers in the upper left corner.

## Coming soon

- Selectors to change the resolution of the grid layers.
- Some design love to make it look less early 2000s.

## Massive props to

The maintainers of all the aforementioned sites, plus:

- [Leaflet](https://leafletjs.com/) for being the backbone of web mapping for the last 10 years.
- [CARTO](https://carto.com/) for their awesome basemaps.
- Arthur Endsley K. for the [Wicket](https://github.com/arthur-e/Wicket) library and web tool.
- [Uber](https://github.com/uber/h3-js) for the H3 geographic grid system and JS library.
- [Mapbox](https://www.mapbox.com/) for so many tools, including
  [tile-cover]([geojson.io](https://www.latlong.net/)),
  [tilebelt]([geojson.io](https://www.latlong.net/)) and [geojson.io](https://www.latlong.net/),
  among many other great FOSS contributions.
