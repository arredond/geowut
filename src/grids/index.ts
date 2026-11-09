import type { Map as MapLibreMap, GeoJSONSource, PointLike } from "maplibre-gl";
import type { FeatureCollection, Polygon } from "geojson";
import type { Bbox, CellStats, GridCellFeature } from "./types";
import { getPaddedViewportBbox } from "../map";
import * as h3Grid from "./h3";
import * as quadkeyGrid from "./quadkey";
import * as s2Grid from "./s2";
import { formatArea, formatLength } from "../units";
import type { Units } from "../units";

export type GridId = "h3" | "quadkey" | "s2";

interface GridDefinition {
  id: GridId;
  label: string;
  color: string;
  minResolution: number;
  maxResolution: number;
  resolutionForZoom: (zoom: number) => number;
  estimateCells: (bbox: Bbox, resolution: number) => number;
  coverBbox: (bbox: Bbox, resolution: number) => GridCellFeature[];
  /** What the resolution is called in this grid, as in 'res 9' or 'zoom 12'. */
  resolutionName: string;
  /** Typical cell size at a resolution, for the reference table. */
  levelStats: (resolution: number) => CellStats;
  /** What the typical size stands for. */
  levelStatsNote: string;
  cellStats: (id: string) => CellStats;
  cellPolygon: (id: string) => Polygon;
}

/** Above this many cells a grid isn't worth computing or drawing: it would hang the page and be unreadable anyway. */
export const MAX_GRID_CELLS = 10_000;

export const GRID_DEFINITIONS: GridDefinition[] = [
  {
    id: "h3",
    label: "H3 cells",
    color: "#e4572e",
    minResolution: h3Grid.MIN_RESOLUTION,
    maxResolution: h3Grid.MAX_RESOLUTION,
    resolutionForZoom: h3Grid.resolutionForZoom,
    estimateCells: h3Grid.estimateCells,
    coverBbox: h3Grid.coverBbox,
    resolutionName: "Resolution",
    levelStats: h3Grid.levelStats,
    levelStatsNote:
      "Averages over all cells: the hexagons and the 12 pentagons of every resolution.",
    cellStats: h3Grid.cellStats,
    cellPolygon: h3Grid.cellPolygon,
  },
  {
    id: "quadkey",
    label: "Quadkeys",
    color: "#2e8b57",
    minResolution: quadkeyGrid.MIN_ZOOM,
    maxResolution: quadkeyGrid.MAX_ZOOM,
    resolutionForZoom: quadkeyGrid.resolutionForZoom,
    estimateCells: quadkeyGrid.estimateCells,
    coverBbox: quadkeyGrid.coverBbox,
    resolutionName: "Zoom",
    levelStats: quadkeyGrid.levelStats,
    levelStatsNote:
      "Tiles on the equator, the largest. Away from it they shrink with the cosine of latitude: at 60°, edges are half as long and areas a quarter.",
    cellStats: quadkeyGrid.cellStats,
    cellPolygon: quadkeyGrid.cellPolygon,
  },
  {
    id: "s2",
    label: "S2 cells",
    color: "#3468c0",
    minResolution: s2Grid.MIN_LEVEL,
    maxResolution: s2Grid.MAX_LEVEL,
    resolutionForZoom: s2Grid.resolutionForZoom,
    estimateCells: s2Grid.estimateCells,
    coverBbox: s2Grid.coverBbox,
    resolutionName: "Level",
    levelStats: s2Grid.levelStats,
    levelStatsNote:
      "Averages over all cells. The largest cells of a level are about twice the area of the smallest.",
    cellStats: s2Grid.cellStats,
    cellPolygon: s2Grid.cellPolygon,
  },
];

const EMPTY_COLLECTION: FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

export interface GridCellHit {
  layer: GridLayer;
  cell: GridCellFeature;
}

/** The grid cell whose label is drawn at a point. Cell bodies aren't clickable, so grids don't swallow map clicks. */
export function gridCellAtPoint(
  map: MapLibreMap,
  layers: GridLayer[],
  point: PointLike,
): GridCellHit | undefined {
  const visible = layers.filter((layer) => layer.visible);
  if (visible.length === 0) return undefined;

  const [hit] = map.queryRenderedFeatures(point, {
    layers: visible.map((layer) => layer.labelLayerId),
  });
  const layer = visible.find((l) => l.labelLayerId === hit?.layer.id);
  const cell = layer?.cell(hit.properties.id);
  return layer && cell ? { layer, cell } : undefined;
}

/** Read at click time: the layer's resolution moves on with the zoom. */
export function cellDetails({
  layer,
  cell,
}: GridCellHit): (units: Units) => { label: string; value: string }[] {
  const { id, googleTile, tmsTile } = cell.properties;
  const level = layer.resolution;
  const { areaKm2, edgeKm } = layer.def.cellStats(id);
  // Quadkeys are map tiles too, which other tools name by Z/X/Y.
  const tiles = [
    ...(googleTile
      ? [{ label: "Google tile (Z/X/Y)", value: String(googleTile) }]
      : []),
    ...(tmsTile ? [{ label: "TMS tile (Z/X/Y)", value: String(tmsTile) }] : []),
  ];
  return (units) => [
    { label: "ID", value: id },
    { label: layer.def.resolutionName, value: String(level) },
    ...tiles,
    { label: "Area", value: formatArea(areaKm2, units) },
    { label: "Edge length (avg)", value: formatLength(edgeKm, units) },
  ];
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
  private labelHalo = "#ffffff";
  resolution: number;
  onResolutionChange?: (resolution: number) => void;
  private resolutionListeners: (() => void)[] = [];
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
    this.map.addSource(this.sourceId, {
      type: "geojson",
      data: EMPTY_COLLECTION,
    });

    this.map.addLayer({
      id: this.fillLayerId,
      type: "fill",
      source: this.sourceId,
      layout: { visibility: "none" },
      paint: { "fill-color": this.def.color, "fill-opacity": 0.05 },
    });

    this.map.addLayer({
      id: this.lineLayerId,
      type: "line",
      source: this.sourceId,
      layout: { visibility: "none" },
      paint: { "line-color": this.def.color, "line-width": 1.5 },
    });

    this.map.addLayer({
      id: this.labelLayerId,
      type: "symbol",
      source: this.sourceId,
      layout: {
        visibility: "none",
        "text-field": ["get", "label"],
        // MapLibre's default font isn't on OpenFreeMap's glyph server, which every basemap uses.
        "text-font": ["Noto Sans Regular"],
        "text-size": 11,
        "text-allow-overlap": false,
      },
      paint: {
        "text-color": this.def.color,
        "text-halo-color": this.labelHalo,
        "text-halo-width": 1.2,
      },
    });

    const setCursor = (cursor: string) => () => {
      this.map.getCanvas().style.cursor = cursor;
    };
    this.map.on("mouseenter", this.labelLayerId, setCursor("pointer"));
    this.map.on("mouseleave", this.labelLayerId, setCursor(""));
  }

  /** Labels stand out from the basemap with a halo of its own lightness. */
  setLabelHalo(color: string): void {
    this.labelHalo = color;
    if (this.map.getLayer(this.labelLayerId))
      this.map.setPaintProperty(this.labelLayerId, "text-halo-color", color);
  }

  /** Cells keep their exact geometry here: rendered features only hold a version clipped to map tiles. */
  cell(id: string): GridCellFeature | undefined {
    return this.cells.get(id);
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    const layout = visible ? "visible" : "none";
    for (const id of [this.fillLayerId, this.lineLayerId, this.labelLayerId]) {
      this.map.setLayoutProperty(id, "visibility", layout);
    }
    if (visible) this.refresh();
    else this.clear();
  }

  /** Others that follow the resolution, beyond the grid control's own field: told only when it actually changes. */
  addResolutionListener(listener: () => void): void {
    this.resolutionListeners.push(listener);
  }

  private announceResolution(previous: number): void {
    this.onResolutionChange?.(this.resolution);
    if (this.resolution !== previous)
      for (const listener of this.resolutionListeners) listener();
  }

  setResolution(resolution: number): void {
    const previous = this.resolution;
    this.resolution = Math.max(
      this.def.minResolution,
      Math.min(this.def.maxResolution, Math.round(resolution)),
    );
    this.announceResolution(previous);
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
    const previous = this.resolution;
    this.resolution = this.def.resolutionForZoom(this.map.getZoom());
    this.announceResolution(previous);
  }

  refresh(): void {
    const bbox = getPaddedViewportBbox(this.map);
    const tooManyCells =
      this.def.estimateCells(bbox, this.resolution) > MAX_GRID_CELLS;
    this.onTooManyCellsChange?.(tooManyCells);
    const features = tooManyCells
      ? []
      : this.def.coverBbox(bbox, this.resolution);
    this.cells = new Map(
      features.map((feature) => [feature.properties.id, feature]),
    );
    const source = this.map.getSource(this.sourceId) as
      GeoJSONSource | undefined;
    source?.setData({ type: "FeatureCollection", features });
  }

  clear(): void {
    this.onTooManyCellsChange?.(false);
    this.cells.clear();
    const source = this.map.getSource(this.sourceId) as
      GeoJSONSource | undefined;
    source?.setData(EMPTY_COLLECTION);
  }
}

export type { Bbox, CellStats, GridCellFeature } from "./types";
