import { describe, expect, it } from 'vitest';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { getPaddedViewportBbox } from './map';

function mapWithBounds(west: number, south: number, east: number, north: number): MapLibreMap {
  return { getBounds: () => ({ getWest: () => west, getSouth: () => south, getEast: () => east, getNorth: () => north }) } as unknown as MapLibreMap;
}

describe('getPaddedViewportBbox', () => {
  it('pads by half the viewport on every side', () => {
    expect(getPaddedViewportBbox(mapWithBounds(0, 0, 10, 4))).toEqual([-5, -2, 15, 6]);
  });

  it('honours a custom padding', () => {
    expect(getPaddedViewportBbox(mapWithBounds(0, 0, 10, 4), 0)).toEqual([0, 0, 10, 4]);
  });

  it('stays within mercator latitudes', () => {
    const [, south, , north] = getPaddedViewportBbox(mapWithBounds(0, -80, 10, 80));
    expect(south).toBe(-85.05);
    expect(north).toBe(85.05);
  });

  it('becomes the whole world when zoomed far out', () => {
    const [west, , east] = getPaddedViewportBbox(mapWithBounds(-300, -80, 300, 80));
    expect([west, east]).toEqual([-180, 180]);
  });
});
