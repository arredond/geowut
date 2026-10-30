import { describe, expect, it } from 'vitest';
import { s2 } from 's2js';
import { coverBbox, estimateCells, MAX_LEVEL, MIN_LEVEL, resolutionForZoom } from './s2';
import type { Bbox } from './types';

const BBOX: Bbox = [-4, 40, -3, 41];

describe('coverBbox', () => {
  const cells = coverBbox(BBOX, 8);

  it('returns valid tokens at the requested level', () => {
    expect(cells.length).toBeGreaterThan(0);
    for (const { properties } of cells) {
      expect(s2.cellid.level(s2.cellid.fromToken(properties.id))).toBe(8);
      expect(properties.label).toBe(properties.id);
    }
  });

  it('returns closed lng/lat rings', () => {
    const ring = cells[0].geometry.coordinates[0];
    expect(ring).toHaveLength(5);
    expect(ring[0]).toEqual(ring[4]);
    expect(ring[0][0]).toBeLessThan(0);
    expect(ring[0][1]).toBeGreaterThan(30);
  });
});

describe('estimateCells', () => {
  it('is within a factor of two of the real count', () => {
    const estimate = estimateCells(BBOX, 11);
    const actual = coverBbox(BBOX, 11).length;
    expect(estimate).toBeGreaterThan(actual / 2);
    expect(estimate).toBeLessThan(actual * 2);
  });
});

describe('resolutionForZoom', () => {
  it('tracks the zoom', () => {
    expect(resolutionForZoom(10.4)).toBe(10);
  });

  it('stays in range', () => {
    expect(resolutionForZoom(0)).toBe(MIN_LEVEL);
    expect(resolutionForZoom(40)).toBe(MAX_LEVEL);
  });
});
