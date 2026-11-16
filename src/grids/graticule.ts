import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import type { Feature, FeatureCollection, LineString } from "geojson";
import { getPaddedViewportBbox } from "../map";
import type { Bbox } from "./types";

/** Spacings between lines, in degrees, coarsest first: round numbers, as on printed maps. */
export const GRATICULE_STEPS = [
  30, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01, 0.005, 0.002, 0.001,
];

/** About how far apart lines should be on screen, in pixels. */
const TARGET_SPACING_PX = 150;
/** The world's width at zoom 0, in pixels, as MapLibre draws it. */
const WORLD_PX = 512;

/** The finest round spacing that keeps lines at least TARGET_SPACING_PX apart at this zoom. */
export function graticuleStep(zoom: number): number {
  const target = (TARGET_SPACING_PX * 360) / (WORLD_PX * 2 ** zoom);
  return (
    GRATICULE_STEPS.findLast((step) => step >= target) ?? GRATICULE_STEPS[0]
  );
}

/** Decimals that a spacing needs written out, as 2 for 0.05. */
const decimals = (step: number) => String(step).split(".")[1]?.length ?? 0;

/** A line's value as maps label it: 40°N, 3.5°W, 0°. */
export function formatDegrees(
  value: number,
  axis: "lat" | "lng",
  step: number,
): string {
  const text = `${Math.abs(value).toFixed(decimals(step))}°`;
  if (value === 0 || Math.abs(value) === 180) return text;
  const [positive, negative] = axis === "lat" ? ["N", "S"] : ["E", "W"];
  return text + (value > 0 ? positive : negative);
}

/** Lines curve on the globe, so they get a point at least this often, in degrees. */
const MAX_SEGMENT_DEG = 2;

/** Values from a to b every step, snapped to round multiples, without floating-point drift. */
function multiples(from: number, to: number, step: number): number[] {
  const values: number[] = [];
  const places = decimals(step);
  for (let i = Math.ceil(from / step); i * step <= to + 1e-9; i++)
    values.push(Number((i * step).toFixed(places)));
  return values;
}

/** from to to in pieces no longer than MAX_SEGMENT_DEG, ends included. */
function span(from: number, to: number): number[] {
  const pieces = Math.max(1, Math.ceil((to - from) / MAX_SEGMENT_DEG));
  return Array.from(
    { length: pieces + 1 },
    (_, i) => from + ((to - from) * i) / pieces,
  );
}

type GraticuleLine = Feature<
  LineString,
  { axis: "lat" | "lng"; value: number; label: string }
>;

/**
 * How far towards the poles lines go, in degrees: the last parallel of the step below 85°, and
 * no less than 80°, drawn even off the step. MapLibre can't draw lines past Web Mercator's edge
 * at 85.05°, even on the globe, so the meridians end on a parallel there, as on printed maps,
 * rather than stopping short of the pole at nothing in particular.
 */
export function polarLimit(step: number): number {
  const last = Math.floor(85 / step + 1e-9) * step;
  return Math.max(80, Number(last.toFixed(decimals(step))));
}

/** Meridians and parallels every step across a bbox, up to the polar limit. */
export function graticuleLines(
  [west, south, east, north]: Bbox,
  step: number,
): FeatureCollection<LineString, GraticuleLine["properties"]> {
  const limit = polarLimit(step);
  const [bottom, top] = [Math.max(south, -limit), Math.min(north, limit)];
  const line = (
    axis: "lat" | "lng",
    value: number,
    coordinates: number[][],
  ): GraticuleLine => ({
    type: "Feature",
    geometry: { type: "LineString", coordinates },
    properties: { axis, value, label: formatDegrees(value, axis, step) },
  });

  // Longitudes past ±180 are the same meridians again, labelled as such.
  const meridians = multiples(west, east, step)
    .filter((lng) => east - west < 360 || lng < west + 360)
    .map((lng) => {
      const wrapped = ((((lng + 180) % 360) + 360) % 360) - 180;
      const value = wrapped === -180 && lng > 0 ? 180 : wrapped;
      return line(
        "lng",
        Number(value.toFixed(decimals(step))),
        span(bottom, top).map((lat) => [lng, lat]),
      );
    });
  if (bottom > top) return { type: "FeatureCollection", features: [] };
  const lats = new Set(multiples(bottom, top, step));
  for (const edge of [-limit, limit])
    if (edge >= bottom && edge <= top) lats.add(edge);
  const parallels = [...lats]
    .sort((a, b) => a - b)
    .map((lat) =>
      line(
        "lat",
        lat,
        span(west, east).map((lng) => [lng, lat]),
      ),
    );
  return { type: "FeatureCollection", features: [...meridians, ...parallels] };
}

/** The graticule's color: a quiet grey that reads over light and dark basemaps alike. */
export const GRATICULE_COLOR = "#7d8794";

/** An outlined globe with a meridian and the equator, for the graticule's switch. */
export const GRATICULE_SHAPE =
  '<circle cx="8" cy="8" r="6.2"/><path d="M8 1.8C5.4 4.3 5.4 11.7 8 14.2M8 1.8c2.6 2.5 2.6 9.9 0 12.4M1.8 8h12.4" fill="none" stroke-width="1"/>';

const SOURCE_ID = "grid-graticule";
const LINE_LAYER_ID = `${SOURCE_ID}-line`;
const LABEL_LAYER_ID = `${SOURCE_ID}-label`;

const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };

/**
 * Lines of latitude and longitude. Unlike the grids, it has no cells or levels to pick: its
 * spacing follows the zoom, always at round numbers of degrees.
 */
export class Graticule {
  private map: MapLibreMap;
  visible = false;
  step: number;
  private labelHalo = "#ffffff";
  onStepChange?: (step: number) => void;

  constructor(map: MapLibreMap) {
    this.map = map;
    this.step = graticuleStep(map.getZoom());
  }

  addToMap(): void {
    this.map.addSource(SOURCE_ID, { type: "geojson", data: EMPTY });
    this.map.addLayer({
      id: LINE_LAYER_ID,
      type: "line",
      source: SOURCE_ID,
      layout: { visibility: "none" },
      paint: {
        "line-color": GRATICULE_COLOR,
        "line-opacity": 0.8,
        // The equator and the prime meridian stand out, as on most maps.
        "line-width": ["case", ["==", ["get", "value"], 0], 1.6, 0.8],
      },
    });
    this.map.addLayer({
      id: LABEL_LAYER_ID,
      type: "symbol",
      source: SOURCE_ID,
      layout: {
        visibility: "none",
        "symbol-placement": "line",
        "symbol-spacing": 400,
        "text-field": ["get", "label"],
        // MapLibre's default font isn't on OpenFreeMap's glyph server, which every basemap uses.
        "text-font": ["Noto Sans Regular"],
        "text-size": 10,
      },
      paint: {
        "text-color": GRATICULE_COLOR,
        "text-halo-color": this.labelHalo,
        "text-halo-width": 1.2,
      },
    });
  }

  /** Labels stand out from the basemap with a halo of its own lightness. */
  setLabelHalo(color: string): void {
    this.labelHalo = color;
    if (this.map.getLayer(LABEL_LAYER_ID))
      this.map.setPaintProperty(LABEL_LAYER_ID, "text-halo-color", color);
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    for (const id of [LINE_LAYER_ID, LABEL_LAYER_ID])
      this.map.setLayoutProperty(
        id,
        "visibility",
        visible ? "visible" : "none",
      );
    if (visible) this.refresh();
    else this.source()?.setData(EMPTY);
  }

  /** Lines for the view at the spacing its zoom calls for. */
  refresh(): void {
    const step = graticuleStep(this.map.getZoom());
    if (step !== this.step) {
      this.step = step;
      this.onStepChange?.(step);
    }
    if (!this.visible) return;
    this.source()?.setData(
      graticuleLines(getPaddedViewportBbox(this.map), step),
    );
  }

  private source(): GeoJSONSource | undefined {
    return this.map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
  }
}
