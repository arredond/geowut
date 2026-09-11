import { Map, NavigationControl, ScaleControl } from 'maplibre-gl';
import type { Bbox } from './grids/types';

const CARTO_VOYAGER_STYLE = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';

export function createMap(container: string | HTMLElement): Map {
  const map = new Map({
    container,
    style: CARTO_VOYAGER_STYLE,
    center: [-3, 40],
    zoom: 8,
    attributionControl: {
      customAttribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, &copy; <a href="https://carto.com/attribution">CARTO</a>',
    },
  });

  map.addControl(new NavigationControl(), 'top-right');
  map.addControl(new ScaleControl(), 'bottom-left');

  return map;
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

  return [west - padX, south - padY, east + padX, north + padY];
}
