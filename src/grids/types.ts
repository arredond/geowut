import type { Feature, Polygon } from "geojson";

/** A cell's size: its area and the mean length of its edges. */
export interface CellStats {
  areaKm2: number;
  edgeKm: number;
}

/** [west, south, east, north] in degrees. */
export type Bbox = [number, number, number, number];

export interface GridCellFeature extends Feature<Polygon> {
  properties: {
    id: string;
    label: string;
    [key: string]: unknown;
  };
}
