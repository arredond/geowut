import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LngLat, Map as MapLibreMap } from "maplibre-gl";
import { buildPopupContent, FeaturePopup } from "./popup";

const created = vi.hoisted((): unknown[] => []);
const popup = vi.hoisted(() => ({
  setLngLat: vi.fn().mockReturnThis(),
  setDOMContent: vi.fn().mockReturnThis(),
  addTo: vi.fn().mockReturnThis(),
  remove: vi.fn(),
  isOpen: vi.fn(() => true),
}));

vi.mock("maplibre-gl", () => ({
  Popup: class {
    constructor() {
      created.push(this);
      return popup;
    }
  },
}));

describe("buildPopupContent", () => {
  const buttons = (content: HTMLElement) => [
    ...content.querySelectorAll<HTMLButtonElement>(".popup-action"),
  ];

  it("always offers edit and delete", () => {
    expect(
      buttons(buildPopupContent({ onEdit: vi.fn(), onDelete: vi.fn() })).map(
        (b) => b.title,
      ),
    ).toEqual(["Edit", "Delete"]);
  });

  it("holds nothing but the actions, as properties go in the side panel", () => {
    const content = buildPopupContent({ onEdit: vi.fn(), onDelete: vi.fn() });
    expect(content.querySelector("table")).toBeNull();
    expect(content.textContent).toBe("");
  });

  it("runs the matching action", () => {
    const actions = { onEdit: vi.fn(), onDelete: vi.fn() };
    const [edit, remove] = buttons(buildPopupContent(actions));
    edit.click();
    expect(actions.onEdit).toHaveBeenCalledOnce();
    expect(actions.onDelete).not.toHaveBeenCalled();
    remove.click();
    expect(actions.onDelete).toHaveBeenCalledOnce();
  });
});

describe("FeaturePopup", () => {
  const map = {} as MapLibreMap;
  const lngLat = { lng: 1, lat: 2 } as LngLat;
  const actions = { onEdit: vi.fn(), onDelete: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    created.length = 0;
  });

  it("opens where clicked", () => {
    new FeaturePopup(map).show(lngLat, actions);
    expect(popup.setLngLat).toHaveBeenCalledWith(lngLat);
    expect(popup.addTo).toHaveBeenCalledWith(map);
  });

  it("opens a new popup each time, as the old one closes itself on the same click", () => {
    const featurePopup = new FeaturePopup(map);
    featurePopup.show(lngLat, actions);
    featurePopup.show(lngLat, actions);
    expect(created).toHaveLength(2);
  });

  it("closes on request", () => {
    const featurePopup = new FeaturePopup(map);
    featurePopup.show(lngLat, actions);
    featurePopup.hide();
    expect(popup.remove).toHaveBeenCalled();
  });

  it("runs the delete action of the open popup", () => {
    const featurePopup = new FeaturePopup(map);
    featurePopup.show(lngLat, actions);
    featurePopup.deleteFeature();
    expect(actions.onDelete).toHaveBeenCalledOnce();
  });

  it("deletes nothing once the popup has closed", () => {
    const featurePopup = new FeaturePopup(map);
    featurePopup.show(lngLat, actions);
    popup.isOpen.mockReturnValueOnce(false);
    featurePopup.deleteFeature();
    expect(actions.onDelete).not.toHaveBeenCalled();
  });

  it("deletes nothing before any popup opened", () => {
    new FeaturePopup(map).deleteFeature();
    expect(actions.onDelete).not.toHaveBeenCalled();
  });

  it("copes with closing before anything opened", () => {
    expect(() => new FeaturePopup(map).hide()).not.toThrow();
  });
});
