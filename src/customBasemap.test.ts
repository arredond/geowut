import { describe, expect, it } from "vitest";
import { parseTileUrl, rasterStyle } from "./customBasemap";

describe("parseTileUrl", () => {
  it("takes XYZ templates as they are", () => {
    expect(parseTileUrl(" https://tiles.example.com/{z}/{x}/{y}.png ")).toEqual(
      {
        tiles: ["https://tiles.example.com/{z}/{x}/{y}.png"],
        scheme: "xyz",
      },
    );
  });

  it("expands {s} subdomains and drops {r}", () => {
    expect(
      parseTileUrl("https://{s}.tile.example.com/{z}/{x}/{y}{r}.png"),
    ).toEqual({
      tiles: ["a", "b", "c"].map(
        (s) => `https://${s}.tile.example.com/{z}/{x}/{y}.png`,
      ),
      scheme: "xyz",
    });
  });

  it("reads {-y} as TMS", () => {
    expect(parseTileUrl("https://example.com/{z}/{x}/{-y}.png")).toEqual({
      tiles: ["https://example.com/{z}/{x}/{y}.png"],
      scheme: "tms",
    });
  });

  it.each([
    [
      "https://example.com/wmts/ortho/GoogleMapsCompatible/{TileMatrix}/{TileRow}/{TileCol}.jpeg",
      "https://example.com/wmts/ortho/GoogleMapsCompatible/{z}/{y}/{x}.jpeg",
    ],
    [
      "https://example.com/wmts?SERVICE=WMTS&REQUEST=GetTile&LAYER=ortho&TILEMATRIXSET=GoogleMapsCompatible&TILEMATRIX={TileMatrix}&TILEROW={TileRow}&TILECOL={TileCol}&FORMAT=image/png",
      "https://example.com/wmts?SERVICE=WMTS&REQUEST=GetTile&LAYER=ortho&TILEMATRIXSET=GoogleMapsCompatible&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/png",
    ],
    [
      "https://example.com/wmts/{tilematrix}/{tilerow}/{tilecol}.png",
      "https://example.com/wmts/{z}/{y}/{x}.png",
    ],
  ])("turns the WMTS template %s into XYZ", (input, tile) => {
    expect(parseTileUrl(input)).toEqual({ tiles: [tile], scheme: "xyz" });
  });

  it("passes quadkey and WMS bbox templates through to MapLibre", () => {
    expect(parseTileUrl("https://example.com/t/{quadkey}.png")).not.toBeNull();
    expect(
      parseTileUrl("https://example.com/wms?BBOX={bbox-epsg-3857}&WIDTH=256"),
    ).not.toBeNull();
  });

  it.each([
    "",
    "tiles.example.com/{z}/{x}/{y}.png",
    "ftp://example.com/{z}/{x}/{y}.png",
    "https://example.com/tiles.png",
    "https://example.com/{z}/{x}.png",
    "https://example.com/{Style}/{z}/{x}/{y}.png",
    "https://example.com/{z}/{x}/{y}.png and more",
  ])("rejects %j", (input) => {
    expect(parseTileUrl(input)).toBeNull();
  });
});

describe("rasterStyle", () => {
  it("shows the tiles under glyphs for our labels", () => {
    const style = rasterStyle({
      tiles: ["https://t/{z}/{x}/{y}.png"],
      scheme: "xyz",
    });
    expect(style.glyphs).toContain("{fontstack}");
    expect(style.sources.basemap).toMatchObject({
      type: "raster",
      tiles: ["https://t/{z}/{x}/{y}.png"],
      tileSize: 256,
    });
    expect(style.layers).toEqual([
      { id: "basemap", type: "raster", source: "basemap" },
    ]);
  });
});
