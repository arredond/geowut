import { describe, expect, it } from "vitest";
import {
  boxStats,
  cellPolygon,
  cellStats,
  coverBbox,
  estimateCells,
  levelStats,
  MAX_ZOOM,
  MIN_ZOOM,
  quadkeyToTileId,
  resolutionForZoom,
  tileIdBounds,
  tileQuadkey,
  tileToQuadkey,
  tmsTileId,
} from "./xyz";

describe("tileToQuadkey", () => {
  it("matches the Bing Maps documentation example", () => {
    expect(tileToQuadkey(3, 5, 3)).toBe("213");
  });

  it("is empty at zoom 0", () => {
    expect(tileToQuadkey(0, 0, 0)).toBe("");
  });

  it("converts to and from Z/X/Y", () => {
    expect(quadkeyToTileId("213")).toBe("3/3/5");
    expect(tileQuadkey("3/3/5")).toBe("213");
    expect(quadkeyToTileId(tileQuadkey("12/2005/1544"))).toBe("12/2005/1544");
  });
});

describe("coverBbox", () => {
  const [tile] = coverBbox([-3.7, 40.4, -3.7, 40.4], 12);

  it("finds the tile containing a point, by its Z/X/Y", () => {
    const { properties } = tile;
    expect(properties.id).toBe("12/2005/1544");
    expect(properties.label).toBe("12/2005/1544");
    const [west, south, east, north] = [
      tile.geometry.coordinates[0][0][0],
      tile.geometry.coordinates[0][0][1],
      tile.geometry.coordinates[0][2][0],
      tile.geometry.coordinates[0][2][1],
    ];
    expect(west).toBeLessThanOrEqual(-3.7);
    expect(east).toBeGreaterThanOrEqual(-3.7);
    expect(south).toBeLessThanOrEqual(40.4);
    expect(north).toBeGreaterThanOrEqual(40.4);
  });

  it("flips only Y between XYZ and TMS identifiers", () => {
    expect(tmsTileId(tile.properties.id)).toBe(`12/2005/${2 ** 12 - 1 - 1544}`);
    expect(tmsTileId("1/0/0")).toBe("1/0/1");
    expect(tmsTileId("1/1/1")).toBe("1/1/0");
  });

  it("has a single tile at zoom 0", () => {
    expect(
      coverBbox([-179, -85, 179, 85], 0).map((f) => f.properties.id),
    ).toEqual(["0/0/0"]);
  });

  it("never leaves the tile matrix", () => {
    expect(coverBbox([-180, -85, 180, 85], 2)).toHaveLength(16);
  });
});

describe("estimateCells", () => {
  it("is exact", () => {
    const bbox: [number, number, number, number] = [-4, 40, -3, 41];
    expect(estimateCells(bbox, 11)).toBe(coverBbox(bbox, 11).length);
  });
});

describe("resolutionForZoom", () => {
  it("goes two zooms above the map, for tiles the size of H3 and S2 cells", () => {
    expect(resolutionForZoom(10)).toBe(12);
  });

  it("stays in range", () => {
    expect(resolutionForZoom(-3)).toBe(MIN_ZOOM);
    expect(resolutionForZoom(40)).toBe(MAX_ZOOM);
  });
});

describe("cell sizes", () => {
  it("gives tiles on the equator for each zoom, halving each time", () => {
    expect(levelStats(0).edgeKm).toBeCloseTo(40030, -1);
    expect(levelStats(10).edgeKm).toBeCloseTo(levelStats(0).edgeKm / 1024, 6);
    expect(levelStats(10).areaKm2).toBeCloseTo(levelStats(10).edgeKm ** 2, 6);
  });

  it("finds a tile's bounds from its ID", () => {
    const [cell] = coverBbox([-3.01, 40, -3, 40.01], 12);
    const [[w, s], , [e, n]] = cell.geometry.coordinates[0];
    expect(tileIdBounds(cell.properties.id)).toEqual([w, s, e, n]);
  });

  it("measures tiles near the equator as the table does", () => {
    const { areaKm2, edgeKm } = cellStats("10/512/511");
    expect(edgeKm / levelStats(10).edgeKm).toBeCloseTo(1, 3);
    expect(areaKm2 / levelStats(10).areaKm2).toBeCloseTo(1, 2);
  });

  it("shrinks tiles with the cosine of latitude", () => {
    const at60 = boxStats([0, 59.99, 0.02, 60.01]);
    const at0 = boxStats([0, -0.01, 0.02, 0.01]);
    // Sides along the meridians don't shrink, so only the width halves.
    expect(at60.areaKm2 / at0.areaKm2).toBeCloseTo(0.5, 3);
  });
});

describe("cellPolygon", () => {
  it("outlines the tile as the grid layer draws it", () => {
    const [cell] = coverBbox([-3.7, 40.4, -3.7, 40.4], 12);
    expect(cellPolygon(cell.properties.id)).toEqual(cell.geometry);
  });
});

describe("parentCell and childCells", async () => {
  const { parentCell, childCells } = await import("./xyz");

  it("halves or doubles the column and row, nesting as quadkeys do", () => {
    expect(parentCell("4/5/3")).toBe("3/2/1");
    expect(childCells("3/2/1")).toEqual(["4/4/2", "4/5/2", "4/4/3", "4/5/3"]);
    expect(childCells("3/2/1").map(tileQuadkey)).toEqual(
      ["0", "1", "2", "3"].map((digit) => tileQuadkey("3/2/1") + digit),
    );
  });

  it("stops at zoom 0 and 23", () => {
    expect(parentCell("1/0/1")).toBe("0/0/0");
    expect(parentCell("0/0/0")).toBeNull();
    expect(childCells("23/0/0")).toEqual([]);
  });
});
