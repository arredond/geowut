import { describe, expect, it } from "vitest";
import { curveLines, hilbertIndex } from "./curve";
import * as a5Grid from "./a5";
import * as s2Grid from "./s2";
import * as xyzGrid from "./xyz";

describe("hilbertIndex", () => {
  it("runs from the top left tile down, across and up to the top right, as PMTiles has it", () => {
    expect(
      [
        [0, 0],
        [0, 1],
        [1, 1],
        [1, 0],
      ].map(([x, y]) => hilbertIndex(x, y, 1)),
    ).toEqual([0n, 1n, 2n, 3n]);
  });

  it("numbers every tile of a zoom once, each next to the one before", () => {
    const z = 4;
    const n = 2 ** z;
    const byIndex = new Map<bigint, [number, number]>();
    for (let x = 0; x < n; x++)
      for (let y = 0; y < n; y++) byIndex.set(hilbertIndex(x, y, z), [x, y]);
    expect(byIndex.size).toBe(n * n);
    for (let d = 1n; d < BigInt(n * n); d++) {
      const [ax, ay] = byIndex.get(d - 1n)!;
      const [bx, by] = byIndex.get(d)!;
      expect(Math.abs(ax - bx) + Math.abs(ay - by)).toBe(1);
    }
  });

  it("keeps exact indices at the deepest zoom", () => {
    const n = 2 ** 23;
    expect(hilbertIndex(n - 1, 0, 23)).toBe(BigInt(n) * BigInt(n) - 1n);
  });
});

describe("curveLines", () => {
  const stop = (index: number, lng: number, lat = 0) => ({
    index: BigInt(index),
    center: [lng, lat],
  });

  it("joins the cells in curve order, whatever order they come in", () => {
    const { features } = curveLines([stop(2, 20), stop(0, 0), stop(1, 10)]);
    expect(features.map((f) => f.geometry.coordinates)).toEqual([
      [
        [0, 0],
        [10, 0],
        [20, 0],
      ],
    ]);
  });

  it("breaks where cells in between are missing, dropping lone cells", () => {
    const { features } = curveLines([
      stop(0, 0),
      stop(1, 1),
      stop(5, 5),
      stop(9, 9),
      stop(10, 10),
    ]);
    expect(features.map((f) => f.geometry.coordinates)).toEqual([
      [
        [0, 0],
        [1, 0],
      ],
      [
        [9, 0],
        [10, 0],
      ],
    ]);
  });

  it("steps over the antimeridian rather than across the world", () => {
    const { features } = curveLines([stop(0, 179), stop(1, -179)]);
    expect(features[0].geometry.coordinates).toEqual([
      [179, 0],
      [181, 0],
    ]);
  });
});

describe("the grids' curves", () => {
  it("number an XYZ tile's children one after another", () => {
    const indices = xyzGrid
      .childCells("3/2/5")
      .map(xyzGrid.tileCurveIndex)
      .sort((a, b) => Number(a - b));
    expect(indices[3] - indices[0]).toBe(3n);
    expect(xyzGrid.tileCenter("1/0/0")[0]).toBe(-90);
  });

  it("number an S2 cell's children one after another, from its own place", () => {
    const parent = "89c25";
    const children = s2Grid.childCells(parent).map(s2Grid.cellCurveIndex);
    expect(children).toEqual(
      [0n, 1n, 2n, 3n].map((i) => s2Grid.cellCurveIndex(parent) * 4n + i),
    );
  });

  it("number an A5 cell's children one after another, from its own place", () => {
    const parent = a5Grid.pointCell([-3.7, 40.4], 6);
    const children = a5Grid
      .childCells(parent)
      .map(a5Grid.cellCurveIndex)
      .sort((a, b) => Number(a - b));
    expect(children).toEqual(
      [0n, 1n, 2n, 3n].map((i) => a5Grid.cellCurveIndex(parent) * 4n + i),
    );
  });

  it("put each cell's middle inside it", () => {
    const [lng, lat] = s2Grid.cellCenter("89c25");
    expect(lng).toBeCloseTo(-73.9, 0);
    expect(lat).toBeCloseTo(40.7, 0);
    const [aLng, aLat] = a5Grid.cellCenter(a5Grid.pointCell([-3.7, 40.4], 12));
    expect(aLng).toBeCloseTo(-3.7, 1);
    expect(aLat).toBeCloseTo(40.4, 1);
  });
});
