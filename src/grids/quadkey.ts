import type { Bbox, GridCellFeature } from './types';

export const MIN_ZOOM = 0;
export const MAX_ZOOM = 23;

export function resolutionForZoom(zoom: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(zoom)));
}

function lngToTileX(lng: number, z: number): number {
  return Math.floor(((lng + 180) / 360) * 2 ** z);
}

function latToTileY(lat: number, z: number): number {
  const latRad = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * 2 ** z);
}

function tileXToLng(x: number, z: number): number {
  return (x / 2 ** z) * 360 - 180;
}

function tileYToLat(y: number, z: number): number {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

/** Google/XYZ (x,y,z) tile -> Bing-style quadkey string. */
export function tileToQuadkey(x: number, y: number, z: number): string {
  let quadkey = '';
  for (let i = z; i > 0; i--) {
    let digit = 0;
    const mask = 1 << (i - 1);
    if ((x & mask) !== 0) digit += 1;
    if ((y & mask) !== 0) digit += 2;
    quadkey += digit;
  }
  return quadkey;
}

function tileBounds(x: number, y: number, z: number): Bbox {
  return [tileXToLng(x, z), tileYToLat(y + 1, z), tileXToLng(x + 1, z), tileYToLat(y, z)];
}

export function coverBbox(bbox: Bbox, zoom: number): GridCellFeature[] {
  const [west, south, east, north] = bbox;
  const maxTileIndex = 2 ** zoom - 1;
  const xMin = Math.max(0, lngToTileX(west, zoom));
  const xMax = Math.min(maxTileIndex, lngToTileX(east, zoom));
  // Latitude decreases as tile Y increases, so north maps to the smaller Y.
  const yMin = Math.max(0, latToTileY(north, zoom));
  const yMax = Math.min(maxTileIndex, latToTileY(south, zoom));

  const features: GridCellFeature[] = [];
  for (let x = xMin; x <= xMax; x++) {
    for (let y = yMin; y <= yMax; y++) {
      const [w, s, e, n] = tileBounds(x, y, zoom);
      const quadkey = tileToQuadkey(x, y, zoom);
      const yTms = 2 ** zoom - y - 1;
      features.push({
        type: 'Feature',
        properties: {
          id: quadkey,
          label: quadkey,
          'Tile (Google, z/x/y)': `${zoom}/${x}/${y}`,
          'Tile (TMS, z/x/y)': `${zoom}/${x}/${yTms}`,
        },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [w, s],
              [e, s],
              [e, n],
              [w, n],
              [w, s],
            ],
          ],
        },
      });
    }
  }
  return features;
}
