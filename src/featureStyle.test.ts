import { describe, expect, it, vi } from "vitest";
import type { GeoJSONStoreFeatures } from "terra-draw";
import {
  featureStyle,
  luminance,
  pointStyles,
  POLYGON_STYLES,
  readStyle,
  styleProperties,
} from "./featureStyle";

const stored = (properties: Record<string, unknown>) =>
  ({ properties }) as unknown as GeoJSONStoreFeatures;

describe("readStyle", () => {
  it("lifts gw: properties out of the rest", () => {
    expect(
      readStyle({ name: "Bar", "gw:color": "#e5484d", "gw:emoji": "🍺" }),
    ).toEqual({
      style: { color: "#e5484d", emoji: "🍺" },
      rest: { name: "Bar" },
    });
  });

  it("leaves values that can't be a style among the properties", () => {
    expect(readStyle({ "gw:color": "red", "gw:emoji": "" })).toEqual({
      style: {},
      rest: { "gw:color": "red", "gw:emoji": "" },
    });
    expect(readStyle({ "gw:emoji": "x".repeat(40) }).style).toEqual({});
  });

  it("takes no properties as no style", () => {
    expect(readStyle(null)).toEqual({ style: {}, rest: null });
  });
});

describe("styleProperties", () => {
  it("round-trips with readStyle", () => {
    const style = { color: "#abc" as const, emoji: "👨‍👩‍👧" };
    expect(readStyle(styleProperties(style)).style).toEqual(style);
    expect(styleProperties({})).toEqual({});
  });
});

describe("luminance", () => {
  it("runs from black to white, short hex included", () => {
    expect(luminance("#000000")).toBe(0);
    expect(luminance("#fff")).toBeCloseTo(1);
    expect(luminance("#ffc53d")).toBeGreaterThan(luminance("#8e4ec6"));
  });
});

describe("Terra Draw styles", () => {
  it("draws features in their color, or Terra Draw's", () => {
    expect(POLYGON_STYLES.fillColor(stored({ color: "#123456" }))).toBe(
      "#123456",
    );
    expect(POLYGON_STYLES.fillColor(stored({}))).toBeUndefined();
  });

  it("hides the dot of a point with an emoji, readying its image", () => {
    const readyEmoji = vi.fn();
    const styles = pointStyles(readyEmoji);
    expect(styles.pointOpacity(stored({ emoji: "⭐" }))).toBe(0);
    expect(readyEmoji).toHaveBeenCalledWith("⭐");
    expect(styles.pointOpacity(stored({}))).toBeUndefined();
  });

  it("rings light points in gray, as Terra Draw's white ring would hide them", () => {
    const styles = pointStyles();
    expect(styles.pointOutlineColor(stored({ color: "#fff" }))).toBe("#5b6570");
    expect(
      styles.pointOutlineColor(stored({ color: "#e5484d" })),
    ).toBeUndefined();
    expect(styles.pointOutlineColor(stored({}))).toBeUndefined();
  });

  it("ignores stored values that aren't a style", () => {
    expect(featureStyle(stored({ color: "blue", emoji: 3 }))).toEqual({});
  });
});
