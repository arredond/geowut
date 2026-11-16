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
import { circleCenter, measureGeometry, zRange } from "./geometry";
import { nearestOnLine } from "./renderedLine";
import { Measurer, MEASURE_TOOLS } from "./measure";
import type { Measurement, MeasureTool } from "./measure";
import type { DetailRow } from "./panel";
import type { Units } from "./units";
import {
  featureStyle,
  LINE_STYLES,
  pointStyles,
  POLYGON_STYLES,
  readyEmojiImage,
  readStyle,
  styleProperties,
} from "./featureStyle";
import type { FeatureStyle } from "./featureStyle";
import { valueText } from "./propertyEditor";

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
  /** An undo or redo: any feature may have changed, or be gone. */
  onHistoryReplayed: () => void;
  /**
   * Features were added or removed, or ones with Z moved or lost it: what counts, or depends on
   * their Z (the export button, polygon extrusion), may have changed. Once a frame at most.
   */
  onShapesChange: () => void;
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
  private map: MapLibreMap;
  private measurer: Measurer;
  private callbacks: DrawCallbacks;
  private editedId?: FeatureId;
  private finishingClick = false;
  private session = new TerraDrawSessionUndoRedo();
  /**
   * Terra Draw records a change to a feature's properties as one step for each of its parts.
   * Changes that took more than one are undone and redone whole: each group is where its
   * stack stood after it, and how many steps it took.
   */
  private undoGroups: { at: number; steps: number }[] = [];
  private redoGroups: { at: number; steps: number }[] = [];

  constructor(map: MapLibreMap, callbacks: DrawCallbacks) {
    this.callbacks = callbacks;
    this.map = map;
    this.terraDraw = new TerraDraw({
      adapter: new TerraDrawMapLibreGLAdapter({ map }),
      undoRedo: { sessionLevel: this.session },
      modes: [
        new TerraDrawRenderMode({ modeName: IDLE_MODE, styles: {} }),
        // Each mode styles the features it drew, in their own color if they have one.
        new TerraDrawPointMode({
          styles: pointStyles((emoji) => readyEmojiImage(map, emoji)),
        }),
        new TerraDrawLineStringMode({ styles: LINE_STYLES }),
        new TerraDrawPolygonMode({ styles: POLYGON_STYLES }),
        new TerraDrawRectangleMode({ styles: POLYGON_STYLES }),
        // Globe: a true circle on the ground, which only looks like one on a Web Mercator map near the equator.
        new TerraDrawCircleMode({
          projection: "globe",
          styles: POLYGON_STYLES,
        }),
        new TerraDrawFreehandMode({
          drawInteraction: "click-move-or-drag",
          styles: POLYGON_STYLES,
        }),
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
    this.terraDraw.on("change", (ids, type) => {
      // Edits matter only to features with Z, which follow them while extruded.
      const relevant =
        type === "create" ||
        type === "delete" ||
        (type === "update" &&
          ids.some(
            (id) => this.terraDraw.getSnapshotFeature(id)?.properties.zRange,
          ));
      if (relevant) this.scheduleShapesChange();
    });
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

  /** A feature's id, with those of the rest of the pasted feature it may be a part of. */
  private partIds(id: FeatureId): FeatureId[] {
    const { sourceId } =
      this.terraDraw.getSnapshotFeature(id)?.properties ?? {};
    if (!sourceId) return [id];
    return this.terraDraw
      .getSnapshot()
      .filter((f) => f.properties.sourceId === sourceId)
      .map((f) => f.id!);
  }

  /** Remove a feature, along with the rest of the pasted feature it may be a part of. */
  delete(id: FeatureId): void {
    this.terraDraw.removeFeatures(this.partIds(id));
    this.callbacks.onFeaturesRemoved();
  }

  /** The feature's style, as it stands. */
  getStyle(id: FeatureId): FeatureStyle {
    const feature = this.terraDraw.getSnapshotFeature(id);
    return feature ? featureStyle(feature) : {};
  }

  /** Restyles a feature, and every other part of it: undefined takes that part of the style away. */
  setStyle(id: FeatureId, change: Partial<FeatureStyle>): void {
    this.updateParts(id, change);
    // Prisms are drawn in their polygon's color.
    if ("color" in change) this.scheduleShapesChange();
  }

  /** The feature as it stands now, if it's still there. */
  getFeature(id: FeatureId): GeoJSONStoreFeatures | undefined {
    return this.terraDraw.getSnapshotFeature(id);
  }

  /** Replaces a feature's own properties (style aside), on every part of it, as one undo step. */
  setProperties(id: FeatureId, properties: Record<string, unknown>): void {
    const empty = Object.keys(properties).length === 0;
    this.updateParts(id, {
      sourceProperties: empty ? undefined : (properties as JSONObject),
    });
  }

  private updateParts(
    id: FeatureId,
    change: Parameters<TerraDraw["updateFeatureProperties"]>[1],
  ): void {
    const before = this.undoSize();
    for (const partId of this.partIds(id))
      this.terraDraw.updateFeatureProperties(partId, change);
    const steps = this.undoSize() - before;
    if (steps > 1) this.undoGroups.push({ at: this.undoSize(), steps });
    // A new step clears the redo stack, and any groups in it.
    if (steps > 0) this.redoGroups = [];
  }

  private undoSize(): number {
    return this.session.undoSize?.() ?? 0;
  }

  private redoSize(): number {
    return this.session.redoSize?.() ?? 0;
  }

  deleteAll(): void {
    this.terraDraw.removeFeatures(
      this.terraDraw.getSnapshot().map((f) => f.id!),
    );
    this.callbacks.onFeaturesRemoved();
  }

  undo(): void {
    if (!this.terraDraw.canUndo()) return;
    const steps = this.groupSteps(this.undoGroups, this.undoSize());
    this.replayHistory(() => {
      for (let i = 0; i < steps; i++) this.terraDraw.undo();
    });
    if (steps > 1) this.redoGroups.push({ at: this.redoSize(), steps });
  }

  redo(): void {
    if (!this.terraDraw.canRedo()) return;
    const steps = this.groupSteps(this.redoGroups, this.redoSize());
    this.replayHistory(() => {
      for (let i = 0; i < steps; i++) this.terraDraw.redo();
    });
    if (steps > 1) this.undoGroups.push({ at: this.undoSize(), steps });
  }

  /** How many steps the next undo or redo takes: a whole group, if one ends at the top of the stack. */
  private groupSteps(
    groups: { at: number; steps: number }[],
    size: number,
  ): number {
    // Groups left above the stack are from steps since undone and dropped.
    while (groups.length > 0 && groups.at(-1)!.at > size) groups.pop();
    if (groups.at(-1)?.at !== size) return 1;
    return groups.pop()!.steps;
  }

  private replayHistory(replay: () => void): void {
    this.setState("select");
    replay();
    this.callbacks.onHistoryReplayed();
  }

  /**
   * Every feature as GeoJSON, as it was given: a pasted geometry the map holds in parts
   * comes back whole (unless a part has since been edited), with its pasted properties.
   */
  exportFeatures(): FeatureCollection {
    return exportCollection(this.terraDraw.getSnapshot());
  }

  private shapesChangeScheduled = false;

  /** Features come and go in thousands at once, from files: reported once a frame at most. */
  private scheduleShapesChange(): void {
    if (this.shapesChangeScheduled) return;
    this.shapesChangeScheduled = true;
    requestAnimationFrame(() => {
      this.shapesChangeScheduled = false;
      this.callbacks.onShapesChange();
    });
  }

  /** The features drawn: selection handles and midpoints, which live in the store too, aside. */
  shapes(): GeoJSONStoreFeatures[] {
    return this.terraDraw
      .getSnapshot()
      .filter((f) => !f.properties.selectionPoint && !f.properties.midPoint);
  }

  hasFeatures(): boolean {
    return this.shapes().length > 0;
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
    // Its Z goes with it: the new vertices have none, and the old ones may have moved.
    if (this.terraDraw.getSnapshotFeature(id)?.properties.sourceGeometry) {
      this.terraDraw.updateFeatureProperties(id, {
        sourceGeometry: undefined,
        zRange: undefined,
      });
      this.scheduleShapesChange();
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

  /**
   * The feature under a click: a point, then the nearest line, then a polygon clicked inside.
   * Terra Draw finds points and polygons. Lines it measures as straight on screen, which on the
   * globe they aren't, so those are measured along the line as the map draws it.
   */
  private featureAt(e: MapMouseEvent): GeoJSONStoreFeatures | undefined {
    const found = this.terraDraw.getFeaturesAtLngLat(e.lngLat, {
      ignoreCoordinatePoints: true,
    });
    const point = found.find((f) => f.geometry.type === "Point");
    if (point) return point;

    let line: GeoJSONStoreFeatures | undefined;
    let lineDistance = LINE_REACH_PX;
    for (const feature of this.terraDraw.getSnapshot()) {
      if (feature.geometry.type !== "LineString") continue;
      const nearest = nearestOnLine(
        this.map,
        feature.geometry.coordinates,
        e.point,
      );
      if (nearest && nearest.distance < lineDistance) {
        line = feature;
        lineDistance = nearest.distance;
      }
    }
    return line ?? found.find((f) => f.geometry.type === "Polygon");
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

    const feature = this.featureAt(e);
    if (this.state === "delete") {
      if (feature) this.delete(feature.id!);
    } else {
      this.callbacks.onMapClicked(feature, e);
    }
  }
}

/** How near a click must be to a line to pick it, in pixels: Terra Draw's own reach. */
const LINE_REACH_PX = 30;

/** Terra Draw rejects coordinates finer than this, or with an altitude. */
const COORDINATE_PRECISION = 1e9;

function toPosition([lng, lat]: Position): Position {
  return [
    Math.round(lng * COORDINATE_PRECISION) / COORDINATE_PRECISION,
    Math.round(lat * COORDINATE_PRECISION) / COORDINATE_PRECISION,
  ];
}

/** Terra Draw only stores Point/LineString/hole-free Polygon geometries; reduce anything else to those. */
function toDrawableGeometries(geometry: Geometry): {
  mode: string;
  geometry: GeoJSONStoreGeometries;
  /** The part's own Z range, which its 2D geometry can't hold. */
  z: [number, number] | null;
}[] {
  switch (geometry.type) {
    case "Point":
      return [
        {
          mode: "point",
          geometry: {
            type: "Point",
            coordinates: toPosition(geometry.coordinates),
          },
          z: zRange(geometry),
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
          z: zRange(geometry),
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
          z: zRange(geometry),
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

  // The map holds longitude and latitude alone: Z, like holes and multiple parts, lives on in
  // the geometry as given.
  const isSimplified =
    drawable.length > 1 ||
    (geometry.type === "Polygon" && geometry.coordinates.length > 1) ||
    zRange(geometry) !== null;
  // Style is the map's to show, not a property to list.
  const { style, rest } = readStyle(properties);
  const hasProperties = rest && Object.keys(rest).length > 0;
  const now = Date.now();
  const sourceId = crypto.randomUUID();

  return drawable.map(({ mode, geometry: geom, z }) => ({
    id: crypto.randomUUID(),
    type: "Feature",
    geometry: geom,
    properties: {
      mode,
      createdAt: now,
      updatedAt: now,
      ...(hasProperties && { sourceProperties: rest as JSONObject }),
      ...style,
      ...(isSimplified && {
        sourceGeometry: geometry as unknown as JSONObject,
      }),
      ...(drawable.length > 1 && { sourceId }),
      // Each part's own, for extruding it: a multipolygon's may differ.
      ...(z && { zRange: z }),
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
    // A part with an emoji may come after one with none: a collection's point after its polygon.
    const styled = whole ? parts : [feature];
    const style = Object.assign(
      {},
      ...styled.map(featureStyle).reverse(),
    ) as FeatureStyle;
    features.push({
      type: "Feature",
      geometry: whole ? featureGeometry(feature) : feature.geometry,
      properties: { ...featureProperties(feature), ...styleProperties(style) },
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

/** Z as shown: one value if all agree, else the range. Units are the data's own, usually metres. */
export function formatZRange([min, max]: [number, number]): string {
  const round = (z: number) => String(Number(z.toFixed(3)));
  return min === max ? round(min) : `${round(min)} – ${round(max)}`;
}

/** Measurements, Z where the geometry has it, then whatever properties the feature was pasted with. */
export function featureDetails(
  feature: GeoJSONStoreFeatures,
  units: Units,
): DetailRow[] {
  const z = zRange(featureGeometry(feature));
  // Worked out from the geometry, so not to be edited: only the properties are.
  const computed = Object.entries({
    ...featureMeasurements(feature, units),
    ...(z && { Z: formatZRange(z) }),
  }).map(([label, value]) => ({ label, value: String(value) }));
  const properties = Object.entries(featureProperties(feature) ?? {}).map(
    ([label, value]) => {
      const text = valueText(value);
      return { label, value: text, property: label, ...osmLink(label, text) };
    },
  );
  return [...computed, ...properties];
}

/** An `osm` reference such as relation/5326784, as search results carry, links to that object on OpenStreetMap. */
function osmLink(label: string, value: string): Pick<DetailRow, "href"> {
  return label === "osm" && /^(node|way|relation)\/\d+$/.test(value)
    ? { href: `https://www.openstreetmap.org/${value}` }
    : {};
}
