import { describe, expect, it } from 'vitest';
import { s2 } from 's2js';
import { cellPolygon, cellStats, coverBbox, estimateCells, levelStats, MAX_LEVEL, MIN_LEVEL, resolutionForZoom } from './s2';
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

describe('cell sizes', () => {
  it('gives S2\'s published averages per level', () => {
    // The S2 cell statistics table: level 12 cells span 3.31 to 6.38 km², 5.07 on average.
    expect(levelStats(12).areaKm2).toBeCloseTo(5.07, 2);
    expect(levelStats(12).edgeKm).toBeCloseTo(2.27, 2);
  });

  it('measures a cell within the spread of its level', () => {
    const [cell] = coverBbox([-3.001, 40, -3, 40.001], 12);
    const { areaKm2, edgeKm } = cellStats(cell.properties.id);
    expect(areaKm2 / levelStats(12).areaKm2).toBeGreaterThan(0.6);
    expect(areaKm2 / levelStats(12).areaKm2).toBeLessThan(1.4);
    expect(edgeKm / levelStats(12).edgeKm).toBeGreaterThan(0.6);
    expect(edgeKm / levelStats(12).edgeKm).toBeLessThan(1.4);
  });
});

describe('cellPolygon', () => {
  it('outlines the cell as the grid layer draws it', () => {
    const [cell] = coverBbox([-3.7, 40.4, -3.699, 40.401], 12);
    expect(cellPolygon(cell.properties.id)).toEqual(cell.geometry);
  });
});
