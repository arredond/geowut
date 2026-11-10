import { beforeEach, describe, expect, it, vi } from "vitest";
import { AddDataModal } from "./addDataModal";
import type { AddResult } from "./addDataModal";

const point = { type: "Point", coordinates: [1, 2] };

describe("AddDataModal", () => {
  let onSubmit: ReturnType<typeof vi.fn<() => AddResult>>;
  let modal: AddDataModal;
  const root = () => document.querySelector<HTMLElement>(".modal-overlay")!;
  const textarea = () => document.querySelector("textarea")!;
  const error = () => document.querySelector<HTMLElement>(".modal-error")!;
  const addButton = () =>
    document.querySelector<HTMLButtonElement>("button.primary")!;
  /** Clicks Add and waits for what it read to be added, or refused. */
  const clickAdd = async () => {
    addButton().click();
    await vi.waitFor(() => expect(addButton().disabled).toBe(false));
  };

  beforeEach(() => {
    document.body.replaceChildren();
    onSubmit = vi.fn<() => AddResult>(() => ({ added: 1, rejected: 0 }));
    modal = new AddDataModal(document.body, onSubmit);
    modal.show();
  });

  it("starts hidden and clears itself when shown", () => {
    textarea().value = "old";
    modal.hide();
    expect(root().hidden).toBe(true);
    modal.show();
    expect(root().hidden).toBe(false);
    expect(textarea().value).toBe("");
  });

  it("does nothing for empty input", async () => {
    textarea().value = "   ";
    await clickAdd();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(error().hidden).toBe(true);
  });

  it("closes after adding", async () => {
    textarea().value = "POINT (1 2)";
    await clickAdd();
    expect(onSubmit).toHaveBeenCalledOnce();
    expect(root().hidden).toBe(true);
  });

  it("stays open with an error on unparseable input", async () => {
    textarea().value = "nope";
    await clickAdd();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(root().hidden).toBe(false);
    expect(error().hidden).toBe(false);
  });

  it("explains Esri JSON it can't project", async () => {
    textarea().value = JSON.stringify({
      x: 500000,
      y: 4470000,
      spatialReference: { wkid: 102999 },
    });
    await clickAdd();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(error().textContent).toMatch(/102999/);
  });

  it("shows an error when nothing could be added", async () => {
    onSubmit.mockReturnValue({ added: 0, rejected: 1 });
    textarea().value = "POINT (1 2)";
    await clickAdd();
    expect(root().hidden).toBe(false);
    expect(error().hidden).toBe(false);
  });

  it("reports skipped features and clears the input so they are not added twice", async () => {
    onSubmit.mockReturnValue({ added: 1, rejected: 1 });
    textarea().value = JSON.stringify({
      type: "FeatureCollection",
      features: [
        { type: "Feature", geometry: point, properties: {} },
        { type: "Feature", geometry: point, properties: {} },
      ],
    });
    await clickAdd();
    expect(error().textContent).toBe(
      "Skipped 1 of 2 features with invalid geometry, such as coordinates off the globe: projected data without its coordinate system?",
    );
    expect(textarea().value).toBe("");
  });

  describe("pasted onto the map", () => {
    beforeEach(() => modal.hide());

    it("adds the data without opening", async () => {
      await modal.addPasted("40.4, -3.7");
      expect(onSubmit).toHaveBeenCalledWith([
        expect.objectContaining({
          geometry: { type: "Point", coordinates: [-3.7, 40.4] },
        }),
      ]);
      expect(modal.isHidden()).toBe(true);
    });

    it("ignores blank pastes", async () => {
      await modal.addPasted("  \n ");
      expect(onSubmit).not.toHaveBeenCalled();
      expect(modal.isHidden()).toBe(true);
    });

    it("opens with the text and why when nothing could be read", async () => {
      await modal.addPasted("  not a geometry ");
      expect(onSubmit).not.toHaveBeenCalled();
      expect(modal.isHidden()).toBe(false);
      expect(textarea().value).toBe("not a geometry");
      expect(error().textContent).toMatch(/Could not read/);
    });

    it("says an empty collection is empty, not unreadable", async () => {
      await modal.addPasted('{"type":"FeatureCollection","features":[]}');
      expect(onSubmit).not.toHaveBeenCalled();
      expect(error().textContent).toBe(
        "That's valid, but empty: there are no features in it.",
      );
    });

    it("opens to say what was skipped, without the text to add again", async () => {
      onSubmit.mockReturnValue({ added: 1, rejected: 1 });
      await modal.addPasted("POINT (1 2)");
      expect(modal.isHidden()).toBe(false);
      expect(textarea().value).toBe("");
      expect(error().textContent).toMatch(/Skipped 1 of 1/);
    });
  });

  it("closes when clicking the backdrop or Cancel, not the dialog", () => {
    document.querySelector<HTMLElement>(".modal")!.click();
    expect(root().hidden).toBe(false);
    root().click();
    expect(root().hidden).toBe(true);

    modal.show();
    [...document.querySelectorAll("button")]
      .find((b) => b.textContent === "Cancel")!
      .click();
    expect(root().hidden).toBe(true);
  });
});
