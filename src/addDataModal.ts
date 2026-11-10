import { wktToGeoJSON } from "@terraformer/wkt";
import { arcgisToFeatures, isArcGIS, UnsupportedDataError } from "./arcgis";
import { buildFormatsHelp } from "./addDataFormats";
import { parseCellIds } from "./cellIds";
import type { Feature, GeoJSON, Geometry } from "geojson";

export interface AddResult {
  added: number;
  rejected: number;
}

export class AddDataModal {
  private root: HTMLElement;
  private textarea: HTMLTextAreaElement;
  private error: HTMLElement;
  private onSubmit: (features: Feature[]) => AddResult;

  constructor(
    container: HTMLElement,
    onSubmit: (features: Feature[]) => AddResult,
  ) {
    this.onSubmit = onSubmit;

    this.root = document.createElement("div");
    this.root.className = "modal-overlay";
    this.root.hidden = true;
    this.root.addEventListener("click", (e) => {
      if (e.target === this.root) this.hide();
    });

    const dialog = document.createElement("div");
    dialog.className = "modal";

    const heading = document.createElement("h2");
    heading.textContent = "Add data";
    dialog.appendChild(heading);

    const hint = document.createElement("p");
    hint.textContent =
      "Paste geometries (GeoJSON, WKT, Esri JSON), bounding boxes, coordinates or cell IDs.";
    dialog.appendChild(hint);

    this.textarea = document.createElement("textarea");
    this.textarea.rows = 8;
    this.textarea.placeholder =
      'POINT (-3 40)\n{"type":"Point","coordinates":[-3,40]}\n-3.8 40.3 -3.5 40.6\n40.4168, -3.7038';
    dialog.appendChild(this.textarea);

    dialog.appendChild(
      buildFormatsHelp((example) => {
        this.textarea.value = example;
        this.error.hidden = true;
        this.textarea.focus();
      }),
    );

    this.error = document.createElement("p");
    this.error.className = "modal-error";
    this.error.hidden = true;
    dialog.appendChild(this.error);

    const actions = document.createElement("div");
    actions.className = "modal-actions";

    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.textContent = "Cancel";
    cancelButton.addEventListener("click", () => this.hide());

    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.className = "primary";
    addButton.textContent = "Add";
    addButton.addEventListener("click", () => this.submit());

    actions.append(cancelButton, addButton);
    dialog.appendChild(actions);

    this.root.appendChild(dialog);
    container.appendChild(this.root);
  }

  show(): void {
    this.textarea.value = "";
    this.error.hidden = true;
    this.root.hidden = false;
    this.textarea.focus();
  }

  isHidden(): boolean {
    return Boolean(this.root.hidden);
  }

  hide(): void {
    this.root.hidden = true;
  }

  private showError(message: string): void {
    this.error.textContent = message;
    this.error.hidden = false;
  }

  /**
   * Adds text pasted straight onto the map, as if submitted here, without opening the dialog
   * unless something went wrong: then it shows what, with the text to fix if none was added.
   */
  addPasted(text: string): void {
    if (!text.trim()) return;
    const outcome = this.add(text);
    if (outcome.result === "added") return;
    this.show();
    if (outcome.result === "failed") this.textarea.value = text.trim();
    this.showError(outcome.message);
  }

  private submit(): void {
    const text = this.textarea.value;
    if (!text.trim()) return;
    const outcome = this.add(text);
    if (outcome.result === "added") {
      this.hide();
      return;
    }
    // What was added is on the map now; clear it so it isn't added twice.
    if (outcome.result === "partial") this.textarea.value = "";
    this.showError(outcome.message);
  }

  private add(
    text: string,
  ): { result: "added" } | { result: "partial" | "failed"; message: string } {
    let features: Feature[];
    try {
      features = parseFeatures(text.trim());
    } catch (error) {
      if (!(error instanceof UnsupportedDataError)) throw error;
      return { result: "failed", message: error.message };
    }
    const { added, rejected } =
      features.length > 0 ? this.onSubmit(features) : { added: 0, rejected: 0 };
    if (added === 0)
      return {
        result: "failed",
        message:
          "Could not parse that as WKT, GeoJSON, Esri JSON, a bounding box, coordinates or cell IDs.",
      };
    if (rejected > 0)
      return {
        result: "partial",
        message: `Skipped ${rejected} of ${features.length} features with invalid geometry.`,
      };
    return { result: "added" };
  }
}

/** Throws UnsupportedDataError for data it recognises but can't show, such as Esri JSON in an unknown projection. */
export function parseFeatures(text: string): Feature[] {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    // Not JSON, fall through to WKT.
  }
  // Bare numbers and strings are JSON too, but read better as cell IDs and the like.
  if (json !== undefined && typeof json === "object") {
    if (isBboxArray(json)) {
      const bbox = bboxFeature(json);
      return bbox ? [bbox] : [];
    }
    if (
      isArcGIS(json) ||
      (Array.isArray(json) && json.length > 0 && json.every(isArcGIS))
    )
      return arcgisToFeatures(json);
    return isObject(json) ? geoJsonToFeatures(json as GeoJSON) : [];
  }

  try {
    return [toFeature(wktToGeoJSON(text))];
  } catch {
    // Not WKT, fall through to bounding boxes and coordinates.
  }

  const coordinates = parseCoordinateLines(text);
  if (coordinates.length > 0) return coordinates;
  return parseCellIds(text) ?? [];
}

const isBboxArray = (value: unknown): value is number[] =>
  Array.isArray(value) &&
  value.length === 4 &&
  value.every((n) => typeof n === "number");

/** GDAL-style option flags and ogrinfo's "Extent:" label that may precede a bbox. */
const BBOX_PREFIX = /^(?:-te|-spat|-projwin|extent:)\s*/i;
const NUMBER = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i;

/**
 * Each line is either a bounding box with four numbers, or a comma-separated
 * "lat, lng" pair. Bboxes accept GDAL's -te/-spat (xmin ymin xmax ymax),
 * -projwin (ulx uly lrx lry) and ogrinfo's "Extent: (xmin, ymin) - (xmax, ymax)",
 * since taking the min and max of each axis makes the corner order irrelevant.
 * Any line that fits neither rejects the whole input.
 */
function parseCoordinateLines(text: string): Feature[] {
  const features: Feature[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim().replace(BBOX_PREFIX, "");
    if (!line) continue;

    const tokens = line.split(/[\s,()]+/).filter((t) => t && t !== "-");
    if (!tokens.every((t) => NUMBER.test(t))) return [];
    const numbers = tokens.map(Number);

    if (numbers.length === 4) {
      const bbox = bboxFeature(numbers);
      if (!bbox) return [];
      features.push(bbox);
    } else if (numbers.length === 2 && line.includes(",")) {
      const [lat, lng] = numbers;
      if (!validLngLat(lng, lat)) return [];
      features.push(toFeature({ type: "Point", coordinates: [lng, lat] }));
    } else {
      return [];
    }
  }
  return features;
}

const validLngLat = (lng: number, lat: number) =>
  Math.abs(lng) <= 180 && Math.abs(lat) <= 90;

/** A rectangle from two opposite corners in any order, or null if it is empty or off the globe. */
function bboxFeature([x1, y1, x2, y2]: number[]): Feature | null {
  const [west, east] = [Math.min(x1, x2), Math.max(x1, x2)];
  const [south, north] = [Math.min(y1, y2), Math.max(y1, y2)];
  if (west === east || south === north) return null;
  if (!validLngLat(west, south) || !validLngLat(east, north)) return null;
  return toFeature({
    type: "Polygon",
    coordinates: [
      [
        [west, south],
        [east, south],
        [east, north],
        [west, north],
        [west, south],
      ],
    ],
  });
}

const isObject = (value: unknown): value is object =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function geoJsonToFeatures(geojson: GeoJSON): Feature[] {
  switch (geojson.type) {
    case "FeatureCollection":
      return Array.isArray(geojson.features)
        ? geojson.features.filter((feature) => feature?.geometry)
        : [];
    case "Feature":
      return geojson.geometry ? [geojson] : [];
    default:
      return "coordinates" in Object(geojson) || "geometries" in Object(geojson)
        ? [toFeature(geojson)]
        : [];
  }
}

function toFeature(geometry: Geometry): Feature {
  return { type: "Feature", geometry, properties: null };
}
