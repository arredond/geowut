import * as h3 from 'h3-js';
import { describe, expect, it } from 'vitest';
import type { LineString, MultiPolygon, Point, Polygon } from 'geojson';
import { h3Coverage, quadkeyCoverage, s2Coverage, TooManyCellsError } from './coverage';

const square = (west: number, south: number, size: number): number[][] => [
  [west, south],
  [west + size, south],
  [west + size, south + size],
  [west, south + size],
  [west, south],
];
const polygon: Polygon = { type: 'Polygon', coordinates: [square(-4, 40, 0.1)] };
const line: LineString = { type: 'LineString', coordinates: [[-4, 40], [-3.9, 40.1]] };

describe('h3Coverage', () => {
  it('finds the cell of a point', () => {
    expect(h3Coverage({ type: 'Point', coordinates: [-3.7, 40.4] }, 7)).toEqual([h3.latLngToCell(40.4, -3.7, 7)]);
  });

  it('covers a polygon', () => {
    expect(h3Coverage(polygon, 7).length).toBeGreaterThan(10);
  });

  it('leaves out holes', () => {
    const withHole: Polygon = { type: 'Polygon', coordinates: [square(-4, 40, 1), square(-3.8, 40.2, 0.6)] };
    expect(h3Coverage(withHole, 6).length).toBeLessThan(h3Coverage({ type: 'Polygon', coordinates: [square(-4, 40, 1)] }, 6).length);
  });

  it('covers every part of a MultiPolygon, not the space between them', () => {
    const multi: MultiPolygon = { type: 'MultiPolygon', coordinates: [[square(-4, 40, 0.1)], [square(2, 50, 0.1)]] };
    const ids = h3Coverage(multi, 7);
    expect(ids.length).toBe(h3Coverage(polygon, 7).length + h3Coverage({ type: 'Polygon', coordinates: [square(2, 50, 0.1)] }, 7).length);
  });

  it('approximates lines by their bbox', () => {
    expect(h3Coverage(line, 7).length).toBeGreaterThan(0);
  });
});

describe('quadkeyCoverage', () => {
  it('covers the bbox with quadkeys of the requested zoom', () => {
    const keys = quadkeyCoverage(polygon, 12);
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.every((key) => key.length === 12)).toBe(true);
  });
});

describe('s2Coverage', () => {
  it('covers polygons and lines', () => {
    expect(s2Coverage(polygon, 10).length).toBeGreaterThan(0);
    expect(s2Coverage(line, 10).length).toBeGreaterThan(0);
  });

  it('covers a point', () => {
    expect(s2Coverage({ type: 'Point', coordinates: [-3.7, 40.4] }, 10)).toHaveLength(1);
  });

  it('covers a MultiPolygon', () => {
    const multi: MultiPolygon = { type: 'MultiPolygon', coordinates: [[square(-4, 40, 0.1)], [square(2, 50, 0.1)]] };
    expect(s2Coverage(multi, 10).length).toBeGreaterThan(0);
  });
});

describe('oversized coverings', () => {
  it('refuses them instead of hanging the page', () => {
    expect(() => h3Coverage(polygon, 15)).toThrow(TooManyCellsError);
    expect(() => quadkeyCoverage(polygon, 23)).toThrow(TooManyCellsError);
    expect(() => s2Coverage(polygon, 24)).toThrow(TooManyCellsError);
  });

  it('still answers for points at the finest resolution', () => {
    const point: Point = { type: 'Point', coordinates: [-3.7, 40.4] };
    expect(h3Coverage(point, 15)).toHaveLength(1);
    expect(quadkeyCoverage(point, 23)).toHaveLength(1);
    expect(s2Coverage(point, 24)).toHaveLength(1);
  });
});
