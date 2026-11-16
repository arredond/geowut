import { describe, expect, it, vi } from "vitest";
import type { Map } from "maplibre-gl";
import {
  Starfield,
  STARFIELD_ID,
  STARFIELD_MAX_ZOOM,
  subsolarPoint,
} from "./starfield";

vi.mock("@geoql/maplibre-gl-starfield", () => ({
  MaplibreStarfieldLayer: class {
    id: string;
    options: Record<string, unknown>;
    constructor(options: { id: string }) {
      this.id = options.id;
      this.options = options;
    }
    setSunPosition = vi.fn();
  },
}));

/** Just enough of a map: a layer list, a style that may still be loading, and style.load. */
function fakeMap() {
  const layers: string[] = ["background", "water"];
  let onStyleLoad = () => {};
  const map = {
    styleLoading: false,
    layers,
    on: (_: string, listener: () => void) => {
      onStyleLoad = listener;
    },
    getLayer: (id: string) => (layers.includes(id) ? { id } : undefined),
    getStyle: () => ({ layers: layers.map((id) => ({ id })) }),
    addLayer: vi.fn((layer: { id: string }, before?: string) => {
      if (map.styleLoading) throw new Error("Style is not done loading");
      layers.splice(
        before ? layers.indexOf(before) : layers.length,
        0,
        layer.id,
      );
    }),
    removeLayer: (id: string) => layers.splice(layers.indexOf(id), 1),
    setLayerZoomRange: vi.fn(),
    /** A new basemap: custom layers go with the old style. */
    swapStyle: () => {
      layers.splice(0, layers.length, "background", "land");
      onStyleLoad();
    },
  };
  return map;
}

const settle = () => new Promise((resolve) => setTimeout(resolve));

describe("Starfield", () => {
  it("goes beneath everything when on, up to where the globe flattens", async () => {
    const map = fakeMap();
    new Starfield(map as unknown as Map).setEnabled(true);
    await settle();
    expect(map.layers).toEqual([STARFIELD_ID, "background", "water"]);
    expect(map.setLayerZoomRange).toHaveBeenCalledWith(
      STARFIELD_ID,
      0,
      STARFIELD_MAX_ZOOM,
    );
  });

  it("comes off when turned off", async () => {
    const map = fakeMap();
    const starfield = new Starfield(map as unknown as Map);
    starfield.setEnabled(true);
    await settle();
    starfield.setEnabled(false);
    await settle();
    expect(map.layers).not.toContain(STARFIELD_ID);
  });

  it("comes back with each new basemap, once", async () => {
    const map = fakeMap();
    new Starfield(map as unknown as Map).setEnabled(true);
    await settle();
    map.swapStyle();
    await settle();
    expect(map.layers).toEqual([STARFIELD_ID, "background", "land"]);
  });

  it("waits for a style still loading", async () => {
    const map = fakeMap();
    map.styleLoading = true;
    new Starfield(map as unknown as Map).setEnabled(true);
    await settle();
    expect(map.layers).not.toContain(STARFIELD_ID);
    map.styleLoading = false;
    map.swapStyle();
    await settle();
    expect(map.layers[0]).toBe(STARFIELD_ID);
  });

  it("stays off when off, basemap swaps and all", async () => {
    const map = fakeMap();
    new Starfield(map as unknown as Map);
    map.swapStyle();
    await settle();
    expect(map.addLayer).not.toHaveBeenCalled();
  });
});

describe("subsolarPoint", () => {
  it("is over the equator at an equinox, and the tropic at a solstice", () => {
    // March equinox 2026, 14:46 UTC; June solstice 2026, 08:24 UTC.
    expect(subsolarPoint(new Date("2026-03-20T14:46Z")).lat).toBeCloseTo(0, 1);
    expect(subsolarPoint(new Date("2026-06-21T08:24Z")).lat).toBeCloseTo(
      23.44,
      1,
    );
  });

  it("is at solar noon's longitude, off Greenwich by the equation of time", () => {
    // Mid-April the sun keeps clock time; early November it's 16.4 minutes ahead, so by
    // 12:00 UTC it has passed Greenwich, 4.1° to the west.
    expect(subsolarPoint(new Date("2026-04-15T12:00Z")).lng).toBeCloseTo(0, 0);
    expect(subsolarPoint(new Date("2026-11-03T12:00Z")).lng).toBeCloseTo(
      -4.1,
      0,
    );
    // Six hours on, a quarter of the way round to the west.
    expect(subsolarPoint(new Date("2026-04-15T18:00Z")).lng).toBeCloseTo(
      -90,
      0,
    );
  });
});

describe("Starfield's sky", () => {
  it("adds the Milky Way and the sun where it is now, without the ground-level fading", async () => {
    const map = fakeMap();
    new Starfield(map as unknown as Map).setEnabled(true);
    await settle();
    const [layer] = map.addLayer.mock.calls[0] as unknown as [
      { options: Record<string, unknown> },
    ];
    const sun = subsolarPoint(new Date());
    expect(layer.options).toMatchObject({
      galaxyTextureUrl: expect.stringMatching(/milkyway\.jpg$/),
      sunEnabled: true,
      sunSize: 100,
      sunIntensity: 0.7,
      autoFadeStars: false,
    });
    expect(layer.options.sunAzimuth).toBeCloseTo((sun.lng + 360) % 360, 0);
    expect(layer.options.sunAltitude).toBeCloseTo(sun.lat, 1);
  });
});
