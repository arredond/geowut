import { beforeEach, describe, expect, it, vi } from "vitest";
import { historyShortcut, isTyping, Toolbar } from "./toolbar";
import type { ToolbarActions } from "./toolbar";

vi.mock("terra-draw", () => ({}));
vi.mock("terra-draw-maplibre-gl-adapter", () => ({}));

describe("Toolbar", () => {
  let actions: { [K in keyof ToolbarActions]: ReturnType<typeof vi.fn> };
  let toolbar: Toolbar;
  const button = (title: string) =>
    document.querySelector<HTMLButtonElement>(`[title="${title}"]`)!;
  const chips = () => button("Stop deleting").parentElement!;
  const measureChips = (tool: string) =>
    button(tool).nextElementSibling as HTMLElement;

  beforeEach(() => {
    document.body.replaceChildren();
    actions = {
      setState: vi.fn(),
      deleteAll: vi.fn(),
      undo: vi.fn(),
      redo: vi.fn(),
      exportAll: vi.fn(),
    };
    toolbar = new Toolbar(
      document.body,
      actions as unknown as ToolbarActions,
      "metric",
    );
  });

  it("offers every drawing tool and no select tool", () => {
    const titles = [
      ...document.querySelectorAll<HTMLElement>(
        ".draw-tool:not(.draw-shapes-toggle)",
      ),
    ].map((b) => b.title);
    expect(titles).toEqual([
      "Draw a point",
      "Draw a line",
      "Draw a polygon",
      "Draw a rectangle",
      "Draw a circle",
      "Draw freehand",
      "Measure distance",
      "Measure area",
      "Delete features",
      "Undo",
      "Redo",
      "Nothing to export yet: draw or add some features",
    ]);
  });

  it("exports only once there are features", () => {
    const exportButton = () =>
      document.querySelector<HTMLButtonElement>(
        '[aria-label="Export all features as GeoJSON"]',
      )!;
    expect(exportButton().disabled).toBe(true);
    toolbar.setHasFeatures(true);
    expect(exportButton().disabled).toBe(false);
    expect(exportButton().title).toBe("Export all features as GeoJSON");
    exportButton().click();
    expect(actions.exportAll).toHaveBeenCalledOnce();
    toolbar.setHasFeatures(false);
    expect(exportButton().disabled).toBe(true);
  });

  it("picks a tool", () => {
    button("Draw a circle").click();
    expect(actions.setState).toHaveBeenCalledWith("circle");
  });

  it("leaves a tool when clicking it again", () => {
    toolbar.setState("circle");
    button("Draw a circle").click();
    expect(actions.setState).toHaveBeenCalledWith("select");
  });

  it("folds the shapes behind one button, showing the one picked", () => {
    const shapes = button("Draw a polygon").parentElement!;
    button("Draw shapes").click();
    expect(shapes.classList.contains("open")).toBe(true);
    button("Draw a polygon").click();
    expect(actions.setState).toHaveBeenCalledWith("polygon");
    expect(shapes.classList.contains("open")).toBe(false);

    toolbar.setState("polygon");
    expect(button("Draw shapes").classList.contains("active")).toBe(true);
    expect(button("Draw shapes").innerHTML).toBe(
      button("Draw a polygon").innerHTML,
    );
    toolbar.setState("measure-line");
    expect(button("Draw shapes").classList.contains("active")).toBe(false);
  });

  it("highlights only the active tool", () => {
    toolbar.setState("rectangle");
    expect(button("Draw a rectangle").classList.contains("active")).toBe(true);
    toolbar.setState("point");
    expect(button("Draw a rectangle").classList.contains("active")).toBe(false);
    expect(button("Draw a point").classList.contains("active")).toBe(true);
    toolbar.setState("select");
    expect(document.querySelector(".active")).toBeNull();
  });

  describe("trash", () => {
    it("deletes nothing by itself, only entering delete state", () => {
      button("Delete features").click();
      expect(actions.setState).toHaveBeenCalledWith("delete");
      expect(actions.deleteAll).not.toHaveBeenCalled();
    });

    it("shows its chips only in delete state", () => {
      expect(chips().hidden).toBe(true);
      toolbar.setState("delete");
      expect(chips().hidden).toBe(false);
      toolbar.setState("select");
      expect(chips().hidden).toBe(true);
    });

    it("deletes everything with the All chip", () => {
      button("Delete every feature").click();
      expect(actions.deleteAll).toHaveBeenCalledOnce();
    });

    it("goes back to select with the x chip", () => {
      toolbar.setState("delete");
      button("Stop deleting").click();
      expect(actions.setState).toHaveBeenCalledWith("select");
    });
  });

  describe("measuring", () => {
    it("picks a measure tool", () => {
      button("Measure area").click();
      expect(actions.setState).toHaveBeenCalledWith("measure-area");
    });

    it("shows the readout only next to the active measure tool", () => {
      toolbar.setState("measure-line");
      expect(measureChips("Measure distance").hidden).toBe(false);
      expect(measureChips("Measure area").hidden).toBe(true);
      toolbar.setState("select");
      expect(measureChips("Measure distance").hidden).toBe(true);
    });

    it("hints how to start, then shows the measurement", () => {
      toolbar.setState("measure-line");
      toolbar.setMeasurement(null);
      const readout =
        measureChips("Measure distance").querySelector(".draw-readout")!;
      expect(readout.textContent).toBe("Click to start a line");
      toolbar.setMeasurement({ lengthKm: 12.345 });
      expect(readout.textContent).toBe("12.3 km");
    });

    it("shows the measurement again in new units", () => {
      toolbar.setState("measure-line");
      toolbar.setMeasurement({ lengthKm: 16.09344 });
      toolbar.setUnits("imperial");
      expect(
        measureChips("Measure distance").querySelector(".draw-readout")!
          .textContent,
      ).toBe("10 mi");
    });

    it("goes back to select with the x chip", () => {
      toolbar.setState("measure-area");
      measureChips("Measure area")
        .querySelector<HTMLElement>('[title="Stop measuring"]')!
        .click();
      expect(actions.setState).toHaveBeenCalledWith("select");
    });
  });

  it("enables undo and redo only when there is something to replay", () => {
    expect(button("Undo").disabled).toBe(true);
    expect(button("Redo").disabled).toBe(true);
    toolbar.setHistory(true, false);
    expect(button("Undo").disabled).toBe(false);
    expect(button("Redo").disabled).toBe(true);
  });

  it("runs undo and redo", () => {
    toolbar.setHistory(true, true);
    button("Undo").click();
    button("Redo").click();
    expect(actions.undo).toHaveBeenCalledOnce();
    expect(actions.redo).toHaveBeenCalledOnce();
  });
});

describe("historyShortcut", () => {
  const press = (init: KeyboardEventInit, target: Element = document.body) => {
    let result: ReturnType<typeof historyShortcut> = null;
    const listener = (e: Event) => {
      result = historyShortcut(e as KeyboardEvent);
    };
    document.addEventListener("keydown", listener);
    document.body.appendChild(
      target === document.body ? document.createElement("div") : target,
    );
    target.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, ...init }),
    );
    document.removeEventListener("keydown", listener);
    return result;
  };
  const input = (type: string) =>
    Object.assign(document.createElement("input"), { type });

  it.each([{ ctrlKey: true }, { metaKey: true }])(
    "undoes with %o and Z",
    (modifier) => {
      expect(press({ key: "z", ...modifier })).toBe("undo");
    },
  );

  it.each([{ ctrlKey: true }, { metaKey: true }])(
    "redoes with %o, Shift and Z",
    (modifier) => {
      expect(press({ key: "Z", shiftKey: true, ...modifier })).toBe("redo");
    },
  );

  it("needs a modifier", () => {
    expect(press({ key: "z" })).toBeNull();
    expect(press({ key: "Z", shiftKey: true })).toBeNull();
  });

  it("ignores other keys and Alt combinations", () => {
    expect(press({ key: "y", ctrlKey: true })).toBeNull();
    expect(press({ key: "z", ctrlKey: true, altKey: true })).toBeNull();
  });

  it("leaves text undo alone", () => {
    expect(
      press({ key: "z", metaKey: true }, document.createElement("textarea")),
    ).toBeNull();
    expect(press({ key: "z", metaKey: true }, input("number"))).toBeNull();
  });

  it("still works with a checkbox focused, as after toggling a grid", () => {
    expect(press({ key: "z", metaKey: true }, input("checkbox"))).toBe("undo");
  });
});

describe("isTyping", () => {
  const pressIn = (target: Element) => {
    let typing = false;
    target.addEventListener("keydown", (e) => {
      typing = isTyping(e as KeyboardEvent);
    });
    target.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace" }));
    return typing;
  };

  it("is true in text boxes", () => {
    expect(pressIn(document.createElement("textarea"))).toBe(true);
    expect(
      pressIn(
        Object.assign(document.createElement("input"), { type: "number" }),
      ),
    ).toBe(true);
  });

  it("is false anywhere else, such as a focused checkbox or popup button", () => {
    expect(
      pressIn(
        Object.assign(document.createElement("input"), { type: "checkbox" }),
      ),
    ).toBe(false);
    expect(pressIn(document.createElement("button"))).toBe(false);
  });
});
