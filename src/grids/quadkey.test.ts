import { describe, expect, it } from 'vitest';
import { boxStats, cellPolygon, cellStats, coverBbox, estimateCells, levelStats, MAX_ZOOM, MIN_ZOOM, quadkeyBounds, resolutionForZoom, tileToQuadkey } from './quadkey';

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

describe('cell sizes', () => {
  it('gives tiles on the equator for each zoom, halving each time', () => {
    expect(levelStats(0).edgeKm).toBeCloseTo(40030, -1);
    expect(levelStats(10).edgeKm).toBeCloseTo(levelStats(0).edgeKm / 1024, 6);
    expect(levelStats(10).areaKm2).toBeCloseTo(levelStats(10).edgeKm ** 2, 6);
  });

  it('finds a tile\'s bounds from its quadkey', () => {
    const [cell] = coverBbox([-3.01, 40, -3, 40.01], 12);
    const [[w, s], , [e, n]] = cell.geometry.coordinates[0];
    expect(quadkeyBounds(cell.properties.id)).toEqual([w, s, e, n]);
  });

  it('measures tiles near the equator as the table does', () => {
    const { areaKm2, edgeKm } = cellStats(tileToQuadkey(512, 511, 10));
    expect(edgeKm / levelStats(10).edgeKm).toBeCloseTo(1, 3);
    expect(areaKm2 / levelStats(10).areaKm2).toBeCloseTo(1, 2);
  });

  it('shrinks tiles with the cosine of latitude', () => {
    const at60 = boxStats([0, 59.99, 0.02, 60.01]);
    const at0 = boxStats([0, -0.01, 0.02, 0.01]);
    // Sides along the meridians don't shrink, so only the width halves.
    expect(at60.areaKm2 / at0.areaKm2).toBeCloseTo(0.5, 3);
  });
});

describe('cellPolygon', () => {
  it('outlines the tile as the grid layer draws it', () => {
    const [cell] = coverBbox([-3.7, 40.4, -3.7, 40.4], 12);
    expect(cellPolygon(cell.properties.id)).toEqual(cell.geometry);
  });
});
