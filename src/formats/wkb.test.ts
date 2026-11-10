import { describe, expect, it } from "vitest";
import { withProjections } from "../projection";
import { wkbFeature } from "./wkb";

const geometry = (hex: string) => wkbFeature(hex)?.geometry;

describe("wkbFeature", () => {
  it("reads a little-endian point", () => {
    expect(geometry("0101000000000000000000F03F0000000000000040")).toEqual({
      type: "Point",
      coordinates: [1, 2],
    });
  });

  it("reads a big-endian point", () => {
    expect(geometry("00000000013ff00000000000004000000000000000")).toEqual({
      type: "Point",
      coordinates: [1, 2],
    });
  });

  it("reads PostGIS's EWKB with its SRID, and the bytea and 0x prefixes", () => {
    const hex = "0101000020E6100000FE65F7E461A10DC0857CD0B359354440";
    const expected = { type: "Point", coordinates: [-3.7038, 40.4168] };
    expect(geometry(hex)).toEqual(expected);
    expect(geometry(`\\x${hex}`)).toEqual(expected);
    expect(geometry(`0x${hex}`)).toEqual(expected);
  });

  it("reads a polygon", () => {
    expect(
      geometry(
        "0103000000010000000400000000000000000000000000000000000000000000000000f03f0000000000000000000000000000f03f000000000000f03f00000000000000000000000000000000",
      ),
    ).toEqual({
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 0],
        ],
      ],
    });
  });

  it("reads ISO WKB with Z, multi geometries' parts included", () => {
    expect(
      geometry(
        "01ec0300000200000001e9030000000000000000f03f0000000000000040000000000000084001e9030000000000000000104000000000000014400000000000001840",
      ),
    ).toEqual({
      type: "MultiPoint",
      coordinates: [
        [1, 2, 3],
        [4, 5, 6],
      ],
    });
  });

  it("drops M values", () => {
    expect(
      geometry("0101000040000000000000f03f00000000000000400000000000002240"),
    ).toEqual({ type: "Point", coordinates: [1, 2] });
  });

  it("unprojects Web Mercator", () => {
    expect(
      geometry("0101000020110f000000000000000000000000000000000000"),
    ).toEqual({ type: "Point", coordinates: [0, 0] });
  });

  it("reprojects other SRIDs", async () => {
    const feature = await withProjections(() =>
      wkbFeature("0101000020e66400000000000000db1a410000000024115141"),
    );
    const [lng, lat] = (feature!.geometry as GeoJSON.Point).coordinates;
    expect(lng).toBeCloseTo(-3.7072, 4);
    expect(lat).toBeCloseTo(40.4145, 4);
  });

  it.each([
    ["too short", "0101000000000000000000F03F00000000000000"],
    ["with bytes left over", "0101000000000000000000F03F000000000000004000"],
    ["of an unknown type", "0109000000000000000000F03F0000000000000040"],
    ["with a wrong byte order", "0201000000000000000000F03F0000000000000040"],
    [
      "with a count past its end",
      "0102000000ffffff7f000000000000f03f0000000000000040",
    ],
    ["not hex", "0101000000000000000000F03F000000000000004G"],
  ])("refuses WKB %s", (_, hex) => expect(wkbFeature(hex)).toBeNull());
});
