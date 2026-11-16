import { describe, expect, it } from "vitest";
import { MercatorCoordinate, Point } from "maplibre-gl";
import type { Map as MapLibreMap } from "maplibre-gl";
import { nearestOnLine, tracedSegment } from "./renderedLine";

describe("tracedSegment", () => {
  it("leaves short segments as they are", () => {
    expect(tracedSegment([0, 0], [0.5, 0.5])).toEqual([
      [0, 0],
      [0.5, 0.5],
    ]);
  });

  it("traces long ones straight in Web Mercator, as MapLibre draws them", () => {
    const traced = tracedSegment([-60, 0], [60, 80]);
    expect(traced[0]).toEqual([-60, 0]);
    expect(traced.at(-1)![0]).toBeCloseTo(60);
    expect(traced.at(-1)![1]).toBeCloseTo(80);
    // Halfway along in Mercator: longitude halfway, latitude well past halfway.
    const middle = traced[traced.length >> 1];
    expect(middle[0]).toBeCloseTo(0);
    const y = (lat: number) => MercatorCoordinate.fromLngLat([0, lat]).y;
    expect(y(middle[1])).toBeCloseTo((y(0) + y(80)) / 2);
    expect(middle[1]).toBeGreaterThan(55);
  });

  it("keeps to the side a segment is drawn on, past the antimeridian", () => {
    const traced = tracedSegment([170, 0], [190, 0]);
    expect(traced.every(([lng]) => lng >= 170 && lng <= 190)).toBe(true);
  });

  it("caps the points a segment gets", () => {
    expect(tracedSegment([-180, -80], [180, 80]).length).toBeLessThanOrEqual(
      65,
    );
  });
});

/** A flat map whose screen is its degrees: x is longitude, y latitude. */
const flatMap = {
  getProjection: () => ({ type: "mercator" }),
  project: ([lng, lat]: [number, number]) => new Point(lng, lat),
  unproject: ({ x, y }: Point) => ({ lng: x, lat: y }),
} as unknown as MapLibreMap;

describe("nearestOnLine", () => {
  it("finds the nearest spot along any of its segments, and how far it is", () => {
    const nearest = nearestOnLine(
      flatMap,
      [
        [0, 0],
        [0.5, 0],
        [0.5, 0.5],
      ],
      new Point(0.7, 0.3),
    )!;
    expect(nearest.point.x).toBeCloseTo(0.5);
    expect(nearest.point.y).toBeCloseTo(0.3);
    expect(nearest.distance).toBeCloseTo(0.2);
  });

  it("skips stretches hidden behind the globe", () => {
    // Everything east of 0.25° is round the back: it comes back as somewhere else.
    const globe = {
      ...flatMap,
      getProjection: () => ({ type: "globe" }),
      unproject: ({ x, y }: Point) => ({ lng: x > 0.25 ? x - 1 : x, lat: y }),
    } as unknown as MapLibreMap;
    const line = [
      [0, 0],
      [0.2, 0],
      [0.5, 0],
    ];
    expect(nearestOnLine(globe, line, new Point(0.5, 0))!.point.x).toBeCloseTo(
      0.2,
    );
    expect(
      nearestOnLine(
        globe,
        [
          [0.4, 0],
          [0.5, 0],
        ],
        new Point(0, 0),
      ),
    ).toBeNull();
  });
});
