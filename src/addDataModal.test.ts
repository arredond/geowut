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

  const box = {
    type: "Feature",
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [-3.8, 40.3],
          [-3.5, 40.3],
          [-3.5, 40.6],
          [-3.8, 40.6],
          [-3.8, 40.3],
        ],
      ],
    },
    properties: null,
  };

  it.each([
    "-3.8 40.3 -3.5 40.6",
    "-3.8,40.3,-3.5,40.6",
    "[-3.8, 40.3, -3.5, 40.6]",
    "-te -3.8 40.3 -3.5 40.6",
    "-spat -3.8 40.3 -3.5 40.6",
    "-projwin -3.8 40.6 -3.5 40.3",
    "Extent: (-3.800000, 40.300000) - (-3.500000, 40.600000)",
  ])("turns the bounding box %s into a rectangle", (text) => {
    expect(parseFeatures(text)).toEqual([box]);
  });

  it("parses lat, lng pairs as points, one per line", () => {
    expect(parseFeatures("40.4168, -3.7038\n\n  -33.86,151.21  ")).toEqual([
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [-3.7038, 40.4168] },
        properties: null,
      },
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [151.21, -33.86] },
        properties: null,
      },
    ]);
  });

  it("mixes bounding boxes and points across lines", () => {
    expect(parseFeatures("-3.8 40.3 -3.5 40.6\n40.4, -3.7")).toHaveLength(2);
  });

  it("parses Esri JSON, such as a REST query response", () => {
    const features = parseFeatures(
      JSON.stringify({
        spatialReference: { wkid: 4326 },
        features: [{ geometry: { x: -3, y: 40 }, attributes: { OBJECTID: 1 } }],
      }),
    );
    expect(features).toEqual([
      {
        type: "Feature",
        id: 1,
        geometry: { type: "Point", coordinates: [-3, 40] },
        properties: { OBJECTID: 1 },
      },
    ]);
  });

  it.each([
    "not geojson",
    "40 -3",
    "91, -3.7",
    "1, 2, 3",
    "1 2 1 5",
    "0 0 200 10",
    "[0, 0, 0, 0]",
    "40.4, -3.7\nnope",
    "40.4, -3.7 meters",
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

  it("explains Esri JSON it can't project", () => {
    textarea().value = JSON.stringify({
      x: 500000,
      y: 4470000,
      spatialReference: { wkid: 25830 },
    });
    clickAdd();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(error().textContent).toMatch(/spatial reference 25830/);
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

  describe("pasted onto the map", () => {
    beforeEach(() => modal.hide());

    it("adds the data without opening", () => {
      modal.addPasted("40.4, -3.7");
      expect(onSubmit).toHaveBeenCalledWith([
        expect.objectContaining({
          geometry: { type: "Point", coordinates: [-3.7, 40.4] },
        }),
      ]);
      expect(modal.isHidden()).toBe(true);
    });

    it("ignores blank pastes", () => {
      modal.addPasted("  \n ");
      expect(onSubmit).not.toHaveBeenCalled();
      expect(modal.isHidden()).toBe(true);
    });

    it("opens with the text and why when nothing could be read", () => {
      modal.addPasted("  not a geometry ");
      expect(onSubmit).not.toHaveBeenCalled();
      expect(modal.isHidden()).toBe(false);
      expect(textarea().value).toBe("not a geometry");
      expect(error().textContent).toMatch(/Could not parse/);
    });

    it("opens to say what was skipped, without the text to add again", () => {
      onSubmit.mockReturnValue({ added: 1, rejected: 1 });
      modal.addPasted("POINT (1 2)");
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
