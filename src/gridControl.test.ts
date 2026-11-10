import { beforeEach, describe, expect, it, vi } from "vitest";
import { GridControl } from "./gridControl";
import type { GridLayer } from "./grids";

function fakeLayer(id: string): GridLayer {
  const layer = {
    def: {
      id,
      label: id.toUpperCase(),
      shape: `<polygon class="${id}-shape"/>`,
      color: "#000",
      minResolution: 0,
      maxResolution: 20,
    },
    visible: false,
    auto: true,
    resolution: 5,
    setVisible: vi.fn((visible: boolean) => {
      layer.visible = visible;
    }),
    setAuto: vi.fn((auto: boolean) => {
      layer.auto = auto;
    }),
    setResolution: vi.fn((resolution: number) => {
      layer.resolution = resolution;
    }),
  };
  return layer as unknown as GridLayer;
}

describe("GridControl", () => {
  let layers: GridLayer[];
  let onInfo: ReturnType<typeof vi.fn<() => void>>;
  const rows = () => document.querySelector<HTMLElement>(".grid-rows")!;
  const chevron = () =>
    document.querySelector<HTMLButtonElement>(".grid-collapse-button")!;
  const layerToggle = (i: number) =>
    document.querySelectorAll<HTMLInputElement>(".grid-row-label input")[i];
  const autoToggle = (i: number) =>
    document.querySelectorAll<HTMLInputElement>(".grid-row-auto input")[i];
  const resolution = (i: number) =>
    document.querySelectorAll<HTMLInputElement>(".grid-row-resolution")[i];
  const toggle = (input: HTMLInputElement) => input.click();

  beforeEach(() => {
    document.body.replaceChildren();
    layers = [fakeLayer("h3"), fakeLayer("s2")];
    onInfo = vi.fn<() => void>();
    new GridControl(document.body, layers, onInfo);
  });

  it("opens the cell sizes from the info button, without toggling the grids", () => {
    document
      .querySelector<HTMLButtonElement>('[title="Cell sizes per level"]')!
      .click();
    expect(onInfo).toHaveBeenCalledOnce();
    expect(rows().hidden).toBe(false);
  });

  it("folds the card from the title too", () => {
    document.querySelector<HTMLElement>(".grid-header-title")!.click();
    expect(rows().hidden).toBe(true);
  });

  it("starts expanded, with no layers on and auto on", () => {
    expect(rows().hidden).toBe(false);
    expect(chevron().getAttribute("aria-expanded")).toBe("true");
    expect(layerToggle(0).checked).toBe(false);
    expect(autoToggle(0).checked).toBe(true);
    expect(resolution(0).disabled).toBe(true);
  });

  it("toggles a single layer", () => {
    toggle(layerToggle(0));
    expect(layers[0].setVisible).toHaveBeenCalledWith(true);
    expect(layers[1].setVisible).not.toHaveBeenCalled();
  });

  describe("chevron", () => {
    it("folds the card away and back, saying which it'll do", () => {
      chevron().click();
      expect(rows().hidden).toBe(true);
      expect(chevron().getAttribute("aria-expanded")).toBe("false");
      expect(chevron().title).toBe("Expand grid layers");

      chevron().click();
      expect(rows().hidden).toBe(false);
      expect(chevron().title).toBe("Collapse grid layers");
    });

    it("leaves the grids on the map as they were", () => {
      toggle(layerToggle(0));
      chevron().click();
      expect(layers[0].visible).toBe(true);
      expect(layers[1].visible).toBe(false);
      chevron().click();
      expect(layerToggle(0).checked).toBe(true);
    });
  });

  describe("auto toggle", () => {
    it("unlocks the resolution when off, locks it when on", () => {
      toggle(autoToggle(0));
      expect(layers[0].setAuto).toHaveBeenLastCalledWith(false);
      expect(resolution(0).disabled).toBe(false);
      expect(resolution(1).disabled).toBe(true);

      toggle(autoToggle(0));
      expect(layers[0].setAuto).toHaveBeenLastCalledWith(true);
      expect(resolution(0).disabled).toBe(true);
    });

    it("is independent of the layer checkbox", () => {
      toggle(autoToggle(0));
      expect(layerToggle(0).checked).toBe(false);
    });
  });

  it("applies typed resolutions, showing the clamped value", () => {
    vi.mocked(layers[0].setResolution).mockImplementation(() => {
      layers[0].resolution = 20;
    });
    resolution(0).value = "99";
    resolution(0).dispatchEvent(new Event("change"));
    expect(layers[0].setResolution).toHaveBeenCalledWith(99);
    expect(resolution(0).value).toBe("20");
  });

  describe("stepper", () => {
    const step = (i: number, label: "Coarser" | "Finer") =>
      document.querySelectorAll<HTMLButtonElement>(`[title="${label}"]`)[i];

    it("steps from the level shown, leaving auto", () => {
      step(0, "Finer").click();
      expect(layers[0].setAuto).toHaveBeenLastCalledWith(false);
      expect(autoToggle(0).checked).toBe(false);
      expect(resolution(0).disabled).toBe(false);
      expect(layers[0].setResolution).toHaveBeenLastCalledWith(6);
      expect(resolution(0).value).toBe("6");

      step(0, "Coarser").click();
      step(0, "Coarser").click();
      expect(resolution(0).value).toBe("4");
      expect(layers[1].setResolution).not.toHaveBeenCalled();
    });
  });

  it("names each grid plainly, beside its cell shape", () => {
    const labels = [
      ...document.querySelectorAll<HTMLElement>(".grid-row-label"),
    ];
    expect(labels.map((label) => label.textContent)).toEqual(["H3", "S2"]);
    expect(labels[0].querySelector(".grid-icon .h3-shape")).not.toBeNull();
    expect(labels[1].querySelector(".grid-icon .s2-shape")).not.toBeNull();
  });

  it("draws its checkboxes as switches, and says so", () => {
    for (const input of [layerToggle(0), layerToggle(1)]) {
      expect(input.getAttribute("role")).toBe("switch");
      expect(input.getAttribute("aria-label")).toBeTruthy();
    }
  });

  it("follows resolution changes from zooming", () => {
    layers[0].onResolutionChange!(11);
    expect(resolution(0).value).toBe("11");
  });

  it("flags resolutions with too many cells to draw", () => {
    layers[0].onTooManyCellsChange!(true);
    expect(resolution(0).classList.contains("too-many-cells")).toBe(true);
    expect(
      resolution(0)
        .closest(".grid-stepper")!
        .classList.contains("too-many-cells"),
    ).toBe(true);
    expect(resolution(0).title).not.toBe("");

    layers[0].onTooManyCellsChange!(false);
    expect(resolution(0).classList.contains("too-many-cells")).toBe(false);
    expect(resolution(0).title).toBe("");
  });
});
