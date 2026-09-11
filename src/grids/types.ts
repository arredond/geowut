import type { Feature, Polygon } from 'geojson';

/** [west, south, east, north] in degrees. */
export type Bbox = [number, number, number, number];

export interface GridCellFeature extends Feature<Polygon> {
  properties: {
    id: string;
    label: string;
    [key: string]: unknown;
  };
}
