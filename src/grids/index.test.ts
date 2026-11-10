import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Map as MapLibreMap } from "maplibre-gl";
import {
  cellDetails,
  gridCellAtPoint,
  gridIcon,
  GridLayer,
  GRID_DEFINITIONS,
} from ".";
import type { GridCellFeature } from ".";
import { cellPolygon, coverBbox } from "./quadkey";

function fakeMap(zoom = 12) {
  const setData = vi.fn();
  const map = {
    zoom,
    setData,
    getZoom: () => map.zoom,
    getBounds: () => ({
      getWest: () => -3.75,
      getEast: () => -3.65,
      getSouth: () => 40.38,
      getNorth: () => 40.42,
    }),
    addSource: vi.fn(),
    addLayer: vi.fn(),
    setLayoutProperty: vi.fn(),
    getSource: () => ({ setData }),
    getCanvas: () => ({ style: {} }),
    on: vi.fn(),
    queryRenderedFeatures: vi.fn(),
  };
  return map;
}

const definition = (id: string) =>
  GRID_DEFINITIONS.find((def) => def.id === id)!;
const asMap = (map: ReturnType<typeof fakeMap>) =>
  map as unknown as MapLibreMap;
const lastCellCount = (map: ReturnType<typeof fakeMap>) =>
  map.setData.mock.lastCall![0].features.length;

describe("GridLayer", () => {
  let map: ReturnType<typeof fakeMap>;
  let layer: GridLayer;

  beforeEach(() => {
    map = fakeMap();
    layer = new GridLayer(asMap(map), definition("quadkey"));
  });

  it("starts hidden, in auto mode, at the resolution for the current zoom", () => {
    expect(layer.visible).toBe(false);
    expect(layer.auto).toBe(true);
    expect(layer.resolution).toBe(13);
  });

  it("draws cells when shown and clears them when hidden", () => {
    layer.setVisible(true);
    expect(lastCellCount(map)).toBeGreaterThan(0);
    layer.setVisible(false);
    expect(lastCellCount(map)).toBe(0);
  });

  it("follows the zoom in auto mode, leaving the redraw to moveend", () => {
    layer.setVisible(true);
    map.setData.mockClear();
    map.zoom = 14;
    const onChange = vi.fn();
    layer.onResolutionChange = onChange;

    layer.resetResolutionForZoom();

    expect(onChange).toHaveBeenCalledWith(15);
    expect(map.setData).not.toHaveBeenCalled();
  });

  it("tells listeners when the resolution changes, and only then", () => {
    const listener = vi.fn();
    layer.addResolutionListener(listener);
    layer.resetResolutionForZoom();
    expect(listener).not.toHaveBeenCalled();
    map.zoom = 14;
    layer.resetResolutionForZoom();
    expect(listener).toHaveBeenCalledOnce();
    layer.setAuto(false);
    layer.setResolution(9);
    layer.setResolution(9);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("keeps a manual resolution while zooming", () => {
    layer.setAuto(false);
    layer.setResolution(9);
    map.zoom = 14;
    layer.resetResolutionForZoom();
    expect(layer.resolution).toBe(9);
  });

  it("snaps to the zoom and redraws when auto is turned back on", () => {
    layer.setVisible(true);
    layer.setAuto(false);
    layer.setResolution(9);
    map.setData.mockClear();

    layer.setAuto(true);

    expect(layer.resolution).toBe(13);
    expect(map.setData).toHaveBeenCalledOnce();
  });

  it("clamps and rounds manual resolutions", () => {
    layer.setResolution(99);
    expect(layer.resolution).toBe(definition("quadkey").maxResolution);
    layer.setResolution(3.6);
    expect(layer.resolution).toBe(4);
  });

  it.each(["h3", "quadkey", "s2"])(
    "draws nothing and flags it when %s would need too many cells",
    (id) => {
      const grid = new GridLayer(asMap(map), definition(id));
      const onTooMany = vi.fn();
      grid.onTooManyCellsChange = onTooMany;
      const coverBboxSpy = vi.spyOn(grid.def, "coverBbox");

      grid.setVisible(true);
      grid.setResolution(grid.def.maxResolution);

      expect(onTooMany).toHaveBeenLastCalledWith(true);
      expect(coverBboxSpy).toHaveBeenCalledTimes(1); // Only the first, auto-resolution draw.
      expect(lastCellCount(map)).toBe(0);
      coverBboxSpy.mockRestore();
    },
  );

  it("clears the flag when hidden", () => {
    const onTooMany = vi.fn();
    layer.onTooManyCellsChange = onTooMany;
    layer.setVisible(true);
    layer.setResolution(23);
    layer.setVisible(false);
    expect(onTooMany).toHaveBeenLastCalledWith(false);
  });

  it("looks up the cells it drew, and forgets them when hidden", () => {
    layer.setVisible(true);
    const [cell] = map.setData.mock.lastCall![0].features;
    expect(layer.cell(cell.properties.id)).toBe(cell);
    layer.setVisible(false);
    expect(layer.cell(cell.properties.id)).toBeUndefined();
  });

  it("shows a pointer over labels only", () => {
    layer.addToMap();
    const hovered = map.on.mock.calls.map(([type, layerId]) => [type, layerId]);
    expect(hovered).toEqual([
      ["mouseenter", "grid-quadkey-label"],
      ["mouseleave", "grid-quadkey-label"],
    ]);
  });
});

describe("gridCellAtPoint", () => {
  it("only queries the label layers of visible grids", () => {
    const map = fakeMap();
    const hidden = new GridLayer(asMap(map), definition("h3"));
    const shown = new GridLayer(asMap(map), definition("quadkey"));
    shown.setVisible(true);
    map.queryRenderedFeatures.mockReturnValue([]);

    expect(
      gridCellAtPoint(asMap(map), [hidden, shown], [1, 2]),
    ).toBeUndefined();
    expect(map.queryRenderedFeatures).toHaveBeenCalledWith([1, 2], {
      layers: ["grid-quadkey-label"],
    });
  });

  it("skips the query when no grid is visible", () => {
    const map = fakeMap();
    expect(
      gridCellAtPoint(
        asMap(map),
        [new GridLayer(asMap(map), definition("h3"))],
        [1, 2],
      ),
    ).toBeUndefined();
    expect(map.queryRenderedFeatures).not.toHaveBeenCalled();
  });

  it("returns the exact cell rather than the rendered, tile-clipped feature", () => {
    const map = fakeMap();
    const layer = new GridLayer(asMap(map), definition("quadkey"));
    layer.setVisible(true);
    const [cell] = map.setData.mock.lastCall![0].features;
    map.queryRenderedFeatures.mockReturnValue([
      {
        layer: { id: "grid-quadkey-label" },
        properties: { id: cell.properties.id },
      },
    ]);

    expect(gridCellAtPoint(asMap(map), [layer], [1, 2])).toEqual({
      layer,
      cell,
    });
  });
});

describe("cellDetails", () => {
  const map = fakeMap();

  it("gives the ID, level and size of the cell clicked", () => {
    const layer = new GridLayer(asMap(map), definition("quadkey"));
    layer.setResolution(12);
    const [cell] = coverBbox([-3.7, 40.4, -3.7, 40.4], 12);
    const rows = cellDetails({ layer, cell })("metric");
    expect(rows.map((row) => row.label)).toEqual([
      "ID",
      "Zoom",
      "Parent",
      "Children (4)",
      "Google tile (Z/X/Y)",
      "TMS tile (Z/X/Y)",
      "Area",
      "Edge length (avg)",
    ]);
    expect(rows[0].value).toBe(cell.properties.id);
    expect(rows[1].value).toBe("12");
    expect(rows[4].value).toBe("12/2005/1544");
    expect(rows[5].value).toBe("12/2005/2551");
    expect(rows[6].value).toMatch(/ km²$/);
  });

  it("has no tile names for H3 and S2 cells", () => {
    const layer = new GridLayer(asMap(map), definition("h3"));
    const cell: GridCellFeature = {
      type: "Feature",
      properties: { id: "8928308280fffff", label: "" },
      geometry: { type: "Polygon", coordinates: [] },
    };
    expect(
      cellDetails({ layer, cell })("metric").map((row) => row.label),
    ).toEqual([
      "ID",
      "ID (integer)",
      "Resolution",
      "Parent",
      "Children (7)",
      "Area",
      "Edge length (avg)",
    ]);
  });

  it("keeps the level of the click, as the layer's moves on with the zoom", () => {
    const layer = new GridLayer(asMap(map), definition("quadkey"));
    layer.setResolution(12);
    const [cell] = coverBbox([-3.7, 40.4, -3.7, 40.4], 12);
    const details = cellDetails({ layer, cell });
    layer.setResolution(14);
    expect(details("imperial")[1].value).toBe("12");
    expect(details("imperial")[7].value).toMatch(/ mi$/);
  });

  it("offers the parent and children, to copy or add to the map as cells", () => {
    const layer = new GridLayer(asMap(map), definition("quadkey"));
    layer.setResolution(3);
    const cell: GridCellFeature = {
      type: "Feature",
      properties: { id: "031", label: "031" },
      geometry: { type: "Polygon", coordinates: [] },
    };
    const [, , parent, children] = cellDetails({ layer, cell })("metric");
    expect(parent).toMatchObject({ value: "03", truncate: true });
    expect(children).toMatchObject({
      label: "Children (4)",
      value: "0310,0311,0312,0313",
      truncate: true,
    });
    expect(parent.features!()).toEqual([
      {
        type: "Feature",
        geometry: cellPolygon("03"),
        properties: { grid: "quadkey", id: "03", zoom: 2 },
      },
    ]);
    expect(children.features!().map((f) => f.properties)).toEqual(
      ["0310", "0311", "0312", "0313"].map((id) => ({
        grid: "quadkey",
        id,
        zoom: 4,
      })),
    );
  });

  it("gives H3 and S2 IDs as integers, signed too when that differs", () => {
    const rows = (grid: "h3" | "s2", id: string) =>
      Object.fromEntries(
        cellDetails({
          layer: new GridLayer(asMap(map), definition(grid)),
          cell: {
            type: "Feature",
            properties: { id, label: "" },
            geometry: { type: "Polygon", coordinates: [] },
          },
        })("metric").map((row) => [row.label, row.value]),
      );

    // H3's own documentation example. Its top bit is never set, so signed is the same.
    expect(rows("h3", "8928308280fffff")).toMatchObject({
      "ID (integer)": "617700169958293503",
    });
    expect(rows("h3", "8928308280fffff")).not.toHaveProperty(
      "ID (signed integer)",
    );

    // An S2 cell on face 4, past 2^63.
    expect(rows("s2", "94")).toMatchObject({
      "ID (integer)": "10664523917613334528",
      "ID (signed integer)": "-7782220156096217088",
    });
    // Long enough to wrap, so kept to one line like the children.
    const integerRows = cellDetails({
      layer: new GridLayer(asMap(map), definition("s2")),
      cell: {
        type: "Feature",
        properties: { id: "94", label: "" },
        geometry: { type: "Polygon", coordinates: [] },
      },
    })("metric").filter((row) => row.label.startsWith("ID ("));
    expect(integerRows.every((row) => row.truncate)).toBe(true);

    // Face 0 fits in a signed integer as is.
    expect(rows("s2", "0d682c")).not.toHaveProperty("ID (signed integer)");
  });

  it("has no parent at the coarsest level, nor children at the finest", () => {
    const layer = new GridLayer(asMap(map), definition("h3"));
    const labels = (id: string) =>
      cellDetails({
        layer,
        cell: {
          type: "Feature",
          properties: { id, label: "" },
          geometry: { type: "Polygon", coordinates: [] },
        },
      })("metric").map((row) => row.label);
    expect(labels("8001fffffffffff")).not.toContain("Parent");
    expect(labels("8f2830828052d25")).not.toContainEqual(
      expect.stringMatching(/^Children/),
    );
  });
});

describe("grid names and icons", () => {
  it("names grids plainly, each with its own cell shape", () => {
    expect(GRID_DEFINITIONS.map((def) => def.label)).toEqual([
      "H3",
      "Quadkey",
      "S2",
      "A5",
    ]);
    const shapes = GRID_DEFINITIONS.map((def) => def.shape);
    expect(new Set(shapes).size).toBe(shapes.length);
    expect(gridIcon(GRID_DEFINITIONS[0])).toMatch(
      /^<svg class="grid-icon"[^>]*><polygon points="[^"]+"\/><\/svg>$/,
    );
  });
});
