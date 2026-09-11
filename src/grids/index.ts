import type { Map as MapLibreMap, GeoJSONSource } from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import type { Bbox, GridCellFeature } from './types';
import { getPaddedViewportBbox } from '../map';
import * as h3Grid from './h3';
import * as quadkeyGrid from './quadkey';
import * as s2Grid from './s2';

export type GridId = 'h3' | 'quadkey' | 's2';

interface GridDefinition {
  id: GridId;
  label: string;
  color: string;
  minResolution: number;
  maxResolution: number;
  resolutionForZoom: (zoom: number) => number;
  coverBbox: (bbox: Bbox, resolution: number) => GridCellFeature[];
}

export const GRID_DEFINITIONS: GridDefinition[] = [
  {
    id: 'h3',
    label: 'H3 cells',
    color: '#e4572e',
    minResolution: h3Grid.MIN_RESOLUTION,
    maxResolution: h3Grid.MAX_RESOLUTION,
    resolutionForZoom: h3Grid.resolutionForZoom,
    coverBbox: h3Grid.coverBbox,
  },
  {
    id: 'quadkey',
    label: 'Quadkeys',
    color: '#2e8b57',
    minResolution: quadkeyGrid.MIN_ZOOM,
    maxResolution: quadkeyGrid.MAX_ZOOM,
    resolutionForZoom: quadkeyGrid.resolutionForZoom,
    coverBbox: quadkeyGrid.coverBbox,
  },
  {
    id: 's2',
    label: 'S2 cells',
    color: '#3468c0',
    minResolution: s2Grid.MIN_LEVEL,
    maxResolution: s2Grid.MAX_LEVEL,
    resolutionForZoom: s2Grid.resolutionForZoom,
    coverBbox: s2Grid.coverBbox,
  },
];

const EMPTY_COLLECTION: FeatureCollection = { type: 'FeatureCollection', features: [] };

export class GridLayer {
  readonly def: GridDefinition;
  private map: MapLibreMap;
  private sourceId: string;
  private fillLayerId: string;
  private lineLayerId: string;
  private labelLayerId: string;
  visible = false;
  resolution: number;
  onResolutionChange?: (resolution: number) => void;

  constructor(map: MapLibreMap, def: GridDefinition) {
    this.map = map;
    this.def = def;
    this.sourceId = `grid-${def.id}`;
    this.fillLayerId = `${this.sourceId}-fill`;
    this.lineLayerId = `${this.sourceId}-line`;
    this.labelLayerId = `${this.sourceId}-label`;
    this.resolution = def.resolutionForZoom(map.getZoom());
  }

  addToMap(): void {
    this.map.addSource(this.sourceId, { type: 'geojson', data: EMPTY_COLLECTION });

    this.map.addLayer({
      id: this.fillLayerId,
      type: 'fill',
      source: this.sourceId,
      layout: { visibility: 'none' },
      paint: { 'fill-color': this.def.color, 'fill-opacity': 0.05 },
    });

    this.map.addLayer({
      id: this.lineLayerId,
      type: 'line',
      source: this.sourceId,
      layout: { visibility: 'none' },
      paint: { 'line-color': this.def.color, 'line-width': 1.5 },
    });

    this.map.addLayer({
      id: this.labelLayerId,
      type: 'symbol',
      source: this.sourceId,
      layout: {
        visibility: 'none',
        'text-field': ['get', 'label'],
        'text-size': 11,
        'text-allow-overlap': false,
      },
      paint: {
        'text-color': this.def.color,
        'text-halo-color': '#ffffff',
        'text-halo-width': 1.2,
      },
    });
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    const layout = visible ? 'visible' : 'none';
    for (const id of [this.fillLayerId, this.lineLayerId, this.labelLayerId]) {
      this.map.setLayoutProperty(id, 'visibility', layout);
    }
    if (visible) this.refresh();
    else this.clear();
  }

  setResolution(resolution: number): void {
    this.resolution = Math.max(this.def.minResolution, Math.min(this.def.maxResolution, Math.round(resolution)));
    this.onResolutionChange?.(this.resolution);
    if (this.visible) this.refresh();
  }

  /** Recompute the default resolution for the current zoom (called on zoomend). */
  resetResolutionForZoom(): void {
    this.resolution = this.def.resolutionForZoom(this.map.getZoom());
    this.onResolutionChange?.(this.resolution);
    if (this.visible) this.refresh();
  }

  refresh(): void {
    const bbox = getPaddedViewportBbox(this.map);
    const features = this.def.coverBbox(bbox, this.resolution);
    const source = this.map.getSource(this.sourceId) as GeoJSONSource | undefined;
    source?.setData({ type: 'FeatureCollection', features });
  }

  clear(): void {
    const source = this.map.getSource(this.sourceId) as GeoJSONSource | undefined;
    source?.setData(EMPTY_COLLECTION);
  }
}

export type { Bbox, GridCellFeature } from './types';
