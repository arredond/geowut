import { describe, expect, it } from 'vitest';
import type { Geometry } from 'geojson';
import { bboxAreaKm2, bboxToString, circleCenter, geometryBbox, geometryCenter, measureGeometry } from './geometry';

describe('geometryBbox', () => {
  it.each<[string, Geometry, number[]]>([
    ['Point', { type: 'Point', coordinates: [1, 2] }, [1, 2, 1, 2]],
    ['LineString', { type: 'LineString', coordinates: [[1, 2], [3, 0]] }, [1, 0, 3, 2]],
    ['Polygon', { type: 'Polygon', coordinates: [[[0, 0], [2, 0], [2, 3], [0, 0]]] }, [0, 0, 2, 3]],
    ['MultiPolygon', { type: 'MultiPolygon', coordinates: [[[[0, 0], [1, 0], [1, 1], [0, 0]]], [[[5, 5], [6, 5], [6, 7], [5, 5]]]] }, [0, 0, 6, 7]],
    ['GeometryCollection', { type: 'GeometryCollection', geometries: [{ type: 'Point', coordinates: [1, 2] }, { type: 'Point', coordinates: [-1, 4] }] }, [-1, 2, 1, 4]],
  ])('handles a %s', (_type, geometry, expected) => {
    expect(geometryBbox(geometry)).toEqual(expected);
  });

  it('ignores altitudes', () => {
    expect(geometryBbox({ type: 'Point', coordinates: [1, 2, 900] })).toEqual([1, 2, 1, 2]);
  });
});

describe('geometryCenter', () => {
  it('returns points as they are', () => {
    expect(geometryCenter({ type: 'Point', coordinates: [1, 2] })).toEqual([1, 2]);
  });

  it('uses the center of the bounding box otherwise', () => {
    expect(geometryCenter({ type: 'LineString', coordinates: [[0, 0], [4, 2]] })).toEqual([2, 1]);
  });
});

describe('bboxAreaKm2', () => {
  it('gives the surface of the Earth for the whole world', () => {
    expect(bboxAreaKm2([-180, -90, 180, 90])).toBeCloseTo(510_000_000, -6);
  });

  it('shrinks with latitude', () => {
    expect(bboxAreaKm2([0, 60, 1, 61])).toBeLessThan(bboxAreaKm2([0, 0, 1, 1]) / 1.9);
  });

  it('does not count beyond the poles or around the world twice', () => {
    expect(bboxAreaKm2([-500, -120, 500, 120])).toBeCloseTo(bboxAreaKm2([-180, -90, 180, 90]));
  });

  it('is zero for a point', () => {
    expect(bboxAreaKm2([1, 2, 1, 2])).toBe(0);
  });
});

describe('bboxToString', () => {
  it('joins with commas', () => {
    expect(bboxToString([1, 2, 3, 4])).toBe('1,2,3,4');
  });
});

describe('measureGeometry', () => {
  const square = (west: number, south: number, size: number) => [
    [west, south],
    [west + size, south],
    [west + size, south + size],
    [west, south + size],
    [west, south],
  ];

  it('gives points their coordinates, rounded to about 10cm', () => {
    expect(measureGeometry({ type: 'Point', coordinates: [-3.70379123, 40.41678912, 650] })).toEqual({ Latitude: 40.416789, Longitude: -3.703791 });
  });

  it('matches the published distance from Flinders Peak to Buninyong on the ellipsoid', () => {
    const flinders = [144 + 25 / 60 + 29.5244 / 3600, -(37 + 57 / 60 + 3.7203 / 3600)];
    const buninyong = [143 + 55 / 60 + 35.3839 / 3600, -(37 + 39 / 60 + 10.1561 / 3600)];
    const measured = measureGeometry({ type: 'LineString', coordinates: [flinders, buninyong] })!;
    expect(measured['Length (km)']).toBeCloseTo(54.9723, 3);
  });

  it('tells a degree of latitude from one of longitude at the equator, which a sphere cannot', () => {
    const north = measureGeometry({ type: 'LineString', coordinates: [[0, -0.5], [0, 0.5]] })!;
    const east = measureGeometry({ type: 'LineString', coordinates: [[0, 0], [1, 0]] })!;
    expect(north['Length (km)']).toBeCloseTo(110.574, 2);
    expect(east['Length (km)']).toBeCloseTo(111.319, 2);
  });

  it('adds up the segments of a line', () => {
    const one = measureGeometry({ type: 'LineString', coordinates: [[0, 10], [0, 11]] })!;
    const two = measureGeometry({ type: 'LineString', coordinates: [[0, 10], [0, 11], [0, 12]] })!;
    expect(two['Length (km)']).toBeGreaterThan(one['Length (km)'] * 1.99);
    expect(two['Length (km)']).toBeLessThan(one['Length (km)'] * 2.01);
  });

  it('knows the distance from Madrid to Barcelona', () => {
    const measured = measureGeometry({ type: 'LineString', coordinates: [[-3.7038, 40.4168], [2.1734, 41.3851]] })!;
    expect(measured['Length (km)']).toBeGreaterThan(500);
    expect(measured['Length (km)']).toBeLessThan(510);
  });

  it('goes the short way across the antimeridian', () => {
    const measured = measureGeometry({ type: 'LineString', coordinates: [[179.5, 0], [-179.5, 0]] })!;
    expect(measured['Length (km)']).toBeCloseTo(111.319, 2);
  });

  it('adds up the lines of a MultiLineString', () => {
    const one = measureGeometry({ type: 'LineString', coordinates: [[0, 10], [0, 11]] })!;
    const two = measureGeometry({ type: 'MultiLineString', coordinates: [[[0, 10], [0, 11]], [[5, 10], [5, 11]]] })!;
    expect(two['Length (km)']).toBeCloseTo(one['Length (km)'] * 2, 2);
  });

  it('gives a one degree square at the equator its ellipsoidal area', () => {
    const measured = measureGeometry({ type: 'Polygon', coordinates: [square(-0.5, -0.5, 1)] })!;
    expect(measured['Area (km2)']).toBeGreaterThan(12300);
    expect(measured['Area (km2)']).toBeLessThan(12320);
  });

  it('knows the area of the northern hemisphere, half of the WGS84 surface', () => {
    const equator = [0, 90, 180, -90, 0].map((lng) => [lng, 0]);
    const measured = measureGeometry({ type: 'Polygon', coordinates: [equator] })!;
    expect(measured['Area (km2)']).toBeCloseTo(255_032_800, -3);
  });

  it('does not use Mercator: the same degrees cover less ground at high latitude', () => {
    const area = (lat: number) => measureGeometry({ type: 'Polygon', coordinates: [square(0, lat, 1)] })!['Area (km2)'];
    const ratio = area(60) / area(0);
    expect(ratio).toBeGreaterThan(0.48);
    expect(ratio).toBeLessThan(0.52);
  });

  it('does not depend on winding order', () => {
    const clockwise = [...square(-4, 40, 1)].reverse();
    expect(measureGeometry({ type: 'Polygon', coordinates: [clockwise] })).toEqual(measureGeometry({ type: 'Polygon', coordinates: [square(-4, 40, 1)] }));
  });

  it('takes holes out of the area but counts them in the perimeter', () => {
    const solid = measureGeometry({ type: 'Polygon', coordinates: [square(-4, 40, 1)] })!;
    const holed = measureGeometry({ type: 'Polygon', coordinates: [square(-4, 40, 1), square(-3.75, 40.25, 0.5)] })!;
    expect(holed['Area (km2)']).toBeLessThan(solid['Area (km2)'] * 0.76);
    expect(holed['Perimeter (km)']).toBeGreaterThan(solid['Perimeter (km)'] * 1.45);
  });

  it('adds up the parts of a MultiPolygon, however far apart', () => {
    const one = measureGeometry({ type: 'Polygon', coordinates: [square(10, 0, 1)] })!;
    const two = measureGeometry({ type: 'MultiPolygon', coordinates: [[square(10, 0, 1)], [square(100, 0, 1)]] })!;
    expect(two['Area (km2)']).toBeCloseTo(one['Area (km2)'] * 2, 0);
    expect(two['Perimeter (km)']).toBeCloseTo(one['Perimeter (km)'] * 2, 1);
  });

  it('does not round small shapes down to zero', () => {
    const measured = measureGeometry({ type: 'Polygon', coordinates: [square(-3.7, 40.4, 0.0001)] })!;
    expect(measured['Area (km2)']).toBeGreaterThan(0);
    expect(measured['Perimeter (km)']).toBeGreaterThan(0);
  });

  it('has no single answer for mixed or multi-point geometries', () => {
    expect(measureGeometry({ type: 'MultiPoint', coordinates: [[1, 2]] })).toBeNull();
    expect(measureGeometry({ type: 'GeometryCollection', geometries: [] })).toBeNull();
  });
});

describe('circleCenter', () => {
  /** The way Terra Draw builds circles with the globe projection: equal bearings around a center on the sphere. */
  function sphericalCircle([lng, lat]: [number, number], radiusKm: number): number[][] {
    const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
    const toDegrees = (radians: number) => (radians * 180) / Math.PI;
    const distance = radiusKm / 6371;
    const ring = Array.from({ length: 64 }, (_, i) => {
      const bearing = (i / 64) * 2 * Math.PI;
      const sinLat = Math.sin(toRadians(lat)) * Math.cos(distance) + Math.cos(toRadians(lat)) * Math.sin(distance) * Math.cos(bearing);
      const deltaLng = Math.atan2(
        Math.sin(bearing) * Math.sin(distance) * Math.cos(toRadians(lat)),
        Math.cos(distance) - Math.sin(toRadians(lat)) * sinLat,
      );
      return [((lng + toDegrees(deltaLng) + 540) % 360) - 180, toDegrees(Math.asin(sinLat))];
    });
    return [...ring, ring[0]];
  }

  it.each<[number, number]>([[-3.7, 40.4], [120, -60], [0, 0], [10, 70], [179.95, 10]])('finds the center of a circle at %d, %d', (lng, lat) => {
    const center = circleCenter(sphericalCircle([lng, lat], 500));
    expect(center['Longitude (center)']).toBeCloseTo(lng, 4);
    expect(center['Latitude (center)']).toBeCloseTo(lat, 4);
  });
});
