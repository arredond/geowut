import { describe, expect, it, vi } from "vitest";
import { buildFormatsHelp } from "./addDataFormats";
import { parseFeatures } from "./addDataModal";

describe("buildFormatsHelp", () => {
  const help = buildFormatsHelp(() => {});
  const examples = [
    ...help.querySelectorAll<HTMLButtonElement>(".format-example"),
  ].map((button) => button.textContent!);

  it("starts folded, behind a question", () => {
    expect(help.open).toBe(false);
    expect(help.querySelector("summary")!.textContent).toBe(
      "What can I paste?",
    );
  });

  it("covers every kind of input, the prefixes and the caveats", () => {
    const terms = [...help.querySelectorAll("dt")].map((dt) => dt.textContent);
    expect(terms).toEqual([
      "GeoJSON",
      "WKT",
      "Esri JSON",
      "Bounding box",
      "Lat, lng",
      "H3",
      "S2",
      "A5",
      "XYZ",
      "Prefixes",
    ]);
    expect(help.textContent).toMatch(/h3:, s2:, a5: or xyz:/);
    expect(help.querySelectorAll("li").length).toBeGreaterThan(3);
  });

  // Examples that don't parse would be worse than none.
  it.each(examples)("has an example that works: %s", (example) => {
    expect(parseFeatures(example).length).toBeGreaterThan(0);
  });

  it("reads each cell example as the grid it's listed under", () => {
    const gridOf = (example: string) =>
      (parseFeatures(example)[0].properties as { grid?: string }).grid;
    const under = (term: string) =>
      [...help.querySelectorAll("dt")]
        .find((dt) => dt.textContent === term)!
        .nextElementSibling!.querySelectorAll(".format-example");
    for (const [term, grid] of [
      ["H3", "h3"],
      ["S2", "s2"],
      ["A5", "a5"],
      ["XYZ", "xyz"],
    ])
      for (const button of under(term))
        expect(gridOf(button.textContent!)).toBe(grid);
    // The prefix example is an ID S2 would otherwise claim.
    expect(gridOf("4c5a2698a737e82c")).toBe("s2");
    expect(gridOf("a5:4c5a2698a737e82c")).toBe("a5");
  });

  it("hands over an example when clicked", () => {
    const onExample = vi.fn();
    const withHandler = buildFormatsHelp(onExample);
    withHandler.querySelector<HTMLButtonElement>(".format-example")!.click();
    expect(onExample).toHaveBeenCalledWith(examples[0]);
  });
});
