import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Map as MapLibreMap } from 'maplibre-gl';
import type { GeoJSONStoreFeatures } from 'terra-draw';
import type { Geometry } from 'geojson';
import { formatMeasurement, measureShape, Measurer } from './measure';
import type { Measurement } from './measure';

const terraDrawInstance = vi.hoisted(() => ({ current: null as unknown }));
const adapterConfig = vi.hoisted(() => ({ current: null as any }));

vi.mock('terra-draw-maplibre-gl-adapter', () => ({
  TerraDrawMapLibreGLAdapter: class {
    constructor(config: unknown) {
      adapterConfig.current = config;
    }
  },
}));
vi.mock('terra-draw', () => ({
  TerraDraw: class {
    constructor() {
      return terraDrawInstance.current as object;
    }
  },
  TerraDrawLineStringMode: class {},
  TerraDrawPolygonMode: class {},
  TerraDrawRenderMode: class {},
}));

function fakeTerraDraw() {
  const listeners: Record<string, (...args: any[]) => void> = {};
  const store = new Map<string, GeoJSONStoreFeatures>();
  return {
    listeners,
    store,
    start: vi.fn(),
    on: (event: string, listener: (...args: any[]) => void) => {
      listeners[event] = listener;
    },
    setMode: vi.fn(),
    clear: vi.fn(() => store.clear()),
    getSnapshotFeature: (id: string) => store.get(id),
    removeFeatures: vi.fn((ids: string[]) => ids.forEach((id) => store.delete(id))),
    /** What a drawing mode does as the pointer moves and clicks. */
    put(id: string, geometry: Geometry, type: 'create' | 'update' = 'update') {
      store.set(id, { id, type: 'Feature', geometry, properties: {} } as GeoJSONStoreFeatures);
      listeners.change([id], type);
    },
  };
}

const line = (...coordinates: number[][]): Geometry => ({ type: 'LineString', coordinates });
const ring = [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]];

describe('formatMeasurement', () => {
  it('shows a length on its own', () => {
    expect(formatMeasurement({ lengthKm: 12.3456 }, 'metric')).toBe('12.3 km');
  });

  it('shows the perimeter along with an area, in either units', () => {
    expect(formatMeasurement({ areaKm2: 2.5, perimeterKm: 6.4 }, 'metric')).toBe('2.5 km² · 6.4 km perimeter');
    expect(formatMeasurement({ areaKm2: 2.59, perimeterKm: 6.437 }, 'imperial')).toBe('1 mi² · 4 mi perimeter');
  });
});

describe('measureShape', () => {
  it('measures lines by length', () => {
    const measurement = measureShape(line([0, 0], [1, 0])) as { lengthKm: number };
    expect(measurement.lengthKm).toBeCloseTo(111.32, 1);
  });

  it('measures polygons by area and perimeter', () => {
    const measurement = measureShape({ type: 'Polygon', coordinates: [ring] }) as { areaKm2: number; perimeterKm: number };
    expect(measurement.areaKm2).toBeCloseTo(12308.8, 0);
    expect(measurement.perimeterKm).toBeCloseTo(443.9, 0);
  });

  it('has nothing to say about points', () => {
    expect(measureShape({ type: 'Point', coordinates: [0, 0] })).toBeNull();
  });
});

describe('Measurer', () => {
  let terraDraw: ReturnType<typeof fakeTerraDraw>;
  let onChange: ReturnType<typeof vi.fn<(measurement: Measurement | null) => void>>;
  let measurer: Measurer;

  beforeEach(() => {
    terraDraw = fakeTerraDraw();
    terraDrawInstance.current = terraDraw;
    onChange = vi.fn<(measurement: Measurement | null) => void>();
    const map = { once: (_type: string, handler: () => void) => handler() };
    measurer = new Measurer(map as unknown as MapLibreMap, onChange);
  });

  it('draws on layers of its own, apart from features', () => {
    expect(adapterConfig.current.prefixId).toBe('td-measure');
    expect(terraDraw.start).toHaveBeenCalled();
  });

  it('starts with nothing measured', () => {
    measurer.start('measure-line');
    expect(terraDraw.setMode).toHaveBeenLastCalledWith('measure-line');
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('measures the shape as it is drawn', () => {
    measurer.start('measure-line');
    terraDraw.put('a', line([0, 0], [0, 0]), 'create');
    expect(onChange).toHaveBeenLastCalledWith({ lengthKm: 0 });
    terraDraw.put('a', line([0, 0], [1, 0]));
    expect((onChange.mock.lastCall![0] as { lengthKm: number }).lengthKm).toBeCloseTo(111.32, 1);
  });

  it('ignores the guidance points around the shape', () => {
    measurer.start('measure-area');
    terraDraw.put('closing', { type: 'Point', coordinates: [0, 0] }, 'create');
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('keeps a finished measurement until the next one starts', () => {
    measurer.start('measure-line');
    terraDraw.put('a', line([0, 0], [1, 0]), 'create');
    terraDraw.listeners.finish('a');
    expect(terraDraw.removeFeatures).not.toHaveBeenCalled();

    terraDraw.put('b', line([5, 5], [5, 5]), 'create');
    expect(terraDraw.removeFeatures).toHaveBeenCalledWith(['a']);
    expect(onChange).toHaveBeenLastCalledWith({ lengthKm: 0 });
  });

  it('clears everything when stopped', () => {
    measurer.start('measure-area');
    terraDraw.put('a', { type: 'Polygon', coordinates: [ring] }, 'create');
    measurer.stop();
    expect(terraDraw.setMode).toHaveBeenLastCalledWith('measure-idle');
    expect(terraDraw.store.size).toBe(0);
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});
