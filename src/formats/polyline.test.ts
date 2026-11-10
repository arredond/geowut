import { describe, expect, it } from "vitest";
import { decodePolyline, polylineFeature } from "./polyline";

// Google's documented example.
const GOOGLE = "_p~iF~ps|U_ulLnnqC_mqNvxq`@";
const GOOGLE_LINE = [
  [-120.2, 38.5],
  [-120.95, 40.7],
  [-126.453, 43.252],
];

describe("decodePolyline", () => {
  it("decodes Google's example", () => {
    expect(decodePolyline(GOOGLE, 5)).toEqual(GOOGLE_LINE);
  });

  it("refuses a polyline cut short", () => {
    expect(decodePolyline(GOOGLE.slice(0, -1), 5)).toBeNull();
  });

  it("refuses characters out of range", () => {
    expect(decodePolyline("_p~iF ~ps|U", 5)).toBeNull();
  });
});

describe("polylineFeature", () => {
  it("draws a line", () => {
    expect(polylineFeature(GOOGLE)!.geometry).toEqual({
      type: "LineString",
      coordinates: GOOGLE_LINE,
    });
  });

  it("falls back to precision 6 when 5 lands off the globe", () => {
    // Google's example at precision 6, as Valhalla would write it.
    const valhalla = "_izlhA~rlgdF_{geC~ywl@_kwzCn`{nI";
    const coordinates = (
      polylineFeature(valhalla)!.geometry as GeoJSON.LineString
    ).coordinates;
    coordinates.forEach((position, i) =>
      expect(position[1]).toBeCloseTo(GOOGLE_LINE[i][1], 6),
    );
  });

  it("reads the precision it is told", () => {
    const line = polylineFeature(GOOGLE, 6)!.geometry as GeoJSON.LineString;
    expect(line.coordinates[0]).toEqual([-12.02, 3.85]);
  });

  it("unquotes and unescapes a polyline copied out of JSON", () => {
    const escaped = '"o}|tE~\\\\_vO"';
    expect(polylineFeature(escaped, 5)).toEqual(
      polylineFeature("o}|tE~\\_vO", 5),
    );
  });

  it.each(["hello", "Paris", "HELLOW", "??"])(
    "doesn't take %s for a polyline",
    (text) => expect(polylineFeature(text)).toBeNull(),
  );
});
