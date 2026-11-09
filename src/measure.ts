import { TerraDraw, TerraDrawLineStringMode, TerraDrawPolygonMode, TerraDrawRenderMode } from 'terra-draw';
import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter';
import type { Map as MapLibreMap } from 'maplibre-gl';
import type { GeoJSONStoreFeatures } from 'terra-draw';
import type { Geometry } from 'geojson';
import { lengthKm, ringMeasurements } from './geometry';
import { formatArea, formatLength } from './units';
import type { Units } from './units';

export const MEASURE_TOOLS = ['measure-line', 'measure-area'] as const;
export type MeasureTool = (typeof MEASURE_TOOLS)[number];

export type Measurement = { lengthKm: number } | { areaKm2: number; perimeterKm: number };

type FeatureId = GeoJSONStoreFeatures['id'] & {};

const IDLE_MODE = 'measure-idle';
const COLOR = '#e8590c';

export function measureShape(geometry: Geometry): Measurement | null {
  if (geometry.type === 'LineString') return { lengthKm: lengthKm(geometry.coordinates) };
  if (geometry.type === 'Polygon') return ringMeasurements(geometry.coordinates[0]);
  return null;
}

export function formatMeasurement(measurement: Measurement, units: Units): string {
  if ('lengthKm' in measurement) return formatLength(measurement.lengthKm, units);
  return `${formatArea(measurement.areaKm2, units)} · ${formatLength(measurement.perimeterKm, units)} perimeter`;
}

/**
 * Lines and polygons that are measured but never become features. They live in a Terra Draw instance of
 * their own, so they stay out of the feature store, out of clicks on features, and out of undo history.
 * The last measurement stays on the map until the next one starts or the tool is left.
 */
export class Measurer {
  private terraDraw: TerraDraw;
  private onChange: (measurement: Measurement | null) => void;
  private finishedId?: FeatureId;

  constructor(map: MapLibreMap, onChange: (measurement: Measurement | null) => void) {
    this.onChange = onChange;
    this.terraDraw = new TerraDraw({
      adapter: new TerraDrawMapLibreGLAdapter({ map, prefixId: 'td-measure' }),
      modes: [
        new TerraDrawRenderMode({ modeName: IDLE_MODE, styles: {} }),
        new TerraDrawLineStringMode({
          modeName: 'measure-line',
          styles: { lineStringColor: COLOR, lineStringWidth: 3, lineStringDash: [2, 1], closingPointColor: COLOR },
        }),
        new TerraDrawPolygonMode({
          modeName: 'measure-area',
          styles: { fillColor: COLOR, fillOpacity: 0.15, outlineColor: COLOR, outlineWidth: 3, closingPointColor: COLOR },
        }),
      ],
    });

    map.once('load', () => {
      this.terraDraw.start();
      this.terraDraw.setMode(IDLE_MODE);
    });

    this.terraDraw.on('change', (ids, type) => {
      if (type === 'create' || type === 'update') this.onShapeChanged(ids);
    });
    this.terraDraw.on('finish', (id) => {
      this.finishedId = id;
      this.report(id);
    });
  }

  /** Mode first, so the mode being left cleans up after any shape in progress before the rest goes. */
  start(tool: MeasureTool): void {
    this.terraDraw.setMode(tool);
    this.clear();
  }

  stop(): void {
    this.terraDraw.setMode(IDLE_MODE);
    this.clear();
  }

  private clear(): void {
    this.finishedId = undefined;
    this.terraDraw.clear();
    this.onChange(null);
  }

  private onShapeChanged(ids: FeatureId[]): void {
    const shapeId = ids.find((id) => this.isShape(id));
    if (shapeId === undefined || shapeId === this.finishedId) return;

    // A new measurement replaces the finished one.
    if (this.finishedId !== undefined) {
      const previous = this.finishedId;
      this.finishedId = undefined;
      this.terraDraw.removeFeatures([previous]);
    }
    this.report(shapeId);
  }

  /** The line or polygon being measured, as opposed to the guidance points Terra Draw draws around it. */
  private isShape(id: FeatureId): boolean {
    const type = this.terraDraw.getSnapshotFeature(id)?.geometry.type;
    return type === 'LineString' || type === 'Polygon';
  }

  private report(id: FeatureId): void {
    const feature = this.terraDraw.getSnapshotFeature(id);
    if (feature) this.onChange(measureShape(feature.geometry));
  }
}
