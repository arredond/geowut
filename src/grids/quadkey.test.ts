import { describe, expect, it } from 'vitest';
import { coverBbox, estimateCells, MAX_ZOOM, MIN_ZOOM, resolutionForZoom, tileToQuadkey } from './quadkey';

describe('tileToQuadkey', () => {
  it('matches the Bing Maps documentation example', () => {
    expect(tileToQuadkey(3, 5, 3)).toBe('213');
  });

  it('is empty at zoom 0', () => {
    expect(tileToQuadkey(0, 0, 0)).toBe('');
  });
});

describe('coverBbox', () => {
  const [tile] = coverBbox([-3.7, 40.4, -3.7, 40.4], 12);

  it('finds the tile containing a point', () => {
    const { properties } = tile;
    expect(properties.googleTile).toBe('12/2005/1544');
    const [west, south, east, north] = [
      tile.geometry.coordinates[0][0][0],
      tile.geometry.coordinates[0][0][1],
      tile.geometry.coordinates[0][2][0],
      tile.geometry.coordinates[0][2][1],
    ];
    expect(west).toBeLessThanOrEqual(-3.7);
    expect(east).toBeGreaterThanOrEqual(-3.7);
    expect(south).toBeLessThanOrEqual(40.4);
    expect(north).toBeGreaterThanOrEqual(40.4);
  });

  it('flips only Y between Google and TMS identifiers', () => {
    expect(tile.properties.tmsTile).toBe(`12/2005/${2 ** 12 - 1 - 1544}`);
  });

  it('flips the known zoom 1 tiles', () => {
    const tiles = coverBbox([-179, -85, 179, 85], 1).map((f) => [f.properties.googleTile, f.properties.tmsTile]);
    expect(tiles).toContainEqual(['1/0/0', '1/0/1']);
    expect(tiles).toContainEqual(['1/1/1', '1/1/0']);
  });

  it('never leaves the tile matrix', () => {
    expect(coverBbox([-180, -85, 180, 85], 2)).toHaveLength(16);
  });
});

describe('estimateCells', () => {
  it('is exact', () => {
    const bbox: [number, number, number, number] = [-4, 40, -3, 41];
    expect(estimateCells(bbox, 11)).toBe(coverBbox(bbox, 11).length);
  });
});

describe('resolutionForZoom', () => {
  it('uses 256px tiles, one zoom above the 512px map zoom', () => {
    expect(resolutionForZoom(10)).toBe(11);
  });

  it('stays in range', () => {
    expect(resolutionForZoom(-1)).toBe(MIN_ZOOM);
    expect(resolutionForZoom(40)).toBe(MAX_ZOOM);
  });
});
