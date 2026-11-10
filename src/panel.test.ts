import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Geometry } from "geojson";
import { buildDetailsTable, FeaturePanel } from "./panel";
import { copyText } from "./clipboard";
import * as coverage from "./coverage";

vi.mock("./clipboard", () => ({ copyText: vi.fn(async () => true) }));

const polygon: Geometry = {
  type: "Polygon",
  coordinates: [
    [
      [0, 0],
      [2, 0],
      [2, 2],
      [0, 0],
    ],
  ],
};
const point: Geometry = { type: "Point", coordinates: [1, 2] };

describe("FeaturePanel", () => {
  let panel: FeaturePanel;
  const root = () => document.querySelector<HTMLElement>(".feature-panel")!;
  const labels = () =>
    [...document.querySelectorAll(".copy-label")].map(
      (label) => label.textContent,
    );
  const sections = () =>
    [...document.querySelectorAll(".panel-section h2")].map(
      (h) => h.textContent,
    );
  const button = (text: string) =>
    [...document.querySelectorAll<HTMLButtonElement>(".copy-button")].find(
      (b) => b.querySelector(".copy-label")!.textContent!.startsWith(text),
    )!;
  const status = (copy: HTMLElement) =>
    copy.querySelector(".copy-status")!.textContent;
  const copied = async (copy: HTMLElement) => {
    vi.mocked(copyText).mockClear();
    copy.click();
    await vi.waitFor(() => expect(copyText).toHaveBeenCalled());
    return vi.mocked(copyText).mock.lastCall![0];
  };

  beforeEach(() => {
    vi.clearAllMocks();
    document.body.replaceChildren();
    panel = new FeaturePanel(document.body, () => ({
      h3: 5,
      quadkey: 8,
      s2: 9,
      a5: 8,
    }));
  });

  it("starts hidden and shows every format and covering for a polygon", () => {
    expect(root().hidden).toBe(true);
    panel.show(polygon);
    expect(root().hidden).toBe(false);
    expect(sections()).toEqual(["Copy as", "Coverings"]);
    expect(labels()).toEqual([
      "GeoJSON",
      "Well Known Text (WKT)",
      "Bounding box",
      "Center (lng/lat)",
      "Center (lat/lng)",
      "H3 (res 5)",
      "Quadkey (zoom 8)",
      "S2 (level 9)",
      "A5 (res 8)",
    ]);
  });

  it("gives points their coordinates instead of a center", () => {
    panel.show(point);
    expect(labels()).toContain("Lng/Lat");
    expect(labels()).toContain("Lat/Lng");
    expect(labels().filter((label) => label!.startsWith("Center"))).toEqual([]);
  });

  describe("grid cells", () => {
    it("skip covering themselves, at their own level", () => {
      panel.show(polygon, { cell: { grid: "s2", level: 9 } });
      expect(labels()).toContain("H3 (res 5)");
      expect(labels()).not.toContain("S2 (level 9)");
    });

    it("still cover themselves at another level of their grid", () => {
      panel.show(polygon, { cell: { grid: "s2", level: 12 } });
      expect(labels()).toContain("S2 (level 9)");
    });
  });

  describe("properties", () => {
    const details = (units: string) => [
      { label: "ID", value: "8928308280fffff" },
      { label: "Length", value: units === "metric" ? "1 km" : "0.62 mi" },
    ];
    const rows = () =>
      [...document.querySelectorAll(".details-table tr")].map((row) => [
        row.children[0].textContent,
        row.children[1].textContent,
      ]);
    const copyValue = (label: string) =>
      document.querySelector<HTMLButtonElement>(
        `.copy-value[title="Copy ${label}"]`,
      )!;

    it("lists them above the copy buttons", () => {
      panel.show(polygon, { details });
      expect(rows()).toEqual([
        ["ID", "8928308280fffff"],
        ["Length", "1 km"],
      ]);
      expect(sections()).toEqual(["Properties", "Copy as", "Coverings"]);
    });

    it("copies each one on its own", async () => {
      panel.show(polygon, { details });
      expect(await copied(copyValue("ID"))).toBe("8928308280fffff");
      await vi.waitFor(() =>
        expect(copyValue("ID").dataset.state).toBe("copied"),
      );
    });

    it("shows no section without any", () => {
      panel.show(polygon, { details: () => [] });
      expect(document.querySelector(".details-table")).toBeNull();
      panel.show(polygon);
      expect(sections()).toEqual(["Copy as", "Coverings"]);
    });

    it("never interprets pasted text as HTML", () => {
      panel.show(polygon, {
        details: () => [
          { label: "<b>key</b>", value: "<img src=x onerror=alert(1)>" },
        ],
      });
      expect(
        document.querySelector(".details-table img, .details-table b"),
      ).toBeNull();
      expect(rows()).toEqual([["<b>key</b>", "<img src=x onerror=alert(1)>"]]);
    });

    it("shows them again in new units", () => {
      let units: "metric" | "imperial" = "metric";
      document.body.replaceChildren();
      panel = new FeaturePanel(
        document.body,
        () => ({ h3: 5, quadkey: 8, s2: 9, a5: 8 }),
        () => units,
      );
      panel.show(polygon, { details });
      units = "imperial";
      panel.refresh();
      expect(rows()[1]).toEqual(["Length", "0.62 mi"]);
    });

    it("stays closed on refresh once closed", () => {
      panel.show(polygon, { details });
      panel.hide();
      panel.refresh();
      expect(root().hidden).toBe(true);
    });
  });

  describe("covering previews", () => {
    let onPreview: ReturnType<
      typeof vi.fn<(cells: Record<string, string[]>) => void>
    >;
    const toggle = (label: string) =>
      button(label).parentElement!.querySelector<HTMLButtonElement>(
        ".preview-toggle",
      )!;

    beforeEach(() => {
      document.body.replaceChildren();
      onPreview = vi.fn();
      panel = new FeaturePanel(
        document.body,
        () => ({ h3: 5, quadkey: 8, s2: 9, a5: 8 }),
        () => "metric",
        onPreview,
      );
    });

    it("offers one per covering, off to begin with, and none for formats", () => {
      panel.show(polygon);
      expect(document.querySelectorAll(".preview-toggle")).toHaveLength(4);
      expect(toggle("H3").getAttribute("aria-pressed")).toBe("false");
      expect(
        button("GeoJSON").parentElement!.querySelector(".preview-toggle"),
      ).toBeNull();
    });

    it("draws the covering's cells, and takes them away again", () => {
      panel.show(polygon);
      toggle("H3").click();
      expect(toggle("H3").getAttribute("aria-pressed")).toBe("true");
      expect(onPreview).toHaveBeenLastCalledWith({
        h3: coverage.h3Coverage(polygon, 5),
      });
      toggle("S2").click();
      expect(Object.keys(onPreview.mock.lastCall![0])).toEqual(["h3", "s2"]);
      toggle("H3").click();
      expect(Object.keys(onPreview.mock.lastCall![0])).toEqual(["s2"]);
    });

    it("clears them when the panel closes", () => {
      panel.show(polygon);
      toggle("H3").click();
      panel.hide();
      expect(onPreview).toHaveBeenLastCalledWith({});
    });

    it("clears them for something else, and keeps them for the same thing changed", () => {
      const moved: Geometry = {
        type: "Polygon",
        coordinates: [
          [
            [10, 10],
            [12, 10],
            [12, 12],
            [10, 10],
          ],
        ],
      };
      panel.show(polygon, { key: "feature:a" });
      toggle("H3").click();

      panel.show(moved, { key: "feature:a" });
      expect(onPreview).toHaveBeenLastCalledWith({
        h3: coverage.h3Coverage(moved, 5),
      });
      expect(toggle("H3").getAttribute("aria-pressed")).toBe("true");

      panel.show(polygon, { key: "feature:b" });
      expect(onPreview).toHaveBeenLastCalledWith({});
      expect(toggle("H3").getAttribute("aria-pressed")).toBe("false");
    });

    describe("as grid levels change", () => {
      let resolutions: { h3: number; quadkey: number; s2: number; a5: number };

      beforeEach(() => {
        document.body.replaceChildren();
        resolutions = { h3: 5, quadkey: 8, s2: 9, a5: 8 };
        panel = new FeaturePanel(
          document.body,
          () => resolutions,
          () => "metric",
          onPreview,
        );
      });

      it("relabels the coverings", () => {
        panel.show(polygon, { key: "feature:a" });
        resolutions = { h3: 6, quadkey: 9, s2: 10, a5: 9 };
        panel.refresh();
        expect(labels().slice(-4)).toEqual([
          "H3 (res 6)",
          "Quadkey (zoom 9)",
          "S2 (level 10)",
          "A5 (res 9)",
        ]);
      });

      it("redraws previews on, at the new level", () => {
        panel.show(polygon, { key: "feature:a" });
        toggle("H3").click();
        resolutions = { ...resolutions, h3: 6 };
        panel.refresh();
        expect(onPreview).toHaveBeenLastCalledWith({
          h3: coverage.h3Coverage(polygon, 6),
        });
        expect(toggle("H3").getAttribute("aria-pressed")).toBe("true");
      });

      it("keeps a preview on through a level too fine to draw, and draws it again once back", () => {
        panel.show(polygon, { key: "feature:a" });
        toggle("H3").click();

        resolutions = { ...resolutions, h3: 15 };
        panel.refresh();
        expect(onPreview).toHaveBeenLastCalledWith({});
        expect(toggle("H3").getAttribute("aria-pressed")).toBe("true");
        expect(toggle("H3").classList.contains("unavailable")).toBe(true);
        expect(toggle("H3").title).toBe("Too many cells to show at this level");

        resolutions = { ...resolutions, h3: 5 };
        panel.refresh();
        expect(onPreview).toHaveBeenLastCalledWith({
          h3: coverage.h3Coverage(polygon, 5),
        });
        expect(toggle("H3").classList.contains("unavailable")).toBe(false);
      });

      it("turns an unavailable preview off with one click", () => {
        panel.show(polygon, { key: "feature:a" });
        toggle("H3").click();
        resolutions = { ...resolutions, h3: 15 };
        panel.refresh();
        toggle("H3").click();
        expect(toggle("H3").getAttribute("aria-pressed")).toBe("false");
        resolutions = { ...resolutions, h3: 5 };
        panel.refresh();
        expect(onPreview).toHaveBeenLastCalledWith({});
      });
    });

    it("refuses coverings too big to draw, and says so", () => {
      const huge: Geometry = {
        type: "Polygon",
        coordinates: [
          [
            [-10, 35],
            [5, 35],
            [5, 45],
            [-10, 35],
          ],
        ],
      };
      panel = new FeaturePanel(
        document.body,
        () => ({ h3: 15, quadkey: 23, s2: 24, a5: 30 }),
        () => "metric",
        onPreview,
      );
      panel.show(huge);
      toggle("S2").click();
      expect(toggle("S2").getAttribute("aria-pressed")).toBe("false");
      expect(status(button("S2"))).toBe("Too many cells to show");
      expect(onPreview).not.toHaveBeenCalledWith(
        expect.objectContaining({ s2: expect.anything() }),
      );
    });
  });

  it("copies the geometry in each format", async () => {
    panel.show(polygon);
    expect(await copied(button("GeoJSON"))).toBe(JSON.stringify(polygon));
    expect(await copied(button("Well Known"))).toBe(
      "POLYGON ((0 0, 2 0, 2 2, 0 0))",
    );
    expect(await copied(button("Bounding"))).toBe("0,0,2,2");
    expect(await copied(button("Center (lng"))).toBe("1,1");
    expect(await copied(button("Center (lat"))).toBe("1,1");
  });

  it("flips the coordinates for lat/lng", async () => {
    panel.show(point);
    expect(await copied(button("Lng/Lat"))).toBe("1,2");
    expect(await copied(button("Lat/Lng"))).toBe("2,1");
  });

  it("computes coverings on click, not on show", async () => {
    const h3Coverage = vi.spyOn(coverage, "h3Coverage");
    panel.show(polygon);
    expect(h3Coverage).not.toHaveBeenCalled();
    await copied(button("H3"));
    expect(h3Coverage).toHaveBeenCalledWith(polygon, 5);
  });

  it("opens instantly for geometry too big to cover, and explains on click", async () => {
    const huge: Geometry = {
      type: "Polygon",
      coordinates: [
        [
          [-10, 35],
          [5, 35],
          [5, 45],
          [-10, 35],
        ],
      ],
    };
    panel = new FeaturePanel(document.body, () => ({
      h3: 15,
      quadkey: 23,
      s2: 24,
      a5: 30,
    }));
    panel.show(huge);

    const s2 = button("S2");
    s2.click();

    await vi.waitFor(() =>
      expect(status(s2)).toBe("Too many cells: lower the resolution"),
    );
    expect(s2.dataset.state).toBe("failed");
    expect(copyText).not.toHaveBeenCalled();
  });

  it("confirms a copy on the button, then goes back to normal", async () => {
    vi.useFakeTimers();
    panel.show(polygon);
    const copy = button("GeoJSON");

    copy.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(status(copy)).toBe("Copied");
    expect(copy.dataset.state).toBe("copied");

    await vi.advanceTimersByTimeAsync(1200);
    expect(status(copy)).toBe("");
    expect(copy.dataset.state).toBeUndefined();
    vi.useRealTimers();
  });

  it("reports clipboard failures", async () => {
    vi.useFakeTimers();
    vi.mocked(copyText).mockResolvedValueOnce(false);
    panel.show(polygon);
    const copy = button("GeoJSON");

    copy.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(status(copy)).toBe("Failed to copy");
    expect(copy.dataset.state).toBe("failed");
    vi.useRealTimers();
  });

  it("keeps the feedback up for the whole time after a double click", async () => {
    vi.useFakeTimers();
    panel.show(polygon);
    const copy = button("GeoJSON");

    copy.click();
    await vi.advanceTimersByTimeAsync(1000);
    copy.click();
    await vi.advanceTimersByTimeAsync(1000);
    expect(status(copy)).toBe("Copied");

    await vi.advanceTimersByTimeAsync(200);
    expect(status(copy)).toBe("");
    vi.useRealTimers();
  });

  it("closes with the close button", () => {
    panel.show(polygon);
    document.querySelector<HTMLElement>(".panel-close")!.click();
    expect(root().hidden).toBe(true);
  });
});

describe("buildDetailsTable", () => {
  const square: Geometry = {
    type: "Polygon",
    coordinates: [
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 0],
      ],
    ],
  };
  const parent = () => [
    { type: "Feature" as const, geometry: square, properties: { id: "03" } },
  ];
  const addButton = (table: HTMLTableElement) =>
    table.querySelector<HTMLButtonElement>('button[aria-label^="Add"]');

  it("cuts long values to a line, with the whole in a tooltip", () => {
    const table = buildDetailsTable([
      { label: "Children (4)", value: "a,b,c,d", truncate: true },
      { label: "Name", value: "Wraps as usual" },
    ])!;
    const [children, name] = [...table.querySelectorAll("td:first-of-type")];
    expect(children.className).toBe("truncate");
    expect((children as HTMLElement).title).toBe("a,b,c,d");
    expect(name.className).toBe("");
  });

  it("links web addresses, opening in a new tab, and nothing else", () => {
    const table = buildDetailsTable([
      { label: "osm_url", value: "https://www.openstreetmap.org/way/12" },
      { label: "sneaky", value: "javascript:alert(1)" },
    ])!;
    const links = table.querySelectorAll("a");
    expect(links).toHaveLength(1);
    expect(links[0].href).toBe("https://www.openstreetmap.org/way/12");
    expect(links[0].target).toBe("_blank");
    expect(links[0].rel).toBe("noopener noreferrer");
    expect(links[0].parentElement!.className).toBe("truncate");
    expect(table.rows[1].cells[1].textContent).toBe("javascript:alert(1)");
  });

  it("links a value to where its row says, keeping the value as the text", () => {
    const table = buildDetailsTable([
      {
        label: "osm",
        value: "relation/5326784",
        href: "https://www.openstreetmap.org/relation/5326784",
      },
    ])!;
    const link = table.querySelector("a")!;
    expect(link.textContent).toBe("relation/5326784");
    expect(link.href).toBe("https://www.openstreetmap.org/relation/5326784");
    expect(link.target).toBe("_blank");
  });

  it("adds a row's features with its + button, and shows it", () => {
    const addToMap = vi.fn(() => ({ added: 1 }));
    const table = buildDetailsTable(
      [{ label: "Parent", value: "03", features: parent }],
      addToMap,
    )!;
    addButton(table)!.click();
    expect(addToMap).toHaveBeenCalledWith(parent());
    expect(addButton(table)!.dataset.state).toBe("copied");
  });

  it("says when nothing could be added", () => {
    const table = buildDetailsTable(
      [{ label: "Parent", value: "03", features: parent }],
      () => ({ added: 0 }),
    )!;
    addButton(table)!.click();
    expect(addButton(table)!.dataset.state).toBe("failed");
  });

  it("keeps showing a recent add through a redraw", () => {
    const recentlyAdded = new Map<string, number>();
    const rows = [{ label: "Parent", value: "03", features: parent }];
    const addToMap = () => ({ added: 1 });
    addButton(buildDetailsTable(rows, addToMap, recentlyAdded)!)!.click();
    const redrawn = buildDetailsTable(rows, addToMap, recentlyAdded)!;
    expect(addButton(redrawn)!.dataset.state).toBe("copied");
  });

  it("has no + without features or a way to add them", () => {
    expect(
      addButton(buildDetailsTable([{ label: "ID", value: "1" }], vi.fn())!),
    ).toBeNull();
    expect(
      addButton(
        buildDetailsTable([
          { label: "Parent", value: "03", features: parent },
        ])!,
      ),
    ).toBeNull();
  });
});
