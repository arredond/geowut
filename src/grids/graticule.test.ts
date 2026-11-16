import { describe, expect, it } from "vitest";
import {
  formatDegrees,
  GRATICULE_STEPS,
  graticuleLines,
  graticuleStep,
  polarLimit,
} from "./graticule";

describe("graticuleStep", () => {
  it("spaces lines widely zoomed out and finely zoomed in", () => {
    expect(graticuleStep(2)).toBe(30);
    expect(graticuleStep(5)).toBe(5);
    expect(graticuleStep(8)).toBe(0.5);
    expect(graticuleStep(14)).toBe(0.01);
  });

  it("stays within its round steps at any zoom", () => {
    expect(graticuleStep(0)).toBe(GRATICULE_STEPS[0]);
    expect(graticuleStep(24)).toBe(GRATICULE_STEPS.at(-1));
  });

  it("only gets finer as the zoom goes up", () => {
    for (let zoom = 0; zoom < 22; zoom += 0.25)
      expect(graticuleStep(zoom + 0.25)).toBeLessThanOrEqual(
        graticuleStep(zoom),
      );
  });
});

describe("formatDegrees", () => {
  it("labels lines as maps do", () => {
    expect(formatDegrees(40, "lat", 10)).toBe("40°N");
    expect(formatDegrees(-30, "lat", 10)).toBe("30°S");
    expect(formatDegrees(-3.5, "lng", 0.5)).toBe("3.5°W");
    expect(formatDegrees(120, "lng", 30)).toBe("120°E");
    expect(formatDegrees(0, "lat", 10)).toBe("0°");
    expect(formatDegrees(180, "lng", 30)).toBe("180°");
  });

  it("writes as many decimals as the spacing has", () => {
    expect(formatDegrees(40.1, "lat", 0.05)).toBe("40.10°N");
  });
});

describe("graticuleLines", () => {
  const values = (
    axis: "lat" | "lng",
    bbox: Parameters<typeof graticuleLines>[0],
    step: number,
  ) =>
    graticuleLines(bbox, step)
      .features.filter((f) => f.properties.axis === axis)
      .map((f) => f.properties.value);

  it("draws round meridians and parallels across the bbox", () => {
    expect(values("lng", [-4.3, 39.8, -2.6, 41.2], 0.5)).toEqual([
      -4, -3.5, -3,
    ]);
    expect(values("lat", [-4.3, 39.8, -2.6, 41.2], 0.5)).toEqual([
      40, 40.5, 41,
    ]);
  });

  it("keeps clear of floating-point drift", () => {
    expect(values("lat", [0, 0.25, 1, 0.35], 0.1)).toEqual([0.3]);
  });

  it("covers the whole world once, up to a closing parallel near each pole", () => {
    const { features } = graticuleLines([-180, -85.05, 180, 85.05], 30);
    const meridians = features.filter((f) => f.properties.axis === "lng");
    expect(meridians.map((f) => f.properties.value)).toEqual([
      -180, -150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150,
    ]);
    const lats = meridians[0].geometry.coordinates.map(([, lat]) => lat);
    expect([lats[0], lats.at(-1)]).toEqual([-80, 80]);
    expect(
      features
        .filter((f) => f.properties.axis === "lat")
        .map((f) => f.properties.value),
    ).toEqual([-80, -60, -30, 0, 30, 60, 80]);
  });

  it("stops at 80° or the last parallel short of 85°", () => {
    expect(polarLimit(30)).toBe(80);
    expect(polarLimit(10)).toBe(80);
    expect(polarLimit(5)).toBe(85);
    expect(polarLimit(2)).toBe(84);
    expect(polarLimit(0.1)).toBe(85);
    expect(polarLimit(0.002)).toBe(85);
    expect(polarLimit(0.05)).toBe(85);
    // Zoomed in past it, there's nothing to draw.
    expect(graticuleLines([10, 85.01, 11, 85.05], 0.001).features).toEqual([]);
  });

  it("names meridians past the antimeridian as they are", () => {
    expect(values("lng", [170, 0, 200, 10], 10)).toEqual([
      170, 180, -170, -160,
    ]);
  });

  it("bends lines with points every few degrees, so they curve on the globe", () => {
    const [parallel] = graticuleLines([-180, -10, 180, 20], 30).features.filter(
      (f) => f.properties.axis === "lat",
    );
    const lngs = parallel.geometry.coordinates.map(([lng]) => lng);
    expect(lngs[0]).toBe(-180);
    expect(lngs.at(-1)).toBe(180);
    for (let i = 1; i < lngs.length; i++)
      expect(lngs[i] - lngs[i - 1]).toBeLessThanOrEqual(2);
  });
});
