import { describe, expect, it } from "vitest";
import { UnsupportedDataError } from "../errors";
import { plusCodeBounds, plusCodeFeature } from "./plusCode";

describe("plusCodeBounds", () => {
  // Test vectors from Open Location Code's test_data/decoding.csv: south, west, north, east.
  it.each([
    ["7FG49Q00+", [20.35, 2.75, 20.4, 2.8]],
    ["7FG49QCJ+2V", [20.37, 2.782125, 20.370125, 2.78225]],
    ["7FG49QCJ+2VX", [20.3701, 2.78221875, 20.370125, 2.78225]],
    ["7FG49QCJ+2VXGJ", [20.370113, 2.782234375, 20.370114, 2.78223632813]],
    ["4VCPPQGP+Q9", [-41.273125, 174.785875, -41.273, 174.786]],
    ["62G20000+", [0, -180, 1, -179]],
    ["CFX3X2X2+X2", [89.999875, 1, 90, 1.000125]],
    ["84000000+", [30, -140, 50, -120]],
    // Digits past the fifteenth add nothing.
    [
      "849VGJQF+VX7QR3J7QR3J",
      [37.53966912, -122.3750698242, 37.53966916, -122.3750697021],
    ],
  ])("decodes %s", (code, [south, west, north, east]) => {
    const bounds = plusCodeBounds(code)!;
    [west, south, east, north].forEach((value, i) =>
      expect(bounds[i]).toBeCloseTo(value, 8),
    );
  });

  it.each([
    "8FVC9G8F", // no separator
    "8FVC9G8F+6", // one character after it
    "8FVC9G00+6X", // padding, then more
    "8FVC9G0F+", // padding not at the end
    "8FVC9G8+6X", // the separator out of place
    "XFVC9G8F+6X", // past the pole
    "8FVC9G8F+6A", // not in the alphabet
  ])("refuses %s", (code) => expect(plusCodeBounds(code)).toBeNull());
});

describe("plusCodeFeature", () => {
  it("draws the area with its code", () => {
    expect(plusCodeFeature("8fvc9g8f+6x")!.properties).toEqual({
      plusCode: "8FVC9G8F+6X",
    });
  });

  it("explains that short codes need a place", () => {
    expect(() => plusCodeFeature("9G8F+6X")).toThrow(UnsupportedDataError);
  });

  it("ignores what isn't a plus code", () => {
    expect(plusCodeFeature("ezjmgtwu")).toBeNull();
  });
});
