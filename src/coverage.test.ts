import * as h3 from "h3-js";
import { describe, expect, it } from "vitest";
import type { LineString, MultiPolygon, Point, Polygon } from "geojson";
import {
  a5Coverage,
  h3Coverage,
  xyzCoverage,
  s2Coverage,
  TooManyCellsError,
} from "./coverage";

const square = (west: number, south: number, size: number): number[][] => [
  [west, south],
  [west + size, south],
  [west + size, south + size],
  [west, south + size],
  [west, south],
];
const polygon: Polygon = {
  type: "Polygon",
  coordinates: [square(-4, 40, 0.1)],
};
const line: LineString = {
  type: "LineString",
  coordinates: [
    [-4, 40],
    [-3.9, 40.1],
  ],
};
const diagonal: LineString = {
  type: "LineString",
  coordinates: [
    [-4, 40],
    [-3.5, 40.5],
  ],
};
/** Madrid to Barcelona: long and thin, so its bbox holds far more cells than it crosses. */
const longLine: LineString = {
  type: "LineString",
  coordinates: [
    [-3.7038, 40.4168],
    [2.1734, 41.3851],
  ],
};

describe("h3Coverage", () => {
  it("finds the cell of a point", () => {
    expect(h3Coverage({ type: "Point", coordinates: [-3.7, 40.4] }, 7)).toEqual(
      [h3.latLngToCell(40.4, -3.7, 7)],
    );
  });

  it("covers a polygon", () => {
    expect(h3Coverage(polygon, 7).length).toBeGreaterThan(10);
  });

  it("includes every cell the polygon touches, not just those whose center it holds", () => {
    const centers = h3.polygonToCells(polygon.coordinates, 7, true);
    const covering = h3Coverage(polygon, 7);
    expect(covering.length).toBeGreaterThan(centers.length);
    expect(covering).toEqual(expect.arrayContaining(centers));
  });

  it("covers a polygon smaller than a cell with the cell it sits in", () => {
    const tiny: Polygon = {
      type: "Polygon",
      coordinates: [square(-3.7, 40.4, 0.001)],
    };
    expect(h3Coverage(tiny, 4)).toEqual([h3.latLngToCell(40.4005, -3.6995, 4)]);
  });

  it("leaves out holes", () => {
    const withHole: Polygon = {
      type: "Polygon",
      coordinates: [square(-4, 40, 1), square(-3.8, 40.2, 0.6)],
    };
    expect(h3Coverage(withHole, 6).length).toBeLessThan(
      h3Coverage({ type: "Polygon", coordinates: [square(-4, 40, 1)] }, 6)
        .length,
    );
  });

  it("covers every part of a MultiPolygon, not the space between them", () => {
    const multi: MultiPolygon = {
      type: "MultiPolygon",
      coordinates: [[square(-4, 40, 0.1)], [square(2, 50, 0.1)]],
    };
    const ids = h3Coverage(multi, 7);
    expect(ids.length).toBe(
      h3Coverage(polygon, 7).length +
        h3Coverage({ type: "Polygon", coordinates: [square(2, 50, 0.1)] }, 7)
          .length,
    );
  });

  it("follows lines, cell to neighboring cell, instead of covering their bbox", () => {
    const cells = h3Coverage(diagonal, 7);
    const [west, south, east] = [-4, 40, -3.5];
    const bboxCells = h3Coverage(
      { type: "Polygon", coordinates: [square(west, south, east - west)] },
      7,
    );
    expect(cells.length).toBeLessThan(bboxCells.length / 5);
    expect(cells).toContain(h3.latLngToCell(40, -4, 7));
    expect(cells).toContain(h3.latLngToCell(40.5, -3.5, 7));
    // No gaps: every cell borders another of the line's.
    expect(
      cells.every((cell) =>
        cells.some(
          (other) => other !== cell && h3.gridDistance(cell, other) === 1,
        ),
      ),
    ).toBe(true);
  });
});

describe("xyzCoverage", () => {
  /** Tile X/Y from a Z/X/Y ID, to check where tiles are. */
  const tileXY = (id: string) => id.split("/").slice(1).map(Number);
  const triangle: Polygon = {
    type: "Polygon",
    coordinates: [
      [
        [-4, 40],
        [-3.5, 40],
        [-4, 40.5],
        [-4, 40],
      ],
    ],
  };

  it("gives Z/X/Y tiles of the requested zoom", () => {
    const keys = xyzCoverage(polygon, 12);
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.every((key) => /^12\/\d+\/\d+$/.test(key))).toBe(true);
  });

  it("finds the tile of a point", () => {
    expect(
      xyzCoverage({ type: "Point", coordinates: [-3.7, 40.4] }, 12),
    ).toEqual(
      xyzCoverage(
        { type: "Polygon", coordinates: [square(-3.7, 40.4, 1e-6)] },
        12,
      ),
    );
  });

  it("follows lines, tile to touching tile, instead of covering their bbox", () => {
    const keys = xyzCoverage(diagonal, 12);
    const bboxKeys = xyzCoverage(
      { type: "Polygon", coordinates: [square(-4, 40, 0.5)] },
      12,
    );
    expect(keys.length).toBeLessThan(bboxKeys.length / 3);
    const tiles = keys.map(tileXY);
    const touching = ([x, y]: number[], [ox, oy]: number[]) =>
      Math.abs(x - ox) + Math.abs(y - oy) === 1;
    expect(
      tiles.every((tile) => tiles.some((other) => touching(tile, other))),
    ).toBe(true);
  });

  it("leaves out the tiles of a triangle's bbox that the triangle misses", () => {
    const keys = xyzCoverage(triangle, 10);
    const bboxKeys = xyzCoverage(
      { type: "Polygon", coordinates: [square(-4, 40, 0.5)] },
      10,
    );
    expect(keys.length).toBeLessThan(bboxKeys.length);
    // The north-east corner of the bbox is off the triangle; its south-west corner is on it.
    expect(keys).not.toContain(
      xyzCoverage({ type: "Point", coordinates: [-3.51, 40.49] }, 10)[0],
    );
    expect(keys).toContain(
      xyzCoverage({ type: "Point", coordinates: [-3.99, 40.01] }, 10)[0],
    );
  });

  it("fills the inside of a polygon, not just its outline", () => {
    const keys = xyzCoverage(
      { type: "Polygon", coordinates: [square(-4, 40, 1)] },
      12,
    );
    expect(keys).toContain(
      xyzCoverage({ type: "Point", coordinates: [-3.5, 40.5] }, 12)[0],
    );
  });

  it("leaves out tiles inside a hole", () => {
    const withHole: Polygon = {
      type: "Polygon",
      coordinates: [square(-4, 40, 1), square(-3.8, 40.2, 0.6)],
    };
    const keys = xyzCoverage(withHole, 12);
    expect(keys).not.toContain(
      xyzCoverage({ type: "Point", coordinates: [-3.5, 40.5] }, 12)[0],
    );
    expect(keys).toContain(
      xyzCoverage({ type: "Point", coordinates: [-3.9, 40.5] }, 12)[0],
    );
  });

  it("covers a polygon smaller than a tile with the tile it sits in", () => {
    const tiny: Polygon = {
      type: "Polygon",
      coordinates: [square(-3.7, 40.4, 0.001)],
    };
    expect(xyzCoverage(tiny, 8)).toEqual(
      xyzCoverage({ type: "Point", coordinates: [-3.6995, 40.4005] }, 8),
    );
  });
});

describe("s2Coverage", () => {
  it("covers polygons and lines", () => {
    expect(s2Coverage(polygon, 10).length).toBeGreaterThan(0);
    expect(s2Coverage(line, 10).length).toBeGreaterThan(0);
  });

  it("covers a point", () => {
    expect(
      s2Coverage({ type: "Point", coordinates: [-3.7, 40.4] }, 10),
    ).toHaveLength(1);
  });

  it("covers freehand shapes, which repeat their first vertex", () => {
    // As Terra Draw's freehand mode draws them, which S2 alone would cover with nothing.
    const freehand: Polygon = {
      type: "Polygon",
      coordinates: [
        [
          [-3.109863281, 40.021036797],
          [-3.109863281, 40.021036797],
          [-3.109863281, 40.021036797],
          [-3.210557766, 39.978538396],
          [-3.259538759, 40.004411537],
          [-3.225438327, 40.041774625],
          [-3.109863281, 40.021036797],
        ],
      ],
    };
    expect(s2Coverage(freehand, 8)).toEqual(["0d427"]);
    expect(s2Coverage(freehand, 13).length).toBeGreaterThan(10);
  });

  it("covers a MultiPolygon", () => {
    const multi: MultiPolygon = {
      type: "MultiPolygon",
      coordinates: [[square(-4, 40, 0.1)], [square(2, 50, 0.1)]],
    };
    expect(s2Coverage(multi, 10).length).toBeGreaterThan(0);
  });
});

describe("a5Coverage", () => {
  it("covers points, lines and polygons, without repeats", () => {
    const point: Point = { type: "Point", coordinates: [-3.95, 40.05] };
    const cells = a5Coverage(
      {
        type: "GeometryCollection",
        geometries: [point, line, polygon],
      },
      10,
    );
    expect(new Set(cells).size).toBe(cells.length);
    expect(cells).toEqual(expect.arrayContaining(a5Coverage(point, 10)));
    expect(cells).toEqual(expect.arrayContaining(a5Coverage(line, 10)));
    expect(cells.length).toBeGreaterThan(a5Coverage(polygon, 10).length - 1);
  });

  it("covers a polygon with every cell it touches", () => {
    // A cell's worth of polygon, with no cell center inside, still gets the cells under it.
    const tiny: Polygon = {
      type: "Polygon",
      coordinates: [square(-3.70001, 40.40001, 0.00002)],
    };
    expect(a5Coverage(tiny, 8)).toHaveLength(1);
  });
});

describe("oversized coverings", () => {
  it("refuses them instead of hanging the page", () => {
    expect(() => h3Coverage(polygon, 15)).toThrow(TooManyCellsError);
    expect(() => xyzCoverage(polygon, 23)).toThrow(TooManyCellsError);
    expect(() => s2Coverage(polygon, 24)).toThrow(TooManyCellsError);
    expect(() => a5Coverage(polygon, 30)).toThrow(TooManyCellsError);
  });

  it("judges lines by their length, not their bbox", () => {
    expect(h3Coverage(longLine, 10).length).toBeGreaterThan(1000);
    expect(xyzCoverage(longLine, 18).length).toBeGreaterThan(1000);
    expect(s2Coverage(longLine, 15).length).toBeGreaterThan(100);
  });

  it("still refuses lines too long for the resolution", () => {
    expect(() => h3Coverage(longLine, 14)).toThrow(TooManyCellsError);
    expect(() => xyzCoverage(longLine, 23)).toThrow(TooManyCellsError);
  });

  it("still answers for points at the finest resolution", () => {
    const point: Point = { type: "Point", coordinates: [-3.7, 40.4] };
    expect(h3Coverage(point, 15)).toHaveLength(1);
    expect(xyzCoverage(point, 23)).toHaveLength(1);
    expect(s2Coverage(point, 24)).toHaveLength(1);
    expect(a5Coverage(point, 30)).toHaveLength(1);
  });
});
