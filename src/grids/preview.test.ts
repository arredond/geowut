import { describe, expect, it, vi } from "vitest";
import type { Map as MapLibreMap } from "maplibre-gl";
import { CoveragePreview } from "./preview";
import { GRID_DEFINITIONS } from ".";

describe("CoveragePreview", () => {
  const fakeMap = () => {
    const setData = vi.fn();
    const map = {
      addSource: vi.fn(),
      addLayer: vi.fn(),
      getSource: () => ({ setData }),
      setData,
    };
    return map;
  };

  it("keeps its layers through basemap changes, as a grid layer", () => {
    const map = fakeMap();
    new CoveragePreview(map as unknown as MapLibreMap).addToMap();
    expect(map.addSource.mock.calls[0][0]).toMatch(/^grid-/);
    expect(map.addLayer.mock.calls.map(([layer]) => layer.id)).toEqual([
      "grid-preview-fill",
      "grid-preview-line",
    ]);
  });

  it("draws each grid's cells in that grid's color", () => {
    const map = fakeMap();
    new CoveragePreview(map as unknown as MapLibreMap).show({
      xyz: ["1/0/0", "1/1/0"],
      s2: ["0d4228a4"],
    });
    const { features } = map.setData.mock.lastCall![0];
    const color = (id: string) =>
      GRID_DEFINITIONS.find((def) => def.id === id)!.color;
    expect(
      features.map(
        (f: { properties: { color: string } }) => f.properties.color,
      ),
    ).toEqual([color("xyz"), color("xyz"), color("s2")]);
    expect(features[0].geometry.type).toBe("Polygon");
  });

  it("draws nothing for no cells", () => {
    const map = fakeMap();
    new CoveragePreview(map as unknown as MapLibreMap).show({});
    expect(map.setData).toHaveBeenLastCalledWith({
      type: "FeatureCollection",
      features: [],
    });
  });
});
