import { Map, NavigationControl, ScaleControl, setWorkerUrl } from 'maplibre-gl';
import type { StyleSpecification } from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import type { Bbox } from './grids/types';
import { basemapStyleUrl } from './settings';
import type { Basemap } from './settings';
import type { Units } from './units';

// MapLibre expects its worker next to its own module, which doesn't survive bundling.
setWorkerUrl(maplibreWorkerUrl);

const MAX_MERCATOR_LAT = 85.05;

/** Sources and layers of our own (grids, Terra Draw's 'td' and 'td-measure'), as opposed to the basemap's. */
const OVERLAY_PREFIXES = ['grid-', 'td-'];
const isOverlay = (id: string) => OVERLAY_PREFIXES.some((prefix) => id.startsWith(prefix));

export function createMap(container: string | HTMLElement, basemap: Basemap, units: Units): { map: Map; scale: ScaleControl } {
  // OpenFreeMap's tiles carry their own attribution.
  const map = new Map({ container, style: basemapStyleUrl(basemap), center: [-3, 40], zoom: 8 });
  const scale = new ScaleControl({ unit: units });

  map.addControl(new NavigationControl(), 'top-right');
  map.addControl(scale, 'bottom-left');

  return { map, scale };
}

/** Swap the basemap underneath, keeping our sources and layers, with their data, on top as they were. */
export function setBasemap(map: Map, basemap: Basemap): void {
  map.setStyle(basemapStyleUrl(basemap), { transformStyle: (previous, next) => withOverlays(previous, next) });
}

export function withOverlays(previous: StyleSpecification | undefined, next: StyleSpecification): StyleSpecification {
  if (!previous) return next;
  const overlaySources = Object.entries(previous.sources).filter(([id]) => isOverlay(id));
  return {
    ...next,
    sources: { ...next.sources, ...Object.fromEntries(overlaySources) },
    layers: [...next.layers, ...previous.layers.filter((layer) => isOverlay(layer.id))],
  };
}

/** Current viewport as a padded bbox, in degrees, so grid cells are ready just before they come into view. */
export function getPaddedViewportBbox(map: Map, pad = 0.5): Bbox {
  const bounds = map.getBounds();
  const west = bounds.getWest();
  const east = bounds.getEast();
  const south = bounds.getSouth();
  const north = bounds.getNorth();
  const padX = (east - west) * pad;
  const padY = (north - south) * pad;

  // Zoomed far out the padding can exceed the world, which no grid can cover.
  const worldWide = east - west + 2 * padX >= 360;
  return [
    worldWide ? -180 : west - padX,
    Math.max(-MAX_MERCATOR_LAT, south - padY),
    worldWide ? 180 : east + padX,
    Math.min(MAX_MERCATOR_LAT, north + padY),
  ];
}
