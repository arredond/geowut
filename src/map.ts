import {
  Map,
  NavigationControl,
  ScaleControl,
  setWorkerUrl,
} from "maplibre-gl";
import type { StyleSpecification } from "maplibre-gl";
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { rasterStyle } from "./customBasemap";
import type { Bbox } from "./grids/types";
import { basemapStyleUrl } from "./settings";
import type { Settings } from "./settings";
import type { Units } from "./units";

// MapLibre expects its worker next to its own module, which doesn't survive bundling.
setWorkerUrl(maplibreWorkerUrl);

const MAX_MERCATOR_LAT = 85.05;

/** Sources and layers of our own (grids, Terra Draw's 'td' and 'td-measure', polygon extrusion), as opposed to the basemap's. */
const OVERLAY_PREFIXES = ["grid-", "td-", "z-"];
const isOverlay = (id: string) =>
  OVERLAY_PREFIXES.some((prefix) => id.startsWith(prefix));

/** An OpenFreeMap style URL, or a raster style around the custom tiles. */
export function basemapStyle({
  basemap,
  customBasemap,
}: Pick<Settings, "basemap" | "customBasemap">): string | StyleSpecification {
  if (basemap !== "custom") return basemapStyleUrl(basemap);
  // Settings never pair custom with no tiles, but the default is a safe answer if they did.
  return customBasemap
    ? rasterStyle(customBasemap.source)
    : basemapStyleUrl("liberty");
}

export function createMap(
  container: string | HTMLElement,
  style: string | StyleSpecification,
  units: Units,
): { map: Map; scale: ScaleControl } {
  // OpenFreeMap's tiles carry their own attribution.
  const map = new Map({
    container,
    style,
    center: [-3, 40],
    zoom: 8,
    // MapLibre's defaults (collapsible, crediting MapLibre) plus place search, which is
    // OpenStreetMap data too and must say so even over a custom basemap.
    attributionControl: {
      compact: true,
      customAttribution: [
        '<a href="https://maplibre.org/" target="_blank">MapLibre</a>',
        'Search by <a href="https://photon.komoot.io/" target="_blank" rel="noopener">Photon</a> and <a href="https://nominatim.org/" target="_blank" rel="noopener">Nominatim</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
      ],
    },
  });
  startAttributionCollapsed(map);
  const scale = new ScaleControl({ unit: units });

  // The needle leans as the map tilts, so a tilted map shows it; dragging it tilts too.
  const navigation = new NavigationControl({ visualizePitch: true });
  map.addControl(navigation, "top-right");
  enableCompassTilt(map, navigation);
  map.addControl(scale, "bottom-left");

  return { map, scale };
}

/** How far a click on the compass tilts the map, in degrees: enough to see extruded polygons stand. */
export const COMPASS_TILT = 50;

const DRAG_HINT = "Ctrl+drag the map to tilt and rotate it";

/** What clicking the compass does: tilt a flat, north-up map, or set any other back to that. */
export function compassAction(
  bearing: number,
  pitch: number,
): "tilt" | "reset" {
  // Rotated a hair by a gesture still counts as rotated, but floating-point noise doesn't.
  return Math.abs(bearing) < 0.01 && pitch < 0.01 ? "tilt" : "reset";
}

/** What the compass's tooltip says: what a click does, then how to tilt and rotate by hand. */
export function compassHint(
  bearing: number,
  pitch: number,
): { action: string; help: string } {
  return {
    action:
      compassAction(bearing, pitch) === "tilt"
        ? "Tilt the map"
        : "Reset rotation and tilt",
    help: DRAG_HINT,
  };
}

/** The same, as one label for screen readers. */
export function compassTitle(bearing: number, pitch: number): string {
  const { action, help } = compassHint(bearing, pitch);
  return `${action}. ${help}.`;
}

/**
 * Makes the compass a way into the tilted view, which extruded polygons need and few find:
 * clicking it tilts a flat map, and on a tilted or rotated one resets both, where MapLibre's
 * resets only the rotation. Dragging it rotates and tilts the map, as MapLibre has it.
 */
function enableCompassTilt(map: Map, navigation: NavigationControl): void {
  const compass = navigation._compass;
  if (!compass) return;
  // Our own tooltip, shown at once on hover, where the browser's (from title) takes a second or
  // so. Screen readers get the same through the label instead.
  const hint = document.createElement("span");
  hint.className = "compass-hint";
  hint.setAttribute("aria-hidden", "true");
  const action = document.createElement("strong");
  const help = document.createElement("span");
  hint.append(action, help);
  compass.appendChild(hint);
  compass.removeAttribute("title");

  const updateTitle = () => {
    const [bearing, pitch] = [map.getBearing(), map.getPitch()];
    const text = compassHint(bearing, pitch);
    action.textContent = text.action;
    help.textContent = text.help;
    compass.setAttribute("aria-label", compassTitle(bearing, pitch));
  };
  // Caught on the way down, before MapLibre's own click handler on the button. A drag that
  // rotated the map has its click swallowed by MapLibre before it gets here.
  navigation._container.addEventListener(
    "click",
    (e) => {
      if (!compass.contains(e.target as Node)) return;
      e.stopPropagation();
      if (compassAction(map.getBearing(), map.getPitch()) === "tilt")
        map.easeTo({ pitch: COMPASS_TILT });
      else map.easeTo({ bearing: 0, pitch: 0 });
    },
    { capture: true },
  );
  map.on("rotate", updateTitle);
  map.on("pitch", updateTitle);
  updateTitle();
}

/**
 * MapLibre's compact attribution opens expanded and collapses on the first drag. Its credits
 * are long, so start collapsed instead: the state that first drag leaves, which MapLibre
 * doesn't undo afterwards, so the ⓘ button still toggles it.
 */
function startAttributionCollapsed(map: Map): void {
  const collapse = () => {
    const attribution = map
      .getContainer()
      .querySelector(".maplibregl-ctrl-attrib.maplibregl-compact");
    if (!attribution) return;
    attribution.classList.remove("maplibregl-compact-show");
    map.off("styledata", collapse);
  };
  // It turns compact once it has credits to show, which may wait for the style.
  map.on("styledata", collapse);
  collapse();
}

/** Swap the basemap underneath, keeping our sources and layers, with their data, on top as they were. */
export function setBasemap(map: Map, style: string | StyleSpecification): void {
  map.setStyle(style, {
    transformStyle: (previous, next) => withOverlays(previous, next),
  });
}

export function withOverlays(
  previous: StyleSpecification | undefined,
  next: StyleSpecification,
): StyleSpecification {
  if (!previous) return next;
  const overlaySources = Object.entries(previous.sources).filter(([id]) =>
    isOverlay(id),
  );
  return {
    ...next,
    sources: { ...next.sources, ...Object.fromEntries(overlaySources) },
    layers: [
      ...next.layers,
      ...previous.layers.filter((layer) => isOverlay(layer.id)),
    ],
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
