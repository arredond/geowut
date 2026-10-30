import * as h3 from 'h3-js';
import { describe, expect, it } from 'vitest';
import { coverBbox, estimateCells, MAX_RESOLUTION, MIN_RESOLUTION, resolutionForZoom } from './h3';
import type { Bbox } from './types';

const MADRID: [number, number] = [-3.7, 40.4];

/** A 1280x800 viewport at a MapLibre zoom, without padding. */
function viewport([lng, lat]: [number, number], zoom: number): Bbox {
  const halfWidth = ((1280 / 512 / 2 ** zoom) * 360) / 2;
  const halfHeight = ((800 / 512 / 2 ** zoom) * 360 * Math.cos((lat * Math.PI) / 180)) / 2;
  return [lng - halfWidth, lat - halfHeight, lng + halfWidth, lat + halfHeight];
}

describe('coverBbox', () => {
  describe('regression: cells disappearing while zooming', () => {
    it('reproduces the cause: the default centroid test finds nothing when no cell center is in view', () => {
      const [west, south, east, north] = viewport(MADRID, 10);
      const ring = [
        [south, west],
        [north, west],
        [north, east],
        [south, east],
      ];
      expect(h3.polygonToCells(ring, 2)).toEqual([]);
    });

    it('still draws the cell filling the viewport when its center is outside', () => {
      const bbox = viewport(MADRID, 10);
      const ids = coverBbox(bbox, 2).map((f) => f.properties.id);
      expect(ids).toContain(h3.latLngToCell(MADRID[1], MADRID[0], 2));
    });

    it.each([...Array(19).keys()])('leaves no gap in the viewport at zoom %i', (zoom) => {
      const [west, south, east, north] = viewport(MADRID, zoom);
      const resolution = resolutionForZoom(zoom);
      const ids = new Set(coverBbox([west, Math.max(south, -85), east, Math.min(north, 85)], resolution).map((f) => f.properties.id));

      expect(ids.size).toBeGreaterThan(0);
      for (let x = 0; x <= 8; x++) {
        for (let y = 0; y <= 8; y++) {
          const lng = west + ((east - west) * x) / 8;
          const lat = Math.max(-85, south) + ((Math.min(85, north) - Math.max(-85, south)) * y) / 8;
          expect(ids.has(h3.latLngToCell(lat, lng, resolution))).toBe(true);
        }
      }
    });

    it('covers the world when the bbox spans it, despite H3 reading edges as the shortest arc', () => {
      const cells = coverBbox([-180, -85.05, 180, 85.05], 1);
      expect(cells.length).toBeGreaterThan(0.9 * h3.getNumCells(1));
    });
  });

  it('returns each cell once, even across split bboxes', () => {
    const ids = coverBbox([-180, -60, 180, 60], 2).map((f) => f.properties.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('covers bboxes crossing the antimeridian', () => {
    const ids = coverBbox([170, -10, 190, 10], 3).map((f) => f.properties.id);
    expect(ids).toContain(h3.latLngToCell(0, 175, 3));
    expect(ids).toContain(h3.latLngToCell(0, -175, 3));
  });

  it('keeps antimeridian-crossing cells contiguous', () => {
    for (const { geometry } of coverBbox([170, -10, 190, 10], 2)) {
      const lngs = geometry.coordinates[0].map(([lng]) => lng);
      expect(Math.max(...lngs) - Math.min(...lngs)).toBeLessThan(180);
    }
  });

  it('labels cells with their index and returns their boundary as GeoJSON', () => {
    const [cell] = coverBbox(viewport(MADRID, 16), resolutionForZoom(16));
    expect(cell.properties.label).toBe(cell.properties.id);
    expect(h3.isValidCell(cell.properties.id)).toBe(true);
    const ring = cell.geometry.coordinates[0];
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    expect(ring[0][0]).toBeLessThan(0); // lng first
  });
});

describe('resolutionForZoom', () => {
  it('never decreases with zoom and stays in range', () => {
    for (let zoom = 0; zoom < 24; zoom += 0.5) {
      const resolution = resolutionForZoom(zoom);
      expect(resolution).toBeGreaterThanOrEqual(MIN_RESOLUTION);
      expect(resolution).toBeLessThanOrEqual(MAX_RESOLUTION);
      expect(resolution).toBeGreaterThanOrEqual(resolutionForZoom(zoom - 0.5));
    }
  });

  it.each([3, 6, 8, 10, 13, 16, 19])('fills the padded viewport with a readable number of cells at zoom %i', (zoom) => {
    const [west, south, east, north] = viewport(MADRID, zoom);
    const padX = (east - west) / 2;
    const padY = (north - south) / 2;
    const cells = coverBbox([west - padX, south - padY, east + padX, north + padY], resolutionForZoom(zoom));
    expect(cells.length).toBeGreaterThan(20);
    expect(cells.length).toBeLessThan(2000);
  });
});

describe('estimateCells', () => {
  it('is within a factor of two of the real count', () => {
    const bbox: Bbox = [-4, 40, -3, 41];
    const estimate = estimateCells(bbox, 7);
    const actual = coverBbox(bbox, 7).length;
    expect(estimate).toBeGreaterThan(actual / 2);
    expect(estimate).toBeLessThan(actual * 2);
  });
});
