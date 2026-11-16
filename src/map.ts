import {
  AttributionControl,
  Map,
  NavigationControl,
  ScaleControl,
  setWorkerUrl,
} from "maplibre-gl";
import type {
  ExpressionSpecification,
  FillLayerSpecification,
  FilterSpecification,
  SkySpecification,
  StyleSpecification,
} from "maplibre-gl";
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { rasterStyle } from "./customBasemap";
import { GALAXY_ATTRIBUTION, SPACE_BACKGROUND } from "./starfield";
import type { Bbox } from "./grids/types";
import { basemapStyleUrl } from "./settings";
import type { Projection, Settings, ShownBasemap } from "./settings";
import type { Units } from "./units";

// MapLibre expects its worker next to its own module, which doesn't survive bundling.
setWorkerUrl(maplibreWorkerUrl);

const MAX_MERCATOR_LAT = 85.05;

/**
 * As far out as the map goes: on the globe, all of it in view and still big enough to read; flat,
 * the whole world in one tile, as Web Mercator has it at zoom 0.
 */
export const MIN_ZOOM: Record<Projection, number> = { globe: 2, mercator: 0 };

/** What the map's style is fitted to beyond the basemap itself. */
export interface MapLook {
  /** Whether the basemap is dark, for a sky to match. */
  dark: boolean;
  projection: Projection;
}

/** Sources and layers of our own (grids, Terra Draw's 'td' and 'td-measure', point emoji, polygon extrusion), as opposed to the basemap's. */
const OVERLAY_PREFIXES = ["grid-", "td-", "gw-", "z-"];
const isOverlay = (id: string) =>
  OVERLAY_PREFIXES.some((prefix) => id.startsWith(prefix));

/** An OpenFreeMap style URL, or a raster style around the custom tiles. */
export function basemapStyle({
  basemap,
  customBasemap,
}: {
  basemap: ShownBasemap;
  customBasemap: Settings["customBasemap"];
}): string | StyleSpecification {
  if (basemap !== "custom") return basemapStyleUrl(basemap);
  // Settings never pair custom with no tiles, but the default is a safe answer if they did.
  return customBasemap
    ? rasterStyle(customBasemap.source)
    : basemapStyleUrl("liberty");
}

export function createMap(
  container: string | HTMLElement,
  style: string | StyleSpecification,
  look: MapLook,
  units: Units,
): { map: Map; scale: ScaleControl } {
  // OpenFreeMap's tiles carry their own attribution.
  const map = new Map({
    container,
    center: [-3, 40],
    zoom: 8,
    minZoom: MIN_ZOOM[look.projection],
    attributionControl: false,
  });
  // MapLibre's defaults (collapsible, crediting MapLibre), with credits that follow the projection.
  const attribution = new AttributionControl({
    compact: true,
    customAttribution: credits(look.projection),
  });
  attributions.set(map, attribution);
  map.addControl(attribution);
  // Through setBasemap, so the first style is transformed (3D buildings) as later ones are.
  setBasemap(map, style, look);
  startAttributionCollapsed(map);
  const scale = new ScaleControl({ unit: units });

  // The needle leans as the map tilts, so a tilted map shows it; dragging it tilts too.
  const navigation = new NavigationControl({ visualizePitch: true });
  map.addControl(navigation, "top-right");
  enableCompassTilt(map, navigation);
  map.addControl(scale, "bottom-left");

  return { map, scale };
}

/**
 * Credits of our own beside the basemap's: MapLibre, and place search, which is OpenStreetMap
 * data too and must say so even over a custom basemap. The globe adds the Milky Way behind it.
 */
export function credits(projection: Projection): string[] {
  return [
    '<a href="https://maplibre.org/" target="_blank">MapLibre</a>',
    'Search by <a href="https://photon.komoot.io/" target="_blank" rel="noopener">Photon</a> and <a href="https://nominatim.org/" target="_blank" rel="noopener">Nominatim</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
    ...(projection === "globe" ? [GALAXY_ATTRIBUTION] : []),
  ];
}

/** Each map's attribution control, for its credits to change with the projection. */
const attributions = new WeakMap<Map, AttributionControl>();

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
export function setBasemap(
  map: Map,
  style: string | StyleSpecification,
  look: MapLook,
): void {
  map.setStyle(style, {
    transformStyle: (previous, next) =>
      withOverlays(previous, withSky(withBuildings3d(next), look)),
  });
  map.getContainer().style.background = backdrop(look);
}

/** Switch between the globe and flat Web Mercator, and how far out each lets you zoom. */
export function setProjection(map: Map, look: MapLook): void {
  map.setProjection({ type: look.projection });
  const attribution = attributions.get(map);
  if (attribution) {
    attribution.options.customAttribution = credits(look.projection);
    attribution._updateAttributions();
  }
  map.setMinZoom(MIN_ZOOM[look.projection]);
  map.getContainer().style.background = backdrop(look);
}

/** What shows around the world zoomed out: space for the starfield round the globe, or sky round the flat map. */
export function backdrop({ dark, projection }: MapLook): string {
  return projection === "globe" ? SPACE_BACKGROUND : skyBackground(dark);
}

/**
 * What shows around the flat map zoomed out. MapLibre draws its sky only above a tilted horizon
 * and leaves the rest of the canvas clear, so the space around the world is the container's: the
 * same sky, lighter towards the middle as the horizon is.
 */
export function skyBackground(dark: boolean): string {
  const sky = SKIES[dark ? "dark" : "light"];
  return `radial-gradient(circle, ${sky["horizon-color"]} 30%, ${sky["sky-color"]} 75%)`;
}

/** The sky over a light basemap and a dark one: a day sky, and a night one in the Dark style's tones. */
export const SKIES: Record<"light" | "dark", SkySpecification> = {
  light: {
    "sky-color": "#88c6fc",
    "horizon-color": "#e8f2fc",
    "fog-color": "#ffffff",
  },
  dark: {
    "sky-color": "#0b1626",
    "horizon-color": "#26384f",
    "fog-color": "#1a1d21",
  },
};

/** The atmosphere's glow around the globe, full zoomed out and gone by the time it's flat. */
const ATMOSPHERE_BLEND: ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["zoom"],
  5,
  1,
  7,
  0,
];

/**
 * The style in the chosen projection, under a sky that suits the basemap. MapLibre's globe blends
 * into Web Mercator as you zoom in, so the two differ only zoomed out. Projection and sky belong
 * to the style, so every basemap is given them, custom ones too, replacing any of their own.
 */
export function withSky(
  style: StyleSpecification,
  { dark, projection }: MapLook,
): StyleSpecification {
  return {
    ...style,
    projection: { type: projection },
    sky: {
      ...SKIES[dark ? "dark" : "light"],
      "atmosphere-blend": ATMOSPHERE_BLEND,
    },
  };
}

/**
 * How a vector tile schema describes buildings: the source layer holding them, and how tall each
 * is, for raising them in 3D. Styles are matched by schema, not by name, so a new style on a
 * known schema needs nothing, and a new schema one entry here.
 */
export interface BuildingSchema {
  sourceLayer: string;
  height: ExpressionSpecification;
  base: ExpressionSpecification;
  /** Which buildings to raise: some are drawn in parts as well as whole. */
  filter?: FilterSpecification;
}

export const BUILDING_SCHEMAS: BuildingSchema[] = [
  // OpenMapTiles, which OpenFreeMap's styles use. Outlines flagged hide_3d also come as parts.
  {
    sourceLayer: "building",
    height: ["get", "render_height"],
    base: ["get", "render_min_height"],
    filter: ["!", ["has", "hide_3d"]],
  },
];

/** Where flat buildings give way to 3D ones, as in OpenFreeMap's Liberty: the tiles' last zoom. */
export const BUILDINGS_3D_MIN_ZOOM = 14;
export const BUILDINGS_3D_ID = "buildings-3d";
/** As Liberty's, scaled by the flat buildings' own opacity: as subtle in 3D as they were flat. */
const BUILDINGS_3D_OPACITY = 0.8;

/** A flat layer's opacity, where it's one number; one that varies with zoom counts as whole. */
const flatOpacity = (layer: FillLayerSpecification) => {
  const opacity = layer.paint?.["fill-opacity"];
  return typeof opacity === "number" ? opacity : 1;
};

/**
 * The style with its flat buildings raised in 3D past BUILDINGS_3D_MIN_ZOOM, as Liberty has
 * them: the flat layers stop there, and a 3D one in their colour takes over, so buildings are
 * never drawn twice. The same data, so nothing more to download. Styles that raise their
 * buildings already, or have none in a known schema, are left as they are.
 */
export function withBuildings3d(style: StyleSpecification): StyleSpecification {
  const layers = [...style.layers];
  for (const schema of BUILDING_SCHEMAS) {
    const ofSchema = (type: string) =>
      layers.filter(
        (layer) =>
          layer.type === type &&
          "source-layer" in layer &&
          layer["source-layer"] === schema.sourceLayer,
      );
    const flat = ofSchema("fill") as FillLayerSpecification[];
    if (flat.length === 0 || ofSchema("fill-extrusion").length > 0) continue;

    for (const layer of flat) {
      const index = layers.indexOf(layer);
      layers[index] = {
        ...layer,
        maxzoom: Math.min(layer.maxzoom ?? 24, BUILDINGS_3D_MIN_ZOOM),
      };
    }
    // Above the last flat layer, in the first's colour: the main one, where a style draws
    // roofs or outlines over it.
    const last = layers.findIndex((l) => l.id === flat.at(-1)!.id);
    layers.splice(last + 1, 0, {
      id: BUILDINGS_3D_ID,
      type: "fill-extrusion",
      source: flat[0].source,
      "source-layer": schema.sourceLayer,
      minzoom: BUILDINGS_3D_MIN_ZOOM,
      // The flat layers' filters are left out: in OpenFreeMap's, they keep polygons alone,
      // which extrusion does anyway.
      ...(schema.filter && { filter: schema.filter }),
      paint: {
        "fill-extrusion-color":
          flat[0].paint?.["fill-color"] ?? "hsl(35, 8%, 85%)",
        "fill-extrusion-height": schema.height,
        "fill-extrusion-base": schema.base,
        "fill-extrusion-opacity": BUILDINGS_3D_OPACITY * flatOpacity(flat[0]),
      },
    });
  }
  return { ...style, layers };
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
