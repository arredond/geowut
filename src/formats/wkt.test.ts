import { describe, expect, it } from "vitest";
import { UnsupportedDataError } from "../errors";
import { withProjections } from "../projection";
import { parseWkt, toWkt } from "./wkt";

describe("parseWkt", () => {
  it.each([
    ["POINT (1 2)", { type: "Point", coordinates: [1, 2] }],
    ["SRID=4326;POINT(1 2)", { type: "Point", coordinates: [1, 2] }],
    ["SRID=3857;POINT(0 0)", { type: "Point", coordinates: [0, 0] }],
    ["POINTM(1 2 3)", { type: "Point", coordinates: [1, 2] }],
    ["POINT M (1 2 3)", { type: "Point", coordinates: [1, 2] }],
    ["POINT Z (1 2 3)", { type: "Point", coordinates: [1, 2, 3] }],
    ["POINT ZM (1 2 3 4)", { type: "Point", coordinates: [1, 2, 3] }],
  ])("reads %s", (text, geometry) => {
    expect(parseWkt(text)).toEqual(geometry);
  });

  it("reprojects other SRIDs", async () => {
    const point = await withProjections(() =>
      parseWkt("SRID=25830;POINT(440000 4474000)"),
    );
    expect((point as GeoJSON.Point).coordinates[0]).toBeCloseTo(-3.7072, 4);
  });

  it("refuses SRIDs it doesn't know, saying why", async () => {
    await expect(
      withProjections(() => parseWkt("SRID=999999;POINT(1 2)")),
    ).rejects.toThrow(UnsupportedDataError);
  });

  it.each(["not wkt", "POINT EMPTY", "POINT (1 2) and more"])(
    "finds nothing in %s",
    (text) => expect(parseWkt(text)).toBeNull(),
  );
});

describe("toWkt", () => {
  it("spaces out commas", () => {
    expect(
      toWkt({
        type: "LineString",
        coordinates: [
          [0, 0],
          [1, 1],
        ],
      }),
    ).toBe("LINESTRING (0 0, 1 1)");
  });
});
