import { MaplibreTerradrawControl } from '@watergis/maplibre-gl-terradraw';
import '@watergis/maplibre-gl-terradraw/dist/maplibre-gl-terradraw.css';
import type { Map as MapLibreMap } from 'maplibre-gl';
import type { GeoJSONStoreFeatures, GeoJSONStoreGeometries } from 'terra-draw';
import type { Geometry } from 'geojson';

export interface DrawCallbacks {
  onFeatureSelected: (feature: GeoJSONStoreFeatures) => void;
  onFeatureDeselected: () => void;
  onFeatureDeleted: () => void;
}

const DRAW_MODES = [
  'point',
  'linestring',
  'polygon',
  'rectangle',
  'select',
  'delete-selection',
  'delete',
  'undo',
  'redo',
] as const;

export function setupDraw(map: MapLibreMap, callbacks: DrawCallbacks): MaplibreTerradrawControl {
  const control = new MaplibreTerradrawControl({
    modes: [...DRAW_MODES],
    open: true,
  });

  map.addControl(control, 'top-left');

  const terraDraw = control.getTerraDrawInstance();
  if (!terraDraw) return control;

  const showFeature = (id: string | number) => {
    const feature = terraDraw.getSnapshotFeature(id);
    if (feature) callbacks.onFeatureSelected(feature);
  };

  terraDraw.on('finish', (id) => showFeature(id));
  terraDraw.on('select', (id) => showFeature(id));
  terraDraw.on('deselect', () => callbacks.onFeatureDeselected());
  terraDraw.on('change', (_ids, type) => {
    if (type === 'delete') callbacks.onFeatureDeleted();
  });

  return control;
}

/** Terra Draw only stores Point/LineString/Polygon geometries; split anything else into those. */
function toDrawableGeometries(geometry: Geometry): { mode: string; geometry: GeoJSONStoreGeometries }[] {
  switch (geometry.type) {
    case 'Point':
      return [{ mode: 'point', geometry }];
    case 'LineString':
      return [{ mode: 'linestring', geometry }];
    case 'Polygon':
      return [{ mode: 'polygon', geometry }];
    case 'MultiPoint':
      return geometry.coordinates.map((coordinates) => ({
        mode: 'point',
        geometry: { type: 'Point', coordinates },
      }));
    case 'MultiLineString':
      return geometry.coordinates.map((coordinates) => ({
        mode: 'linestring',
        geometry: { type: 'LineString', coordinates },
      }));
    case 'MultiPolygon':
      return geometry.coordinates.map((coordinates) => ({
        mode: 'polygon',
        geometry: { type: 'Polygon', coordinates },
      }));
    case 'GeometryCollection':
      return geometry.geometries.flatMap(toDrawableGeometries);
    default:
      return [];
  }
}

/** Add externally-sourced geometry (from pasted WKT/GeoJSON) to the draw store. */
export function addGeometryToDraw(control: MaplibreTerradrawControl, geometry: Geometry): GeoJSONStoreFeatures[] {
  const terraDraw = control.getTerraDrawInstance();
  if (!terraDraw) return [];

  const now = Date.now();
  const features: GeoJSONStoreFeatures[] = toDrawableGeometries(geometry).map(({ mode, geometry: geom }) => ({
    id: crypto.randomUUID(),
    type: 'Feature',
    geometry: geom,
    properties: { mode, createdAt: now, updatedAt: now },
  }));

  terraDraw.addFeatures(features);
  return features;
}
