import { beforeEach, describe, expect, it, vi } from "vitest";
import { AddDataModal, parseFeatures } from "./addDataModal";
import type { AddResult } from "./addDataModal";

const point = { type: "Point", coordinates: [1, 2] };

describe("parseFeatures", () => {
  it("wraps bare geometries", () => {
    expect(parseFeatures(JSON.stringify(point))).toEqual([
      { type: "Feature", geometry: point, properties: null },
    ]);
  });

  it("keeps a Feature with its properties", () => {
    const feature = {
      type: "Feature",
      geometry: point,
      properties: { name: "Centro" },
    };
    expect(parseFeatures(JSON.stringify(feature))).toEqual([feature]);
  });

  it("expands a FeatureCollection", () => {
    const features = [
      { type: "Feature", geometry: point, properties: { name: "a" } },
      { type: "Feature", geometry: point, properties: { name: "b" } },
    ];
    expect(
      parseFeatures(JSON.stringify({ type: "FeatureCollection", features })),
    ).toEqual(features);
  });

  it("skips features without geometry", () => {
    const features = [{ type: "Feature", geometry: null, properties: {} }];
    expect(
      parseFeatures(JSON.stringify({ type: "FeatureCollection", features })),
    ).toEqual([]);
    expect(parseFeatures(JSON.stringify(features[0]))).toEqual([]);
  });

  it("parses WKT", () => {
    expect(parseFeatures("POINT (-3 40)")).toEqual([
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [-3, 40] },
        properties: null,
      },
    ]);
  });

  it.each([
    "not geojson",
    "null",
    "[1,2]",
    "5",
    '{"foo":1}',
    '{"type":"Polygon"}',
    '{"type":"FeatureCollection"}',
  ])("finds nothing in %s", (text) => {
    expect(parseFeatures(text)).toEqual([]);
  });
});

describe("AddDataModal", () => {
  let onSubmit: ReturnType<typeof vi.fn<() => AddResult>>;
  let modal: AddDataModal;
  const root = () => document.querySelector<HTMLElement>(".modal-overlay")!;
  const textarea = () => document.querySelector("textarea")!;
  const error = () => document.querySelector<HTMLElement>(".modal-error")!;
  const clickAdd = () =>
    document.querySelector<HTMLButtonElement>("button.primary")!.click();

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

  it("does nothing for empty input", () => {
    textarea().value = "   ";
    clickAdd();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(error().hidden).toBe(true);
  });

  it("closes after adding", () => {
    textarea().value = "POINT (1 2)";
    clickAdd();
    expect(onSubmit).toHaveBeenCalledOnce();
    expect(root().hidden).toBe(true);
  });

  it("stays open with an error on unparseable input", () => {
    textarea().value = "nope";
    clickAdd();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(root().hidden).toBe(false);
    expect(error().hidden).toBe(false);
  });

  it("shows an error when nothing could be added", () => {
    onSubmit.mockReturnValue({ added: 0, rejected: 1 });
    textarea().value = "POINT (1 2)";
    clickAdd();
    expect(root().hidden).toBe(false);
    expect(error().hidden).toBe(false);
  });

  it("reports skipped features and clears the input so they are not added twice", () => {
    onSubmit.mockReturnValue({ added: 1, rejected: 1 });
    textarea().value = JSON.stringify({
      type: "FeatureCollection",
      features: [
        { type: "Feature", geometry: point, properties: {} },
        { type: "Feature", geometry: point, properties: {} },
      ],
    });
    clickAdd();
    expect(error().textContent).toBe(
      "Skipped 1 of 2 features with invalid geometry.",
    );
    expect(textarea().value).toBe("");
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
