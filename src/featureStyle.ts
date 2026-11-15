import type { Map as MapLibreMap } from "maplibre-gl";
import type { GeoJSONStoreFeatures, HexColor } from "terra-draw";
import type { GeoJsonProperties } from "geojson";

/**
 * How a feature looks, beyond Terra Draw's defaults. GeoJSON has no place for it, so it travels
 * in properties under a `gw:` prefix: exported files bring it back when added again.
 */
export interface FeatureStyle {
  /** #rgb or #rrggbb, for the whole feature. */
  color?: HexColor;
  /** Shown in place of a point's dot. Other geometries keep it, unshown, so it isn't lost. */
  emoji?: string;
}

export const COLOR_PROPERTY = "gw:color";
export const EMOJI_PROPERTY = "gw:emoji";

/** Terra Draw's own blue, which features without a color of their own are drawn in. */
export const DEFAULT_COLOR = "#3f97e0";

export const isHexColor = (value: unknown): value is HexColor =>
  typeof value === "string" && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value);

/** Long enough for any emoji, family and flag sequences included, short enough to keep text out. */
const MAX_EMOJI_LENGTH = 32;

const isEmoji = (value: unknown): value is string =>
  typeof value === "string" &&
  value.trim() !== "" &&
  value.length <= MAX_EMOJI_LENGTH;

/**
 * Splits a feature's style out of its properties. A value that can't be one (a color that isn't
 * hex, say) stays among the properties, as data the file had.
 */
export function readStyle(properties: GeoJsonProperties): {
  style: FeatureStyle;
  rest: GeoJsonProperties;
} {
  if (!properties) return { style: {}, rest: properties };
  const {
    [COLOR_PROPERTY]: color,
    [EMOJI_PROPERTY]: emoji,
    ...rest
  } = properties;
  const style: FeatureStyle = {
    ...(isHexColor(color) && { color }),
    ...(isEmoji(emoji) && { emoji: emoji.trim() }),
  };
  return {
    style,
    rest: {
      ...rest,
      ...(color !== undefined && !style.color && { [COLOR_PROPERTY]: color }),
      ...(emoji !== undefined && !style.emoji && { [EMOJI_PROPERTY]: emoji }),
    },
  };
}

/** A stored feature's style, as the map holds it. */
export function featureStyle(feature: GeoJSONStoreFeatures): FeatureStyle {
  const { color, emoji } = feature.properties;
  return {
    ...(isHexColor(color) && { color }),
    ...(isEmoji(emoji) && { emoji }),
  };
}

/** The style back as properties, for export. */
export function styleProperties({
  color,
  emoji,
}: FeatureStyle): Record<string, string> {
  return {
    ...(color && { [COLOR_PROPERTY]: color }),
    ...(emoji && { [EMOJI_PROPERTY]: emoji }),
  };
}

// Style functions for Terra Draw's modes. Undefined leaves Terra Draw's default in place.
const color = (feature: GeoJSONStoreFeatures) => featureStyle(feature).color;

/** Relative luminance, 0 for black to 1 for white. */
export function luminance(hex: HexColor): number {
  const digits =
    hex.length === 4
      ? Array.from(hex.slice(1), (d) => d + d)
      : [1, 3, 5].map((i) => hex.slice(i, i + 2));
  const [r, g, b] = digits.map((d) => {
    const c = parseInt(d, 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Terra Draw rings points in white, which a white or near-white dot needs swapped to be seen. */
const LIGHT_OUTLINE = "#5b6570";
const pointOutlineColor = (feature: GeoJSONStoreFeatures) => {
  const { color } = featureStyle(feature);
  return color && luminance(color) > 0.7 ? LIGHT_OUTLINE : undefined;
};

/**
 * A point with an emoji leaves its dot to be clicked, but not seen. Terra Draw styles each point
 * just before handing it to the map, which makes it the moment to ready its emoji's image.
 */
export function pointStyles(readyEmoji: (emoji: string) => void = () => {}) {
  const dotOpacity = (feature: GeoJSONStoreFeatures) => {
    const { emoji } = featureStyle(feature);
    if (!emoji) return undefined;
    readyEmoji(emoji);
    return 0;
  };
  return {
    pointColor: color,
    pointOutlineColor,
    pointOpacity: dotOpacity,
    pointOutlineOpacity: dotOpacity,
  };
}
export const LINE_STYLES = { lineStringColor: color };
export const POLYGON_STYLES = {
  fillColor: color,
  outlineColor: color,
};

/** Terra Draw's point source and layer, which the emoji are drawn from and over. */
const POINT_SOURCE = "td-point";
export const EMOJI_LAYER = "gw-emoji";
const IMAGE_PREFIX = "gw-emoji:";
/** On screen, in CSS pixels. */
const EMOJI_SIZE = 28;
/** Drawn at twice the size, sharp on high-density screens. */
const PIXEL_RATIO = 2;
const EMOJI_FONTS =
  '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Twemoji Mozilla", sans-serif';

/** An emoji as an image, as MapLibre's glyphs have none: the system's own emoji font, on a canvas. */
export function renderEmoji(emoji: string): ImageData | null {
  const size = EMOJI_SIZE * PIXEL_RATIO;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.font = `${Math.round(size * 0.82)}px ${EMOJI_FONTS}`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  // Emoji fonts sit a little high on the middle baseline.
  context.fillText(emoji, size / 2, size * 0.54);
  return context.getImageData(0, 0, size, size);
}

/**
 * Adds an emoji's image, if the map doesn't have it yet. It must be there before a point shows
 * the emoji: MapLibre lays the point out without an image that's missing, and an image added
 * from its styleimagemissing event then may never show.
 */
export function readyEmojiImage(map: MapLibreMap, emoji: string): void {
  const id = IMAGE_PREFIX + emoji;
  if (map.hasImage(id)) return;
  const image = renderEmoji(emoji);
  if (image) map.addImage(id, image, { pixelRatio: PIXEL_RATIO });
}

/**
 * Emoji over the points that have one, read from Terra Draw's own point source, so they follow
 * every edit and drag with no copy to keep in step.
 *
 * Terra Draw adds its sources some time after the map loads: the layer follows once its source
 * is there, above Terra Draw's own point layer, added just before. Basemap swaps carry it over,
 * but not the images, which are made again for the emoji the new style asks for.
 */
export function addEmojiLayer(map: MapLibreMap): void {
  map.on("styleimagemissing", ({ id }) => {
    if (id.startsWith(IMAGE_PREFIX))
      readyEmojiImage(map, id.slice(IMAGE_PREFIX.length));
  });
  const addLayer = () => {
    if (map.getLayer(EMOJI_LAYER) || !map.getLayer(POINT_SOURCE)) return;
    map.addLayer({
      id: EMOJI_LAYER,
      type: "symbol",
      source: POINT_SOURCE,
      // Selection handles and the like are points too, but never carry one.
      filter: ["has", "emoji"],
      layout: {
        "icon-image": ["concat", IMAGE_PREFIX, ["get", "emoji"]],
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      },
    });
  };
  map.on("styledata", addLayer);
  addLayer();
}
