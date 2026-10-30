import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Map as MapLibreMap, MapMouseEvent } from 'maplibre-gl';
import type { GeoJSONStoreFeatures } from 'terra-draw';
import type { Feature, Geometry } from 'geojson';
import { DrawController, featureGeometry, featureMeasurements, featureProperties, TOOLS } from './draw';
import type { DrawCallbacks } from './draw';

const terraDrawInstance = vi.hoisted(() => ({ current: null as unknown }));
const selectModeOptions = vi.hoisted(() => ({ current: null as any }));

vi.mock('terra-draw-maplibre-gl-adapter', () => ({ TerraDrawMapLibreGLAdapter: class {} }));
vi.mock('terra-draw', () => ({
  TerraDraw: class {
    constructor() {
      return terraDrawInstance.current as object;
    }
  },
  TerraDrawCircleMode: class {},
  TerraDrawFreehandMode: class {},
  TerraDrawLineStringMode: class {},
  TerraDrawPointMode: class {},
  TerraDrawPolygonMode: class {},
  TerraDrawRectangleMode: class {},
  TerraDrawRenderMode: class {},
  TerraDrawSelectMode: class {
    constructor(options: unknown) {
      selectModeOptions.current = options;
    }
  },
  TerraDrawSessionUndoRedo: class {},
}));

/** Mimics the Terra Draw validation that matters to pasted data. */
function isValid({ geometry }: GeoJSONStoreFeatures): boolean {
  if (geometry.type !== 'Polygon') return true;
  return geometry.coordinates.length === 1 && geometry.coordinates[0].length >= 4;
}

function fakeTerraDraw() {
  const listeners: Record<string, (...args: unknown[]) => void> = {};
  const store = new Map<unknown, GeoJSONStoreFeatures>();
  return {
    listeners,
    store,
    enabled: false,
    start() {
      this.enabled = true;
    },
    on: (event: string, listener: (...args: unknown[]) => void) => {
      listeners[event] = listener;
    },
    setMode: vi.fn(),
    selectFeature: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    canUndo: vi.fn(() => true),
    canRedo: vi.fn(() => false),
    getSnapshot: () => [...store.values()],
    getSnapshotFeature: (id: unknown) => store.get(id),
    getFeaturesAtLngLat: vi.fn((): GeoJSONStoreFeatures[] => []),
    updateFeatureProperties: vi.fn(),
    removeFeatures: vi.fn((ids: unknown[]) => ids.forEach((id) => store.delete(id))),
    addFeatures: (features: GeoJSONStoreFeatures[]) =>
      features.map((feature) => {
        const valid = isValid(feature);
        if (valid) store.set(feature.id, feature);
        return { id: feature.id, valid };
      }),
  };
}

const feature = (geometry: Geometry, properties: Feature['properties'] = null): Feature => ({ type: 'Feature', geometry, properties });
const ring = [[0, 0], [4, 0], [4, 4], [0, 0]];
const hole = [[1, 1], [2, 1], [2, 2], [1, 1]];
const stored = (id: string, properties = {}) =>
  ({ id, type: 'Feature', geometry: { type: 'Point', coordinates: [1, 2] }, properties }) as unknown as GeoJSONStoreFeatures;
const clickEvent = { lngLat: { lng: 1, lat: 2 } } as unknown as MapMouseEvent;

let terraDraw: ReturnType<typeof fakeTerraDraw>;
let controller: DrawController;
let clickMap: (event: MapMouseEvent) => void;
let callbacks: { [K in keyof DrawCallbacks]: ReturnType<typeof vi.fn> };
const nextTick = () => new Promise((resolve) => setTimeout(resolve));

beforeEach(() => {
  terraDraw = fakeTerraDraw();
  terraDrawInstance.current = terraDraw;
  callbacks = {
    onStateChange: vi.fn(),
    onHistoryChange: vi.fn(),
    onFeatureChanged: vi.fn(),
    onFeaturesRemoved: vi.fn(),
    onMapClicked: vi.fn(),
  };
  const map = {
    once: (_type: string, handler: () => void) => handler(),
    on: (_type: string, handler: typeof clickMap) => {
      clickMap = handler;
    },
  };
  controller = new DrawController(map as unknown as MapLibreMap, callbacks as unknown as DrawCallbacks);
});

describe('states', () => {
  it('starts in select, on a mode that leaves clicks to us', () => {
    expect(controller.state).toBe('select');
    expect(terraDraw.setMode).toHaveBeenLastCalledWith('idle');
  });

  it.each(TOOLS)('switches to the %s tool', (tool) => {
    controller.setState(tool);
    expect(terraDraw.setMode).toHaveBeenLastCalledWith(tool);
    expect(callbacks.onStateChange).toHaveBeenCalledWith(tool);
  });

  it('stays passive in delete state', () => {
    controller.setState('delete');
    expect(terraDraw.setMode).toHaveBeenLastCalledWith('idle');
  });

  it('ignores changes to the current state', () => {
    controller.setState('select');
    expect(callbacks.onStateChange).not.toHaveBeenCalled();
  });

  it('ignores changes before the map has loaded', () => {
    terraDraw.enabled = false;
    controller.setState('point');
    expect(controller.state).toBe('select');
  });
});

describe('drawing', () => {
  beforeEach(() => {
    terraDraw.store.set('a', stored('a'));
  });

  it.each(TOOLS)('goes back to select after one %s', (tool) => {
    controller.setState(tool);
    terraDraw.listeners.finish('a', { action: 'draw' });
    expect(controller.state).toBe('select');
  });

  it('reports the new feature, for the sidebar', () => {
    controller.setState('point');
    terraDraw.listeners.finish('a', { action: 'draw' });
    expect(callbacks.onFeatureChanged).toHaveBeenCalledWith(terraDraw.store.get('a'));
  });

  it('does not treat the click that completed a shape as a click in select state', async () => {
    controller.setState('rectangle');
    terraDraw.listeners.finish('a', { action: 'draw' });
    clickMap(clickEvent);
    expect(callbacks.onMapClicked).not.toHaveBeenCalled();
  });

  it('does not swallow the next click when a shape was finished by keyboard', async () => {
    controller.setState('polygon');
    terraDraw.listeners.finish('a', { action: 'draw' });
    await nextTick();
    clickMap(clickEvent);
    expect(callbacks.onMapClicked).toHaveBeenCalledOnce();
  });

  it.each(TOOLS)('leaves clicks alone while drawing a %s', (tool) => {
    controller.setState(tool);
    clickMap(clickEvent);
    expect(callbacks.onMapClicked).not.toHaveBeenCalled();
  });
});

describe('clicking in select state', () => {
  it('reports the feature under the pointer', () => {
    const under = stored('a');
    terraDraw.getFeaturesAtLngLat.mockReturnValue([under]);
    clickMap(clickEvent);
    expect(callbacks.onMapClicked).toHaveBeenCalledWith(under, clickEvent);
  });

  it('reports empty space too', () => {
    clickMap(clickEvent);
    expect(callbacks.onMapClicked).toHaveBeenCalledWith(undefined, clickEvent);
  });
});

describe('editing', () => {
  it('reaches handles closely enough for midpoints to win over the vertices beside them', () => {
    expect(selectModeOptions.current.pointerDistance).toBeLessThanOrEqual(10);
  });

  it.each(['linestring', 'polygon', 'freehand'])('lets midpoints of a %s be dragged, which needs more than `midpoints: true`', (mode) => {
    expect(selectModeOptions.current.flags[mode].feature.coordinates.midpoints).toEqual({ draggable: true });
  });

  const under = (...features: GeoJSONStoreFeatures[]) => terraDraw.getFeaturesAtLngLat.mockReturnValue(features);

  beforeEach(() => {
    terraDraw.store.set('a', stored('a'));
    controller.edit('a');
  });

  it('selects the feature in Terra Draw', () => {
    expect(controller.state).toBe('edit');
    expect(terraDraw.setMode).toHaveBeenLastCalledWith('select');
    expect(terraDraw.selectFeature).toHaveBeenCalledWith('a');
  });

  it('keeps editing on clicks on the feature or its handles', () => {
    under(stored('a'));
    clickMap(clickEvent);
    under(stored('handle', { selectionPoint: true }));
    clickMap(clickEvent);
    under(stored('handle', { midPoint: true }));
    clickMap(clickEvent);
    expect(controller.state).toBe('edit');
    expect(callbacks.onMapClicked).not.toHaveBeenCalled();
  });

  it('ends on a click elsewhere, which then counts as a normal click', () => {
    clickMap(clickEvent);
    expect(controller.state).toBe('select');
    expect(callbacks.onMapClicked).toHaveBeenCalledWith(undefined, clickEvent);
  });

  it('moves on to another feature when clicking it', () => {
    const other = stored('b');
    under(other);
    clickMap(clickEvent);
    expect(controller.state).toBe('select');
    expect(callbacks.onMapClicked).toHaveBeenCalledWith(other, clickEvent);
  });

  it('stays in edit state and updates the sidebar as the feature changes', () => {
    terraDraw.listeners.finish('a', { action: 'edit' });
    expect(controller.state).toBe('edit');
    expect(callbacks.onFeatureChanged).toHaveBeenCalled();
  });

  it('stops reporting the pasted geometry once the feature is edited', () => {
    terraDraw.store.set('b', stored('b', { sourceGeometry: {} }));
    terraDraw.listeners.finish('b', { action: 'edit' });
    expect(terraDraw.updateFeatureProperties).toHaveBeenCalledWith('b', { sourceGeometry: undefined });

    terraDraw.updateFeatureProperties.mockClear();
    terraDraw.listeners.finish('a', { action: 'edit' });
    expect(terraDraw.updateFeatureProperties).not.toHaveBeenCalled();
  });
});

describe('deleting', () => {
  beforeEach(() => {
    terraDraw.store.set('a', stored('a'));
    terraDraw.store.set('b', stored('b'));
  });

  it('removes the clicked feature and stays on for the next one', () => {
    controller.setState('delete');
    terraDraw.getFeaturesAtLngLat.mockReturnValue([stored('a')]);
    clickMap(clickEvent);

    expect(terraDraw.store.has('a')).toBe(false);
    expect(terraDraw.store.has('b')).toBe(true);
    expect(controller.state).toBe('delete');
    expect(callbacks.onFeaturesRemoved).toHaveBeenCalled();
    expect(callbacks.onMapClicked).not.toHaveBeenCalled();
  });

  it('ignores clicks on empty space', () => {
    controller.setState('delete');
    clickMap(clickEvent);
    expect(terraDraw.removeFeatures).not.toHaveBeenCalled();
  });

  it('removes a whole pasted feature, not just the clicked part', () => {
    terraDraw.store.set('c', stored('c', { sourceId: 'x' }));
    terraDraw.store.set('d', stored('d', { sourceId: 'x' }));
    controller.delete('c');
    expect([...terraDraw.store.keys()]).toEqual(['a', 'b']);
  });

  it('removes everything on request', () => {
    controller.deleteAll();
    expect(terraDraw.store.size).toBe(0);
    expect(callbacks.onFeaturesRemoved).toHaveBeenCalled();
  });
});

describe('history', () => {
  it.each(['undo', 'redo'] as const)('does nothing on %s with nothing to replay, like a disabled button', (action) => {
    terraDraw.canUndo.mockReturnValue(false);
    terraDraw.canRedo.mockReturnValue(false);
    controller.setState('delete');

    controller[action]();

    expect(controller.state).toBe('delete');
    expect(terraDraw[action]).not.toHaveBeenCalled();
    expect(callbacks.onFeaturesRemoved).not.toHaveBeenCalled();
  });

  it('reports what can be undone', () => {
    terraDraw.listeners.history();
    expect(callbacks.onHistoryChange).toHaveBeenCalledWith(true, false);
  });

  it.each(['undo', 'redo'] as const)('leaves any tool and closes what is open on %s', (action) => {
    terraDraw.canRedo.mockReturnValue(true);
    controller.setState('delete');
    controller[action]();
    expect(controller.state).toBe('select');
    expect(terraDraw[action]).toHaveBeenCalled();
    expect(callbacks.onFeaturesRemoved).toHaveBeenCalled();
  });
});

describe('addFeatures', () => {
  const add = (...features: Feature[]) => controller.addFeatures(features);

  it.each<[Geometry['type'], Geometry, string]>([
    ['Point', { type: 'Point', coordinates: [1, 2] }, 'point'],
    ['LineString', { type: 'LineString', coordinates: [[1, 2], [3, 4]] }, 'linestring'],
    ['Polygon', { type: 'Polygon', coordinates: [ring] }, 'polygon'],
  ])('adds a %s in its mode', (_type, geometry, mode) => {
    const { added, rejected } = add(feature(geometry));
    expect(rejected).toBe(0);
    expect(added).toHaveLength(1);
    expect(added[0].properties.mode).toBe(mode);
    expect(added[0].geometry).toEqual(geometry);
  });

  it.each<[Geometry['type'], Geometry, number]>([
    ['MultiPoint', { type: 'MultiPoint', coordinates: [[1, 2], [3, 4]] }, 2],
    ['MultiLineString', { type: 'MultiLineString', coordinates: [[[1, 2], [3, 4]], [[5, 6], [7, 8]]] }, 2],
    ['MultiPolygon', { type: 'MultiPolygon', coordinates: [[ring], [ring], [ring]] }, 3],
    ['GeometryCollection', { type: 'GeometryCollection', geometries: [{ type: 'Point', coordinates: [1, 2] }, { type: 'Polygon', coordinates: [ring] }] }, 2],
  ])('splits a %s but keeps it to report', (_type, geometry, parts) => {
    const { added } = add(feature(geometry));
    expect(added).toHaveLength(parts);
    for (const part of added) expect(featureGeometry(part)).toEqual(geometry);
  });

  it('draws polygons without their holes but keeps them to report', () => {
    const geometry: Geometry = { type: 'Polygon', coordinates: [ring, hole] };
    const [added] = add(feature(geometry)).added;
    expect(added.geometry).toEqual({ type: 'Polygon', coordinates: [ring] });
    expect(featureGeometry(added)).toEqual(geometry);
  });

  it('does not duplicate geometries that are drawn as they are', () => {
    const [added] = add(feature({ type: 'Polygon', coordinates: [ring] })).added;
    expect(added.properties.sourceGeometry).toBeUndefined();
  });

  it('trims coordinates to what Terra Draw accepts', () => {
    const [added] = add(feature({ type: 'Point', coordinates: [1.123456789012, 2.5, 650] })).added;
    expect(added.geometry.coordinates).toEqual([1.123456789, 2.5]);
  });

  it('carries properties to every part', () => {
    const geometry: Geometry = { type: 'MultiPoint', coordinates: [[1, 2], [3, 4]] };
    for (const part of add(feature(geometry, { name: 'Centro' })).added) {
      expect(featureProperties(part)).toEqual({ name: 'Centro' });
    }
  });

  it('treats empty properties as none', () => {
    const [added] = add(feature({ type: 'Point', coordinates: [1, 2] }, {})).added;
    expect(featureProperties(added)).toBeNull();
  });

  it('counts features Terra Draw refuses or that are malformed, and returns the rest', () => {
    const { added, rejected } = add(
      feature({ type: 'Point', coordinates: [1, 2] }),
      feature({ type: 'Polygon', coordinates: [[[0, 0], [1, 1]]] }),
      feature({ type: 'Polygon' } as unknown as Geometry),
      feature({ type: 'Nonsense' } as unknown as Geometry),
    );
    expect(added).toHaveLength(1);
    expect(rejected).toBe(3);
  });

  it('counts a feature with a refused part as rejected, keeping the valid parts', () => {
    const { added, rejected } = add(feature({ type: 'MultiPolygon', coordinates: [[ring], [[[0, 0], [1, 1]]]] }));
    expect(added).toHaveLength(1);
    expect(rejected).toBe(1);
  });

  it('gives every part of a split feature the same source, and none to whole features', () => {
    const { added } = add(feature({ type: 'MultiPoint', coordinates: [[1, 2], [3, 4]] }));
    expect(added[0].properties.sourceId).toBeDefined();
    expect(added[0].properties.sourceId).toBe(added[1].properties.sourceId);
    expect(add(feature({ type: 'Point', coordinates: [1, 2] })).added[0].properties.sourceId).toBeUndefined();
  });

  it('adds nothing before the map has loaded', () => {
    terraDraw.enabled = false;
    expect(add(feature({ type: 'Point', coordinates: [1, 2] }))).toEqual({ added: [], rejected: 1 });
  });
});


describe('featureMeasurements', () => {
  const part = (geometry: Geometry, properties = {}) => ({ type: 'Feature', geometry, properties }) as unknown as GeoJSONStoreFeatures;
  const circle: Geometry = {
    type: 'Polygon',
    coordinates: [[[1, 40], [0, 41], [-1, 40], [0, 39], [1, 40]]],
  };

  it('measures what is drawn', () => {
    expect(Object.keys(featureMeasurements(part({ type: 'Point', coordinates: [1, 2] })))).toEqual(['Latitude', 'Longitude']);
  });

  it('measures a polygon with its holes, not the outline drawn on the map', () => {
    const drawn: Geometry = { type: 'Polygon', coordinates: [ring] };
    const source: Geometry = { type: 'Polygon', coordinates: [ring, hole] };
    const whole = featureMeasurements(part(drawn));
    const holed = featureMeasurements(part(drawn, { sourceGeometry: source }));
    expect(holed['Area (km2)']).toBeLessThan(whole['Area (km2)']);
  });

  it('falls back to the drawn part when the pasted geometry has no single answer', () => {
    const source: Geometry = { type: 'MultiPoint', coordinates: [[1, 2], [3, 4]] };
    expect(featureMeasurements(part({ type: 'Point', coordinates: [3, 4] }, { sourceGeometry: source }))).toEqual({ Latitude: 4, Longitude: 3 });
  });

  it('adds the center to circles only', () => {
    const measured = featureMeasurements(part(circle, { mode: 'circle' }));
    expect(Object.keys(measured)).toEqual(['Perimeter (km)', 'Area (km2)', 'Latitude (center)', 'Longitude (center)']);
    expect(featureMeasurements(part(circle, { mode: 'polygon' }))).not.toHaveProperty('Latitude (center)');
  });
});
