import {
  TerraDraw,
  TerraDrawCircleMode,
  TerraDrawFreehandMode,
  TerraDrawLineStringMode,
  TerraDrawPointMode,
  TerraDrawPolygonMode,
  TerraDrawRectangleMode,
  TerraDrawRenderMode,
  TerraDrawSelectMode,
  TerraDrawSessionUndoRedo,
} from "terra-draw";
import { TerraDrawMapLibreGLAdapter } from "terra-draw-maplibre-gl-adapter";
import type { Map as MapLibreMap, MapMouseEvent } from "maplibre-gl";
import type { GeoJSONStoreFeatures, GeoJSONStoreGeometries } from "terra-draw";
import type {
  Feature,
  FeatureCollection,
  GeoJsonProperties,
  Geometry,
  Polygon,
  Position,
} from "geojson";
import { circleCenter, measureGeometry } from "./geometry";
import { Measurer, MEASURE_TOOLS } from "./measure";
import type { Measurement, MeasureTool } from "./measure";
import type { Units } from "./units";

type JSONObject = NonNullable<GeoJSONStoreFeatures["properties"][string]>;
type FeatureId = GeoJSONStoreFeatures["id"] & {};

export const TOOLS = [
  "point",
  "linestring",
  "polygon",
  "rectangle",
  "circle",
  "freehand",
] as const;
export type Tool = (typeof TOOLS)[number];

/** 'select' is the resting state: clicks pick features. Everything else returns to it, on Esc at the latest. */
export type DrawState = "select" | "edit" | "delete" | Tool | MeasureTool;

const isMeasureTool = (state: DrawState): state is MeasureTool =>
  MEASURE_TOOLS.includes(state as MeasureTool);

export interface DrawCallbacks {
  onStateChange: (state: DrawState) => void;
  onHistoryChange: (canUndo: boolean, canRedo: boolean) => void;
  /** A feature was just drawn or edited. */
  onFeatureChanged: (feature: GeoJSONStoreFeatures) => void;
  onFeaturesRemoved: () => void;
  /** Fired for clicks in 'select' state, with the feature under the pointer if any. */
  onMapClicked: (
    feature: GeoJSONStoreFeatures | undefined,
    event: MapMouseEvent,
  ) => void;
  /** The current measurement while a measure tool is on, null when there is nothing measured yet. */
  onMeasurementChange: (measurement: Measurement | null) => void;
}

/** Terra Draw's mode for 'select' state: it renders features but leaves clicks to us. */
const IDLE_MODE = "idle";
const EDIT_MODE = "select";

/** Half of freehand's 20px minimum vertex spacing, as Terra Draw starts a drag on any vertex in reach over the midpoint under the pointer. */
const HANDLE_REACH_PX = 10;

const EDITABLE_VERTICES = {
  midpoints: { draggable: true },
  draggable: true,
  deletable: true,
};
const EDIT_FLAGS = {
  point: { feature: { draggable: true } },
  linestring: { feature: { draggable: true, coordinates: EDITABLE_VERTICES } },
  polygon: { feature: { draggable: true, coordinates: EDITABLE_VERTICES } },
  rectangle: {
    feature: {
      draggable: true,
      coordinates: { resizable: "opposite" as const },
    },
  },
  circle: {
    feature: { draggable: true, coordinates: { resizable: "center" as const } },
  },
  freehand: { feature: { draggable: true, coordinates: EDITABLE_VERTICES } },
};

export class DrawController {
  state: DrawState = "select";
  private terraDraw: TerraDraw;
  private measurer: Measurer;
  private callbacks: DrawCallbacks;
  private editedId?: FeatureId;
  private finishingClick = false;

  constructor(map: MapLibreMap, callbacks: DrawCallbacks) {
    this.callbacks = callbacks;
    this.terraDraw = new TerraDraw({
      adapter: new TerraDrawMapLibreGLAdapter({ map }),
      undoRedo: { sessionLevel: new TerraDrawSessionUndoRedo() },
      modes: [
        new TerraDrawRenderMode({ modeName: IDLE_MODE, styles: {} }),
        new TerraDrawPointMode(),
        new TerraDrawLineStringMode(),
        new TerraDrawPolygonMode(),
        new TerraDrawRectangleMode(),
        // Globe: a true circle on the ground, which only looks like one on a Web Mercator map near the equator.
        new TerraDrawCircleMode({ projection: "globe" }),
        new TerraDrawFreehandMode({ drawInteraction: "click-move-or-drag" }),
        // Leaving an edit is ours to decide, so Terra Draw doesn't deselect on its own.
        new TerraDrawSelectMode({
          flags: EDIT_FLAGS,
          pointerDistance: HANDLE_REACH_PX,
          allowManualDeselection: false,
          keyEvents: {
            deselect: null,
            delete: null,
            rotate: null,
            scale: null,
          },
        }),
      ],
    });

    map.once("load", () => {
      this.terraDraw.start();
      this.terraDraw.setMode(IDLE_MODE);
    });

    this.terraDraw.on("finish", (id, { action }) =>
      this.onFinish(id, action === "draw"),
    );
    this.terraDraw.on("history", () => {
      this.callbacks.onHistoryChange(
        this.terraDraw.canUndo(),
        this.terraDraw.canRedo(),
      );
    });
    map.on("click", (e) => this.onClick(e));
    this.measurer = new Measurer(map, (measurement) =>
      this.callbacks.onMeasurementChange(measurement),
    );
  }

  setState(state: DrawState): void {
    if (!this.terraDraw.enabled || state === this.state) return;
    const wasMeasuring = isMeasureTool(this.state);
    this.state = state;
    this.editedId = undefined;
    const passive =
      state === "select" || state === "delete" || isMeasureTool(state);
    this.terraDraw.setMode(
      passive ? IDLE_MODE : state === "edit" ? EDIT_MODE : state,
    );
    if (isMeasureTool(state)) this.measurer.start(state);
    else if (wasMeasuring) this.measurer.stop();
    this.callbacks.onStateChange(state);
  }

  edit(id: FeatureId): void {
    this.setState("edit");
    this.editedId = id;
    this.terraDraw.selectFeature(id);
  }

  /** Remove a feature, along with the rest of the pasted feature it may be a part of. */
  delete(id: FeatureId): void {
    const { sourceId } =
      this.terraDraw.getSnapshotFeature(id)?.properties ?? {};
    const parts = sourceId
      ? this.terraDraw
          .getSnapshot()
          .filter((f) => f.properties.sourceId === sourceId)
      : [];
    this.terraDraw.removeFeatures(sourceId ? parts.map((f) => f.id!) : [id]);
    this.callbacks.onFeaturesRemoved();
  }

  deleteAll(): void {
    this.terraDraw.removeFeatures(
      this.terraDraw.getSnapshot().map((f) => f.id!),
    );
    this.callbacks.onFeaturesRemoved();
  }

  undo(): void {
    if (this.terraDraw.canUndo())
      this.replayHistory(() => this.terraDraw.undo());
  }

  redo(): void {
    if (this.terraDraw.canRedo())
      this.replayHistory(() => this.terraDraw.redo());
  }

  private replayHistory(replay: () => void): void {
    this.setState("select");
    replay();
    this.callbacks.onFeaturesRemoved(); // Whatever was open may be gone or out of date.
  }

  /**
   * Every feature as GeoJSON, as it was given: a pasted geometry the map holds in parts
   * comes back whole (unless a part has since been edited), with its pasted properties.
   */
  exportFeatures(): FeatureCollection {
    return exportCollection(this.terraDraw.getSnapshot());
  }

  /** Add externally-sourced features (from pasted WKT/GeoJSON) to the store. */
  addFeatures(features: Feature[]): {
    added: GeoJSONStoreFeatures[];
    rejected: number;
  } {
    if (!this.terraDraw.enabled)
      return { added: [], rejected: features.length };

    const storeFeatures = features.map(toStoreFeatures);
    const results = this.terraDraw.addFeatures(storeFeatures.flat());

    let index = 0;
    const added: GeoJSONStoreFeatures[] = [];
    let rejected = 0;
    for (const parts of storeFeatures) {
      const accepted = parts.filter(() => results[index++].valid);
      added.push(...accepted);
      if (parts.length === 0 || accepted.length < parts.length) rejected++;
    }
    return { added, rejected };
  }

  private onFinish(id: FeatureId, drawn: boolean): void {
    // A user edit makes the feature the source of truth, so it stops reporting the geometry it was pasted with.
    if (this.terraDraw.getSnapshotFeature(id)?.properties.sourceGeometry) {
      this.terraDraw.updateFeatureProperties(id, { sourceGeometry: undefined });
    }
    if (drawn) {
      this.setState("select");
      // The click that completed the shape is still on its way to onClick. Finishing by keyboard has no such click.
      this.finishingClick = true;
      setTimeout(() => {
        this.finishingClick = false;
      });
    }

    const feature = this.terraDraw.getSnapshotFeature(id);
    if (feature) this.callbacks.onFeatureChanged(feature);
  }

  private onClick(e: MapMouseEvent): void {
    if (
      this.finishingClick ||
      TOOLS.includes(this.state as Tool) ||
      isMeasureTool(this.state)
    )
      return;

    if (this.state === "edit") {
      const under = this.terraDraw.getFeaturesAtLngLat(e.lngLat, {
        ignoreSelectFeatures: false,
        ignoreCoordinatePoints: true,
      });
      const onEditedFeature = under.some(
        (f) =>
          f.id === this.editedId ||
          f.properties.selectionPoint ||
          f.properties.midPoint,
      );
      if (onEditedFeature) return;
      this.setState("select");
    }

    const [feature] = this.terraDraw.getFeaturesAtLngLat(e.lngLat, {
      ignoreCoordinatePoints: true,
    });
    if (this.state === "delete") {
      if (feature) this.delete(feature.id!);
    } else {
      this.callbacks.onMapClicked(feature, e);
    }
  }
}

/** Terra Draw rejects coordinates finer than this, or with an altitude. */
const COORDINATE_PRECISION = 1e9;

function toPosition([lng, lat]: Position): Position {
  return [
    Math.round(lng * COORDINATE_PRECISION) / COORDINATE_PRECISION,
    Math.round(lat * COORDINATE_PRECISION) / COORDINATE_PRECISION,
  ];
}

/** Terra Draw only stores Point/LineString/hole-free Polygon geometries; reduce anything else to those. */
function toDrawableGeometries(
  geometry: Geometry,
): { mode: string; geometry: GeoJSONStoreGeometries }[] {
  switch (geometry.type) {
    case "Point":
      return [
        {
          mode: "point",
          geometry: {
            type: "Point",
            coordinates: toPosition(geometry.coordinates),
          },
        },
      ];
    case "LineString":
      return [
        {
          mode: "linestring",
          geometry: {
            type: "LineString",
            coordinates: geometry.coordinates.map(toPosition),
          },
        },
      ];
    case "Polygon":
      return [
        {
          mode: "polygon",
          geometry: {
            type: "Polygon",
            coordinates: [geometry.coordinates[0].map(toPosition)],
          },
        },
      ];
    case "MultiPoint":
      return geometry.coordinates.flatMap((coordinates) =>
        toDrawableGeometries({ type: "Point", coordinates }),
      );
    case "MultiLineString":
      return geometry.coordinates.flatMap((coordinates) =>
        toDrawableGeometries({ type: "LineString", coordinates }),
      );
    case "MultiPolygon":
      return geometry.coordinates.flatMap((coordinates) =>
        toDrawableGeometries({ type: "Polygon", coordinates }),
      );
    case "GeometryCollection":
      return geometry.geometries.flatMap(toDrawableGeometries);
    default:
      return [];
  }
}

function toStoreFeatures({
  geometry,
  properties,
}: Feature): GeoJSONStoreFeatures[] {
  let drawable: ReturnType<typeof toDrawableGeometries>;
  try {
    drawable = toDrawableGeometries(geometry);
  } catch {
    return []; // Malformed coordinates.
  }

  const isSimplified =
    drawable.length > 1 ||
    (geometry.type === "Polygon" && geometry.coordinates.length > 1);
  const hasProperties = properties && Object.keys(properties).length > 0;
  const now = Date.now();
  const sourceId = crypto.randomUUID();

  return drawable.map(({ mode, geometry: geom }) => ({
    id: crypto.randomUUID(),
    type: "Feature",
    geometry: geom,
    properties: {
      mode,
      createdAt: now,
      updatedAt: now,
      ...(hasProperties && { sourceProperties: properties as JSONObject }),
      ...(isSimplified && {
        sourceGeometry: geometry as unknown as JSONObject,
      }),
      ...(drawable.length > 1 && { sourceId }),
    },
  }));
}

export function exportCollection(
  snapshot: GeoJSONStoreFeatures[],
): FeatureCollection {
  // Selection handles and midpoints live in the store too; they aren't features.
  const shapes = snapshot.filter(
    (f) => !f.properties.selectionPoint && !f.properties.midPoint,
  );
  const partsBySource = new Map<string, GeoJSONStoreFeatures[]>();
  for (const feature of shapes) {
    const sourceId = feature.properties.sourceId as string | undefined;
    if (sourceId)
      partsBySource.set(sourceId, [
        ...(partsBySource.get(sourceId) ?? []),
        feature,
      ]);
  }

  const features: Feature[] = [];
  const done = new Set<string>();
  for (const feature of shapes) {
    const sourceId = feature.properties.sourceId as string | undefined;
    const parts = sourceId ? partsBySource.get(sourceId)! : [feature];
    const whole = parts.every((part) => part.properties.sourceGeometry);
    if (sourceId && whole) {
      if (done.has(sourceId)) continue;
      done.add(sourceId);
    }
    features.push({
      type: "Feature",
      geometry: whole ? featureGeometry(feature) : feature.geometry,
      properties: featureProperties(feature) ?? {},
    });
  }
  return { type: "FeatureCollection", features };
}

/** The geometry to report for a feature: what was pasted, if the map only holds a simplified version of it. */
export function featureGeometry(feature: GeoJSONStoreFeatures): Geometry {
  return (
    (feature.properties.sourceGeometry as unknown as Geometry | undefined) ??
    feature.geometry
  );
}

/** Computed on demand, as features can be edited. Parts of a mixed pasted geometry report for themselves. */
export function featureMeasurements(
  feature: GeoJSONStoreFeatures,
  units: Units = "metric",
): Record<string, number> {
  const measurements =
    measureGeometry(featureGeometry(feature), units) ??
    measureGeometry(feature.geometry, units)!;
  if (feature.properties.mode !== "circle") return measurements;
  return {
    ...measurements,
    ...circleCenter((feature.geometry as Polygon).coordinates[0]),
  };
}

export function featureProperties(
  feature: GeoJSONStoreFeatures,
): GeoJsonProperties {
  return (
    (feature.properties.sourceProperties as GeoJsonProperties | undefined) ??
    null
  );
}

/** Measurements, then whatever properties the feature was pasted with. */
export function featureDetails(
  feature: GeoJSONStoreFeatures,
  units: Units,
): { label: string; value: string }[] {
  const entries = Object.entries({
    ...featureMeasurements(feature, units),
    ...featureProperties(feature),
  });
  return entries.map(([label, value]) => ({
    label,
    value: typeof value === "object" ? JSON.stringify(value) : String(value),
  }));
}
