import "./testStorage";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyTheme,
  DEFAULT_SETTINGS,
  resolveBasemap,
  SettingsStore,
} from "./settings";

describe("SettingsStore", () => {
  beforeEach(() => localStorage.clear());

  it("defaults to metric and Auto for the theme and basemap", () => {
    expect(new SettingsStore().get()).toEqual({
      units: "metric",
      theme: "auto",
      basemap: "auto",
      customBasemap: null,
    });
  });

  it("remembers changes across page loads", () => {
    new SettingsStore().set({ units: "imperial", basemap: "dark" });
    expect(new SettingsStore().get()).toEqual({
      ...DEFAULT_SETTINGS,
      units: "imperial",
      basemap: "dark",
    });
  });

  it("drops saved values that are no longer valid", () => {
    localStorage.setItem(
      "geowut:settings",
      JSON.stringify({ units: "furlongs", theme: "dark", basemap: "voyager" }),
    );
    expect(new SettingsStore().get()).toEqual({
      ...DEFAULT_SETTINGS,
      theme: "dark",
    });
  });

  it("keeps a custom basemap only while its tiles make sense", () => {
    const customBasemap = {
      url: "https://example.com/wmts?REQUEST=GetCapabilities",
      layer: "Ortho",
      source: {
        tiles: ["https://example.com/wmts/{z}/{y}/{x}.png"],
        scheme: "xyz" as const,
        tileSize: 256,
        minzoom: 0,
        maxzoom: 19,
        bounds: [-10, 35, 5, 44] as [number, number, number, number],
      },
    };
    new SettingsStore().set({ basemap: "custom", customBasemap });
    expect(new SettingsStore().get()).toMatchObject({
      basemap: "custom",
      customBasemap,
    });

    for (const broken of [
      { url: "nope", source: customBasemap.source },
      { url: customBasemap.url, source: { tiles: [], scheme: "xyz" } },
      {
        url: customBasemap.url,
        source: { tiles: ["javascript:1"], scheme: "xyz" },
      },
      { ...customBasemap, source: { ...customBasemap.source, bounds: [1, 2] } },
    ]) {
      localStorage.setItem(
        "geowut:settings",
        JSON.stringify({ basemap: "custom", customBasemap: broken }),
      );
      expect(new SettingsStore().get()).toEqual(DEFAULT_SETTINGS);
    }
  });

  it("survives garbled storage", () => {
    localStorage.setItem("geowut:settings", "{nope");
    expect(new SettingsStore().get()).toEqual(DEFAULT_SETTINGS);
  });

  it("tells listeners what changed, and nothing when nothing did", () => {
    const store = new SettingsStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.set({ units: "metric" });
    expect(listener).not.toHaveBeenCalled();
    store.set({ units: "imperial", theme: "auto" });
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ units: "imperial" }),
      ["units"],
    );
  });
});

describe("applyTheme", () => {
  it("forces light or dark, and leaves auto to the system", () => {
    const root = document.createElement("html");
    applyTheme("dark", root);
    expect(root.dataset.theme).toBe("dark");
    applyTheme("auto", root);
    expect(root.dataset.theme).toBeUndefined();
  });
});

describe("resolveBasemap", () => {
  it("follows the theme, or the system's when that's Auto too", () => {
    expect(resolveBasemap({ theme: "light", basemap: "auto" }, true)).toBe(
      "liberty",
    );
    expect(resolveBasemap({ theme: "dark", basemap: "auto" }, false)).toBe(
      "dark",
    );
    expect(resolveBasemap({ theme: "auto", basemap: "auto" }, true)).toBe(
      "dark",
    );
    expect(resolveBasemap({ theme: "auto", basemap: "auto" }, false)).toBe(
      "liberty",
    );
  });

  it("leaves a basemap that was picked alone", () => {
    expect(resolveBasemap({ theme: "dark", basemap: "positron" }, true)).toBe(
      "positron",
    );
    expect(resolveBasemap({ theme: "light", basemap: "fiord" }, false)).toBe(
      "fiord",
    );
  });
});
