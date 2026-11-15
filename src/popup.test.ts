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

const emojiPicker = vi.hoisted(() => ({
  onPick: undefined as ((emoji: string) => void) | undefined,
}));
vi.mock("./emojiPicker", () => ({
  createEmojiPicker: async (onPick: (emoji: string) => void) => {
    emojiPicker.onPick = onPick;
    const el = document.createElement("div");
    el.className = "emoji-picker";
    return el;
  },
}));

vi.mock("maplibre-gl", () => ({
  Popup: class {
    constructor() {
      created.push(this);
      return popup;
    }
  },
}));

const buttons = (content: HTMLElement) => [
  ...content.querySelectorAll<HTMLButtonElement>(".popup-action"),
];

describe("buildPopupContent", () => {
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

describe("style picker", () => {
  const styleActions = (isPoint: boolean, current = {}) => ({
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    style: { current, isPoint, onChange: vi.fn() },
  });
  const open = (actions: ReturnType<typeof styleActions>) => {
    const content = buildPopupContent(actions);
    content.querySelector<HTMLButtonElement>('[title="Style"]')!.click();
    return content;
  };

  it("offers a style button first, which opens and closes the picker", () => {
    const content = buildPopupContent(styleActions(false));
    const [style] = buttons(content);
    expect(buttons(content).map((b) => b.title)).toEqual([
      "Style",
      "Edit",
      "Delete",
    ]);
    style.click();
    expect(content.querySelector(".style-picker")).not.toBeNull();
    style.click();
    expect(content.querySelector(".style-picker")).toBeNull();
  });

  it("applies a color, and the default takes it away", () => {
    const actions = styleActions(false, { color: "#e5484d" });
    const content = open(actions);
    const red = content.querySelector<HTMLButtonElement>('[title="#e5484d"]')!;
    expect(red.getAttribute("aria-pressed")).toBe("true");
    content.querySelector<HTMLButtonElement>('[title="#30a46c"]')!.click();
    expect(actions.style.onChange).toHaveBeenLastCalledWith({
      color: "#30a46c",
    });
    expect(red.getAttribute("aria-pressed")).toBe("false");
    content
      .querySelector<HTMLButtonElement>('[title="Default color"]')!
      .click();
    expect(actions.style.onChange).toHaveBeenLastCalledWith({
      color: undefined,
    });
  });

  it("offers an emoji for points only", () => {
    expect(
      open(styleActions(false)).querySelector('[title="Emoji"]'),
    ).toBeNull();
    expect(
      open(styleActions(true)).querySelector('[title="Emoji"]'),
    ).not.toBeNull();
  });

  it("gives a point an emoji or a color, never both", async () => {
    const actions = styleActions(true, { color: "#e5484d" });
    const content = open(actions);
    const red = content.querySelector('[title="#e5484d"]')!;
    const emoji = content.querySelector<HTMLButtonElement>('[title="Emoji"]')!;
    expect(emoji.getAttribute("aria-pressed")).toBe("false");

    emoji.click();
    await vi.waitFor(() =>
      expect(content.querySelector(".emoji-picker")).not.toBeNull(),
    );
    emojiPicker.onPick!("🦖");
    expect(actions.style.onChange).toHaveBeenLastCalledWith({
      emoji: "🦖",
      color: undefined,
    });
    // The picker closes on a pick, and the button shows what was picked.
    expect(content.querySelector(".emoji-picker")).toBeNull();
    expect(emoji.textContent).toBe("🦖");
    expect(emoji.getAttribute("aria-pressed")).toBe("true");
    expect(red.getAttribute("aria-pressed")).toBe("false");

    // A color, the default included, turns it back into a dot.
    content
      .querySelector<HTMLButtonElement>('[title="Default color"]')!
      .click();
    expect(actions.style.onChange).toHaveBeenLastCalledWith({
      color: undefined,
      emoji: undefined,
    });
    expect(emoji.getAttribute("aria-pressed")).toBe("false");
    expect(emoji.textContent).toBe("");
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
