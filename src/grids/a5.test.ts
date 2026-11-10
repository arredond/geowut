import * as a5 from "a5-js";
import { describe, expect, it } from "vitest";
import {
  cellInteger,
  cellPolygon,
  cellStats,
  childCells,
  coverBbox,
  estimateCells,
  levelStats,
  lineCells,
  parentCell,
  pointCell,
  polygonCells,
  resolutionForZoom,
} from "./a5";
import * as s2Grid from "./s2";
import type { Bbox } from "./types";

const MADRID: [number, number] = [-3.7, 40.4];
const madrid10 = pointCell(MADRID, 10);

describe("resolutionForZoom", () => {
  it("keeps cells about the size of S2's at the same zoom", () => {
    for (const zoom of [4, 8, 12, 16]) {
      const ratio =
        levelStats(resolutionForZoom(zoom)).areaKm2 /
        s2Grid.levelStats(s2Grid.resolutionForZoom(zoom)).areaKm2;
      expect(ratio).toBeGreaterThan(0.5);
      expect(ratio).toBeLessThan(2);
    }
  });

  it("stays within A5's resolutions", () => {
    expect(resolutionForZoom(0)).toBe(0);
    expect(resolutionForZoom(40)).toBe(30);
  });
});

describe("cells", () => {
  it("uses A5's hex IDs", () => {
    expect(madrid10).toBe("51ad118000000000");
    expect(cellInteger(madrid10)).toBe(0x51ad118000000000n);
  });

  it("draws a closed pentagon around its center", () => {
    const [ring] = cellPolygon(madrid10).coordinates;
    expect(ring[0]).toEqual(ring.at(-1));
    expect(ring.length).toBeGreaterThanOrEqual(6);
    const lngs = ring.map(([lng]) => lng);
    const lats = ring.map(([, lat]) => lat);
    expect(Math.min(...lngs)).toBeLessThan(MADRID[0]);
    expect(Math.max(...lngs)).toBeGreaterThan(MADRID[0]);
    expect(Math.min(...lats)).toBeLessThan(MADRID[1]);
    expect(Math.max(...lats)).toBeGreaterThan(MADRID[1]);
  });

  it("measures exactly the area of every cell of its resolution", () => {
    const { areaKm2, edgeKm } = cellStats(madrid10);
    expect(areaKm2).toBe(levelStats(10).areaKm2);
    // Edges vary by about ±10% around A5's average.
    expect(edgeKm / levelStats(10).edgeKm).toBeGreaterThan(0.85);
    expect(edgeKm / levelStats(10).edgeKm).toBeLessThan(1.15);
  });
});

describe("parentCell and childCells", () => {
  it("goes one resolution up and down", () => {
    const parent = parentCell(madrid10)!;
    expect(a5.getResolution(a5.hexToU64(parent))).toBe(9);
    expect(childCells(parent)).toContain(madrid10);
    const children = childCells(madrid10);
    expect(children).toHaveLength(4);
    expect(children.every((child) => parentCell(child) === madrid10)).toBe(
      true,
    );
  });

  it("has 5 children under resolution 0, and stops at the ends", () => {
    const res0 = a5.u64ToHex(a5.getRes0Cells()[0]);
    expect(parentCell(res0)).toBeNull();
    expect(childCells(res0)).toHaveLength(5);
    expect(childCells(pointCell(MADRID, 30))).toEqual([]);
  });
});

describe("coverBbox", () => {
  it("covers the bbox, center cell included", () => {
    const bbox: Bbox = [-3.8, 40.3, -3.6, 40.5];
    const ids = coverBbox(bbox, 10).map((cell) => cell.properties.id);
    expect(ids).toContain(madrid10);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.length).toBeLessThan(estimateCells(bbox, 10) * 4 + 10);
  });

  it("covers the whole world, either side of the antimeridian", () => {
    const ids = coverBbox([-180, -85, 180, 85], 1).map(
      (cell) => cell.properties.id,
    );
    expect(ids).toContain(pointCell([179.9, 0], 1));
    expect(ids).toContain(pointCell([-179.9, 0], 1));
    expect(ids).toContain(pointCell(MADRID, 1));
  });
});

describe("coverings", () => {
  it("covers polygons by every cell they touch", () => {
    const square = [
      [-3.71, 40.39],
      [-3.69, 40.39],
      [-3.69, 40.41],
      [-3.71, 40.41],
      [-3.71, 40.39],
    ];
    expect(polygonCells([square], 10)).toContain(madrid10);
  });

  it("covers lines along their length", () => {
    const cells = lineCells(
      [
        [-3.7, 40.4],
        [2.17, 41.39],
      ],
      8,
    );
    expect(cells[0]).toBe(pointCell([-3.7, 40.4], 8));
    expect(cells.at(-1)).toBe(pointCell([2.17, 41.39], 8));
  });
});
