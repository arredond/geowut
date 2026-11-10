import { describe, expect, it } from "vitest";
import type { GeoJSONStoreFeatures } from "terra-draw";
import { extrusionFeatures } from "./extrusion";

const square = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 0],
];
const flat = { type: "Polygon" as const, coordinates: [square] };

/** A shape as the map holds it: 2D, with its own Z range alongside, if it had Z. */
const shape = (
  geometry: GeoJSONStoreFeatures["geometry"],
  zRange?: [number, number],
) =>
  ({
    type: "Feature",
    geometry,
    properties: { mode: "polygon", ...(zRange && { zRange }) },
  }) as unknown as GeoJSONStoreFeatures;

describe("extrusionFeatures", () => {
  it("raises polygons with Z to their highest, from the shape as the map holds it", () => {
    expect(extrusionFeatures([shape(flat, [10, 20])])).toEqual([
      { type: "Feature", geometry: flat, properties: { height: 20 } },
    ]);
  });

  it("leaves out polygons without Z, below the ground, and anything else", () => {
    expect(
      extrusionFeatures([
        shape(flat),
        shape(flat, [-5, -5]),
        shape({ type: "LineString", coordinates: square }, [1, 4]),
      ]),
    ).toEqual([]);
  });
});
