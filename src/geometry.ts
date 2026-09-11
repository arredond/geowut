import type { Geometry, Position } from 'geojson';
import type { Bbox } from './grids/types';

function walkCoordinates(geometry: Geometry, visit: (lng: number, lat: number) => void): void {
  if (geometry.type === 'GeometryCollection') {
    geometry.geometries.forEach((g) => walkCoordinates(g, visit));
    return;
  }

  const walk = (coords: Position | Position[] | Position[][] | Position[][][]): void => {
    if (typeof coords[0] === 'number') {
      const [lng, lat] = coords as Position;
      visit(lng, lat);
    } else {
      (coords as unknown[]).forEach((c) => walk(c as Position | Position[] | Position[][]));
    }
  };

  walk(geometry.coordinates as Position | Position[] | Position[][] | Position[][][]);
}

export function geometryBbox(geometry: Geometry): Bbox {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;

  walkCoordinates(geometry, (lng, lat) => {
    west = Math.min(west, lng);
    east = Math.max(east, lng);
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  });

  return [west, south, east, north];
}

/** Center of the geometry's bounding box (matches Leaflet's LatLngBounds.getCenter semantics). */
export function geometryCenter(geometry: Geometry): [number, number] {
  if (geometry.type === 'Point') {
    return geometry.coordinates as [number, number];
  }
  const [west, south, east, north] = geometryBbox(geometry);
  return [(west + east) / 2, (south + north) / 2];
}

export function bboxToString(bbox: Bbox): string {
  return bbox.join(',');
}
