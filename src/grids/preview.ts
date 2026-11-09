import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import type { Feature, Polygon } from 'geojson';
import { GRID_DEFINITIONS } from '.';
import type { GridId } from '.';

/** Cells of each grid to draw, by ID. */
export type PreviewCells = Partial<Record<GridId, string[]>>;

/** The 'grid-' prefix keeps it across basemap changes, with the grids. */
const SOURCE_ID = 'grid-preview';

/** A feature's coverings, drawn on the map in each grid's color while they're toggled on in the side panel. */
export class CoveragePreview {
  private map: MapLibreMap;

  constructor(map: MapLibreMap) {
    this.map = map;
  }

  addToMap(): void {
    this.map.addSource(SOURCE_ID, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    this.map.addLayer({
      id: `${SOURCE_ID}-fill`,
      type: 'fill',
      source: SOURCE_ID,
      paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.18 },
    });
    this.map.addLayer({
      id: `${SOURCE_ID}-line`,
      type: 'line',
      source: SOURCE_ID,
      paint: { 'line-color': ['get', 'color'], 'line-width': 1.5 },
    });
  }

  show(cells: PreviewCells): void {
    const features: Feature<Polygon>[] = GRID_DEFINITIONS.flatMap((def) =>
      (cells[def.id] ?? []).map((id) => ({
        type: 'Feature' as const,
        properties: { color: def.color },
        geometry: def.cellPolygon(id),
      })),
    );
    (this.map.getSource(SOURCE_ID) as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features });
  }
}
