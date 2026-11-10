import "./testStorage";
import { beforeEach, describe, expect, it } from "vitest";
import { SettingsStore } from "./settings";
import { SettingsPanel } from "./settingsPanel";

describe("SettingsPanel", () => {
  let store: SettingsStore;
  const gear = () =>
    document.querySelector<HTMLButtonElement>('[title="Settings"]')!;
  const popover = () =>
    document.querySelector<HTMLElement>(".settings-popover")!;
  const radio = (name: string, value: string) =>
    document.querySelector<HTMLInputElement>(
      `input[name="setting-${name}"][value="${value}"]`,
    )!;

  beforeEach(() => {
    localStorage.clear();
    document.body.replaceChildren();
    store = new SettingsStore();
    new SettingsPanel(document.body, store);
  });

  it("opens and closes from the gear", () => {
    expect(popover().hidden).toBe(true);
    gear().click();
    expect(popover().hidden).toBe(false);
    expect(gear().getAttribute("aria-expanded")).toBe("true");
    gear().click();
    expect(popover().hidden).toBe(true);
  });

  it("closes on a click elsewhere or Escape", () => {
    gear().click();
    document.body.click();
    expect(popover().hidden).toBe(true);
    gear().click();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(popover().hidden).toBe(true);
  });

  it("shows the current settings", () => {
    expect(radio("units", "metric").checked).toBe(true);
    expect(radio("theme", "auto").checked).toBe(true);
    expect(radio("basemap", "auto").checked).toBe(true);
  });

  it("offers Auto and every OpenFreeMap style", () => {
    const basemaps = [
      ...document.querySelectorAll<HTMLInputElement>(
        'input[name="setting-basemap"]',
      ),
    ].map((r) => r.value);
    expect(basemaps).toEqual([
      "auto",
      "liberty",
      "bright",
      "positron",
      "dark",
      "fiord",
      "custom",
    ]);
  });

  describe("custom basemap", () => {
    const customBasemap = {
      url: "https://tiles.example.com/{z}/{x}/{y}.png",
      source: {
        tiles: ["https://tiles.example.com/{z}/{x}/{y}.png"],
        scheme: "xyz" as const,
      },
    };
    const form = () =>
      document.querySelector<HTMLFormElement>(".custom-basemap")!;
    const input = () => form().querySelector("input")!;

    it("asks for a URL before switching", () => {
      expect(form().hidden).toBe(true);
      radio("basemap", "custom").click();
      expect(form().hidden).toBe(false);
      expect(store.get().basemap).toBe("auto");
      expect(radio("basemap", "auto").checked).toBe(true);
    });

    it("switches once a URL is used", () => {
      radio("basemap", "custom").click();
      input().value = customBasemap.url;
      form().requestSubmit();
      expect(store.get()).toMatchObject({ basemap: "custom", customBasemap });
      expect(radio("basemap", "custom").checked).toBe(true);
    });

    it("goes back to a saved one straight away, and hides it for other basemaps", () => {
      store.set({ basemap: "custom", customBasemap });
      radio("basemap", "dark").click();
      expect(form().hidden).toBe(true);
      radio("basemap", "custom").click();
      expect(store.get().basemap).toBe("custom");
      expect(form().hidden).toBe(false);
      expect(input().value).toBe(customBasemap.url);
    });
  });

  it("applies a pick straight away, and stays open for the next", () => {
    gear().click();
    radio("units", "imperial").click();
    radio("basemap", "fiord").click();
    expect(store.get()).toMatchObject({ units: "imperial", basemap: "fiord" });
    expect(popover().hidden).toBe(false);
  });

  it("links to GeoWut's source, its license and the third-party ones", () => {
    const links = [
      ...document.querySelectorAll<HTMLAnchorElement>(".settings-footer a"),
    ].map((a) => [a.textContent, a.getAttribute("href")]);
    expect(links).toEqual([
      ["GitHub", "https://github.com/arredond/geowut"],
      ["MIT licensed", "https://github.com/arredond/geowut/blob/main/LICENSE"],
      ["Third-party licenses", "third-party-licenses.txt"],
    ]);
  });

  it("follows changes made elsewhere", () => {
    store.set({ theme: "dark" });
    expect(radio("theme", "dark").checked).toBe(true);
  });
});
