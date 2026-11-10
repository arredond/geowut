import { describe, expect, it } from "vitest";
import { geohashBounds, geohashFeature } from "./geohash";

const centre = ([west, south, east, north]: number[]) => [
  (west + east) / 2,
  (south + north) / 2,
];

describe("geohashBounds", () => {
  it("decodes a geohash to its cell", () => {
    const [lng, lat] = centre(geohashBounds("u4pruydqqvj")!);
    expect(lat).toBeCloseTo(57.64911, 4);
    expect(lng).toBeCloseTo(10.40744, 4);
  });

  it("halves the world at the first character", () => {
    expect(geohashBounds("s")).toEqual([0, 0, 45, 45]);
  });

  it("ignores case", () => {
    expect(geohashBounds("EZJMGTWU")).toEqual(geohashBounds("ezjmgtwu"));
  });

  it.each(["", "ezja", "ezji", "ezjl", "ezjo", "ezjmgtwuezjmg"])(
    "refuses %j",
    (text) => expect(geohashBounds(text)).toBeNull(),
  );
});

describe("geohashFeature", () => {
  it("draws the cell with its geohash", () => {
    const feature = geohashFeature("EZJMGTWU", false)!;
    expect(feature.geometry.type).toBe("Polygon");
    expect(feature.properties).toEqual({ geohash: "ezjmgtwu" });
  });

  it("wants two characters unless asked", () => {
    expect(geohashFeature("u", false)).toBeNull();
    expect(geohashFeature("u", true)).not.toBeNull();
  });
});
