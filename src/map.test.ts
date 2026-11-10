import { describe, expect, it } from "vitest";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { StyleSpecification } from "maplibre-gl";
import {
  basemapStyle,
  compassAction,
  compassHint,
  compassTitle,
  BUILDINGS_3D_ID,
  getPaddedViewportBbox,
  withBuildings3d,
  withOverlays,
} from "./map";

function mapWithBounds(
  west: number,
  south: number,
  east: number,
  north: number,
): MapLibreMap {
  return {
    getBounds: () => ({
      getWest: () => west,
      getSouth: () => south,
      getEast: () => east,
      getNorth: () => north,
    }),
  } as unknown as MapLibreMap;
}

describe("getPaddedViewportBbox", () => {
  it("pads by half the viewport on every side", () => {
    expect(getPaddedViewportBbox(mapWithBounds(0, 0, 10, 4))).toEqual([
      -5, -2, 15, 6,
    ]);
  });

  it("honours a custom padding", () => {
    expect(getPaddedViewportBbox(mapWithBounds(0, 0, 10, 4), 0)).toEqual([
      0, 0, 10, 4,
    ]);
  });

  it("stays within mercator latitudes", () => {
    const [, south, , north] = getPaddedViewportBbox(
      mapWithBounds(0, -80, 10, 80),
    );
    expect(south).toBe(-85.05);
    expect(north).toBe(85.05);
  });

  it("becomes the whole world when zoomed far out", () => {
    const [west, , east] = getPaddedViewportBbox(
      mapWithBounds(-300, -80, 300, 80),
    );
    expect([west, east]).toEqual([-180, 180]);
  });
});

describe("withOverlays", () => {
  const style = (sources: string[], layers: string[]): StyleSpecification => ({
    version: 8,
    sources: Object.fromEntries(
      sources.map((id) => [
        id,
        { type: "geojson", data: { type: "FeatureCollection", features: [] } },
      ]),
    ),
    layers: layers.map((id) => ({ id, type: "background" })),
  });

  it("keeps grids and drawings, on top of the new basemap, and drops the old basemap", () => {
    const previous = style(
      ["openmaptiles", "grid-h3", "td-polygon", "td-measure-linestring"],
      ["water", "grid-h3-fill", "td-polygon", "td-measure-linestring"],
    );
    const next = style(["openmaptiles", "ne2_shaded"], ["background", "roads"]);
    const merged = withOverlays(previous, next);
    expect(Object.keys(merged.sources)).toEqual([
      "openmaptiles",
      "ne2_shaded",
      "grid-h3",
      "td-polygon",
      "td-measure-linestring",
    ]);
    expect(merged.layers.map((layer) => layer.id)).toEqual([
      "background",
      "roads",
      "grid-h3-fill",
      "td-polygon",
      "td-measure-linestring",
    ]);
  });

  it("carries over the data the overlays hold", () => {
    const previous = style(["grid-s2"], []);
    const merged = withOverlays(previous, style([], []));
    expect(merged.sources["grid-s2"]).toBe(previous.sources["grid-s2"]);
  });

  it("takes the new style as it is on first load", () => {
    const next = style(["openmaptiles"], ["roads"]);
    expect(withOverlays(undefined, next)).toBe(next);
  });
});

describe("basemapStyle", () => {
  it("points OpenFreeMap styles at their URL", () => {
    expect(basemapStyle({ basemap: "dark", customBasemap: null })).toBe(
      "https://tiles.openfreemap.org/styles/dark",
    );
  });

  it("wraps a custom URL in a raster style", () => {
    const style = basemapStyle({
      basemap: "custom",
      customBasemap: {
        url: "https://t.example.com/{z}/{x}/{y}.png",
        source: {
          tiles: ["https://t.example.com/{z}/{x}/{y}.png"],
          scheme: "xyz",
        },
      },
    }) as StyleSpecification;
    expect(style.sources.basemap).toMatchObject({
      type: "raster",
      tiles: ["https://t.example.com/{z}/{x}/{y}.png"],
    });
  });

  it("falls back to Liberty without custom tiles", () => {
    expect(basemapStyle({ basemap: "custom", customBasemap: null })).toBe(
      "https://tiles.openfreemap.org/styles/liberty",
    );
  });
});

describe("the compass", () => {
  it("says what a click does, then how to tilt and rotate by hand", () => {
    expect(compassHint(0, 0)).toEqual({
      action: "Tilt the map",
      help: "Ctrl+drag the map to tilt and rotate it",
    });
    expect(compassHint(10, 40).action).toBe("Reset rotation and tilt");
  });

  it("tilts a flat, north-up map", () => {
    expect(compassAction(0, 0)).toBe("tilt");
    expect(compassTitle(0, 0)).toBe(
      "Tilt the map. Ctrl+drag the map to tilt and rotate it.",
    );
  });

  it.each([
    [0, 50],
    [45, 0],
    [-0.5, 0],
    [30, 20],
  ])("resets rotation and tilt at bearing %d, pitch %d", (bearing, pitch) => {
    expect(compassAction(bearing, pitch)).toBe("reset");
    expect(compassTitle(bearing, pitch)).toMatch(/^Reset rotation and tilt\./);
  });
});

describe("withBuildings3d", () => {
  const style = (layers: object[]) =>
    ({
      version: 8,
      sources: { openmaptiles: { type: "vector", url: "x" } },
      layers,
    }) as unknown as StyleSpecification;
  const flat = (id: string, color: unknown, extra = {}) => ({
    id,
    type: "fill",
    source: "openmaptiles",
    "source-layer": "building",
    paint: { "fill-color": color },
    ...extra,
  });
  const road = {
    id: "road",
    type: "line",
    source: "openmaptiles",
    "source-layer": "transportation",
  };

  it("raises flat buildings past zoom 14, in their colour, flat ones stopping there", () => {
    const { layers } = withBuildings3d(
      style([flat("building", "#eee", { minzoom: 12 }), road]),
    );
    expect(layers.map((l) => l.id)).toEqual([
      "building",
      BUILDINGS_3D_ID,
      "road",
    ]);
    expect(layers[0]).toMatchObject({ minzoom: 12, maxzoom: 14 });
    expect(layers[1]).toEqual({
      id: BUILDINGS_3D_ID,
      type: "fill-extrusion",
      source: "openmaptiles",
      "source-layer": "building",
      minzoom: 14,
      filter: ["!", ["has", "hide_3d"]],
      paint: {
        "fill-extrusion-color": "#eee",
        "fill-extrusion-height": ["get", "render_height"],
        "fill-extrusion-base": ["get", "render_min_height"],
        "fill-extrusion-opacity": 0.8,
      },
    });
  });

  it("goes above every flat building layer, in the first's colour, as Bright draws roofs over them", () => {
    const { layers } = withBuildings3d(
      style([
        flat("building", "#dfdbd7"),
        flat("building-top", "#f2eae2"),
        road,
      ]),
    );
    expect(layers.map((l) => l.id)).toEqual([
      "building",
      "building-top",
      BUILDINGS_3D_ID,
      "road",
    ]);
    expect(layers.slice(0, 2).map((l) => l.maxzoom)).toEqual([14, 14]);
    expect(
      (layers[2] as { paint: Record<string, unknown> }).paint[
        "fill-extrusion-color"
      ],
    ).toBe("#dfdbd7");
  });

  it("keeps buildings as faint as the style made them", () => {
    const { layers } = withBuildings3d(
      style([
        flat("building", "#223", {
          paint: { "fill-color": "#223", "fill-opacity": 0.25 },
        }),
      ]),
    );
    expect(
      (layers[1] as { paint: Record<string, unknown> }).paint[
        "fill-extrusion-opacity"
      ],
    ).toBeCloseTo(0.2);
  });

  it("keeps an earlier end to flat buildings", () => {
    const { layers } = withBuildings3d(
      style([flat("building", "#eee", { maxzoom: 13 })]),
    );
    expect(layers[0].maxzoom).toBe(13);
  });

  it("leaves styles with 3D buildings already, as Liberty, or none, alone", () => {
    const liberty = style([
      flat("building", "#eee", { maxzoom: 14 }),
      { ...flat("building-3d", "#eee"), type: "fill-extrusion", paint: {} },
    ]);
    expect(withBuildings3d(liberty)).toEqual(liberty);
    const raster = style([{ id: "tiles", type: "raster", source: "x" }]);
    expect(withBuildings3d(raster)).toEqual(raster);
  });

  it("does nothing more the second time", () => {
    const once = withBuildings3d(style([flat("building", "#eee")]));
    expect(withBuildings3d(once)).toEqual(once);
  });
});
