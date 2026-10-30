import type { Map as MapLibreMap, GeoJSONSource, PointLike } from 'maplibre-gl';
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
  cellName: string;
  color: string;
  minResolution: number;
  maxResolution: number;
  resolutionForZoom: (zoom: number) => number;
  estimateCells: (bbox: Bbox, resolution: number) => number;
  coverBbox: (bbox: Bbox, resolution: number) => GridCellFeature[];
}

/** Above this many cells a grid isn't worth computing or drawing: it would hang the page and be unreadable anyway. */
const MAX_GRID_CELLS = 10_000;

export const GRID_DEFINITIONS: GridDefinition[] = [
  {
    id: 'h3',
    label: 'H3 cells',
    cellName: 'H3 cell',
    color: '#e4572e',
    minResolution: h3Grid.MIN_RESOLUTION,
    maxResolution: h3Grid.MAX_RESOLUTION,
    resolutionForZoom: h3Grid.resolutionForZoom,
    estimateCells: h3Grid.estimateCells,
    coverBbox: h3Grid.coverBbox,
  },
  {
    id: 'quadkey',
    label: 'Quadkeys',
    cellName: 'Quadkey',
    color: '#2e8b57',
    minResolution: quadkeyGrid.MIN_ZOOM,
    maxResolution: quadkeyGrid.MAX_ZOOM,
    resolutionForZoom: quadkeyGrid.resolutionForZoom,
    estimateCells: quadkeyGrid.estimateCells,
    coverBbox: quadkeyGrid.coverBbox,
  },
  {
    id: 's2',
    label: 'S2 cells',
    cellName: 'S2 cell',
    color: '#3468c0',
    minResolution: s2Grid.MIN_LEVEL,
    maxResolution: s2Grid.MAX_LEVEL,
    resolutionForZoom: s2Grid.resolutionForZoom,
    estimateCells: s2Grid.estimateCells,
    coverBbox: s2Grid.coverBbox,
  },
];

const EMPTY_COLLECTION: FeatureCollection = { type: 'FeatureCollection', features: [] };

export interface GridCellHit {
  layer: GridLayer;
  cell: GridCellFeature;
}

/** The grid cell whose label is drawn at a point. Cell bodies aren't clickable, so grids don't swallow map clicks. */
export function gridCellAtPoint(map: MapLibreMap, layers: GridLayer[], point: PointLike): GridCellHit | undefined {
  const visible = layers.filter((layer) => layer.visible);
  if (visible.length === 0) return undefined;

  const [hit] = map.queryRenderedFeatures(point, { layers: visible.map((layer) => layer.labelLayerId) });
  const layer = visible.find((l) => l.labelLayerId === hit?.layer.id);
  const cell = layer?.cell(hit.properties.id);
  return layer && cell ? { layer, cell } : undefined;
}

/** What to copy for a cell, beyond what any geometry offers. */
export function cellCopyValues({ layer, cell }: GridCellHit): { label: string; value: string }[] {
  const { id, googleTile, tmsTile } = cell.properties;
  const values = [{ label: layer.def.cellName, value: id }];
  if (googleTile) values.push({ label: 'Google tile (Z/X/Y)', value: String(googleTile) });
  if (tmsTile) values.push({ label: 'TMS tile (Z/X/Y)', value: String(tmsTile) });
  return values;
}

export class GridLayer {
  readonly def: GridDefinition;
  private map: MapLibreMap;
  private sourceId: string;
  private fillLayerId: string;
  private lineLayerId: string;
  readonly labelLayerId: string;
  private cells = new Map<string, GridCellFeature>();
  visible = false;
  auto = true;
  resolution: number;
  onResolutionChange?: (resolution: number) => void;
  onTooManyCellsChange?: (tooManyCells: boolean) => void;

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

    const setCursor = (cursor: string) => () => {
      this.map.getCanvas().style.cursor = cursor;
    };
    this.map.on('mouseenter', this.labelLayerId, setCursor('pointer'));
    this.map.on('mouseleave', this.labelLayerId, setCursor(''));
  }

  /** Cells keep their exact geometry here: rendered features only hold a version clipped to map tiles. */
  cell(id: string): GridCellFeature | undefined {
    return this.cells.get(id);
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

  setAuto(auto: boolean): void {
    this.auto = auto;
    this.resetResolutionForZoom();
    if (this.visible) this.refresh();
  }

  /** In auto mode, recompute the resolution for the current zoom (called on zoomend; the moveend that follows refreshes). */
  resetResolutionForZoom(): void {
    if (!this.auto) return;
    this.resolution = this.def.resolutionForZoom(this.map.getZoom());
    this.onResolutionChange?.(this.resolution);
  }

  refresh(): void {
    const bbox = getPaddedViewportBbox(this.map);
    const tooManyCells = this.def.estimateCells(bbox, this.resolution) > MAX_GRID_CELLS;
    this.onTooManyCellsChange?.(tooManyCells);
    const features = tooManyCells ? [] : this.def.coverBbox(bbox, this.resolution);
    this.cells = new Map(features.map((feature) => [feature.properties.id, feature]));
    const source = this.map.getSource(this.sourceId) as GeoJSONSource | undefined;
    source?.setData({ type: 'FeatureCollection', features });
  }

  clear(): void {
    this.onTooManyCellsChange?.(false);
    this.cells.clear();
    const source = this.map.getSource(this.sourceId) as GeoJSONSource | undefined;
    source?.setData(EMPTY_COLLECTION);
  }
}

export type { Bbox, GridCellFeature } from './types';
