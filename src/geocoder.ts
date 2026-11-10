import MaplibreGeocoder from "@maplibre/maplibre-gl-geocoder";
import type {
  CarmenGeojsonFeature,
  MaplibreGeocoderApi,
} from "@maplibre/maplibre-gl-geocoder";
import "@maplibre/maplibre-gl-geocoder/dist/maplibre-gl-geocoder.css";
import type { Feature, Geometry } from "geojson";
import type { FitBoundsOptions, Map as MapLibreMap } from "maplibre-gl";
import type { AddResult } from "./addDataModal";
import { ICONS } from "./icons";

/**
 * Komoot's public Photon, which is built for search-as-you-type over OpenStreetMap data.
 * Its fair-use terms throttle heavy use, so the box waits for a pause in typing and a few
 * characters before asking, and remembers answers.
 */
export const PHOTON_SEARCH_URL = "https://photon.komoot.io/api/";
/** The only languages Photon answers in; it refuses the rest. */
const PHOTON_LANGUAGES = ["en", "de", "fr"];

/**
 * OpenStreetMap's public Nominatim, for a result's full outline when it's added to the map.
 * Its usage policy (https://operations.osmfoundation.org/policies/nominatim/) allows requests
 * users trigger themselves, like that click, but forbids search-as-you-type: hence Photon.
 */
const NOMINATIM_LOOKUP_URL = "https://nominatim.openstreetmap.org/lookup";
/** Degrees to simplify outlines by, about 10 m: plenty for a map, and keeps a country's to a reasonable size. */
const OUTLINE_SIMPLIFICATION = 0.0001;

interface PhotonFeature {
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: {
    osm_type?: "N" | "W" | "R";
    osm_id?: number;
    osm_key?: string;
    osm_value?: string;
    name?: string;
    housenumber?: string;
    street?: string;
    locality?: string;
    district?: string;
    city?: string;
    county?: string;
    state?: string;
    country?: string;
    /** West, north, east, south. */
    extent?: [number, number, number, number];
  } & Record<string, unknown>;
}

/** Photon search, as the geocoder control expects it: GeoJSON places with a name, a centre and a bbox to fit. */
export function photonGeocoderApi(): MaplibreGeocoderApi {
  // Same query, same answer: no need to ask again within a visit.
  const cache = new Map<string, Promise<CarmenGeojsonFeature[]>>();
  let latest: Promise<CarmenGeojsonFeature[]> | undefined;

  const search = async (params: URLSearchParams) => {
    const response = await fetch(`${PHOTON_SEARCH_URL}?${params}`);
    if (!response.ok)
      throw new Error(`Photon answered with HTTP ${response.status}`);
    const { features } = (await response.json()) as {
      features: PhotonFeature[];
    };
    return features.map(toPlace);
  };

  return {
    forwardGeocode: async ({ query, limit = 5, language, proximity }) => {
      const params = new URLSearchParams({
        q: String(query ?? "").trim(),
        limit: String(limit),
      });
      // Typed as a string, but the control splits it into a list before calling.
      const languages = language as string | string[] | undefined;
      const lang = [languages ?? []]
        .flat()[0]
        ?.split(/[-_,\s]/)[0]
        .toLowerCase();
      if (lang && PHOTON_LANGUAGES.includes(lang)) params.set("lang", lang);
      // Nearby places first, once zoomed in enough for the control to pass the map centre.
      if (proximity) {
        params.set("lon", proximity[0].toFixed(3));
        params.set("lat", proximity[1].toFixed(3));
      }

      const key = params.toString();
      let places = cache.get(key);
      if (!places) {
        places = search(params);
        cache.set(key, places);
        // Failures aren't worth remembering.
        places.catch(() => cache.delete(key));
      }

      // Typing fires searches in quick succession, and the control shows whichever answer
      // arrives last. So an older search, if overtaken, answers with the newest's results.
      latest = places;
      let pending = places;
      for (;;) {
        try {
          const features = await pending;
          if (pending === latest)
            return { type: "FeatureCollection", features };
        } catch (error) {
          if (pending === latest) throw error;
        }
        pending = latest;
      }
    },
  };
}

const OSM_TYPES = { N: "node", W: "way", R: "relation" } as const;

function toPlace({
  geometry,
  properties,
}: PhotonFeature): CarmenGeojsonFeature {
  const { name, street, housenumber, extent, osm_type, osm_key, osm_value } =
    properties;
  const address = [street, housenumber].filter(Boolean).join(" ");
  const title = name || address || properties.city || properties.country || "";
  // Name, then street, town, region and country, skipping repeats (a city's own name, say).
  const parts = [
    title,
    address,
    properties.city || properties.locality || properties.district,
    properties.county,
    properties.state,
    properties.country,
  ].filter((part): part is string => Boolean(part));
  const placeName = [...new Set(parts)].join(", ");
  return {
    type: "Feature",
    geometry,
    properties: {
      ...properties,
      display_name: placeName,
      // As Nominatim names them, for looking up outlines.
      ...(osm_type && { osm_type: OSM_TYPES[osm_type] }),
      ...(osm_key && { category: osm_key }),
      ...(osm_value && { type: osm_value }),
    },
    text: title,
    place_name: placeName,
    place_type: ["place"],
    center: geometry.coordinates,
    // The control fits the bbox when there is one (a whole city or country), else flies to the centre.
    ...(extent && { bbox: [extent[0], extent[3], extent[2], extent[1]] }),
  };
}

/** Nominatim's short reference to an OSM object, eg. "R5326784" for relation 5326784. */
export function osmKey(place: CarmenGeojsonFeature): string | null {
  const { osm_type, osm_id } = place.properties ?? {};
  const prefix = { node: "N", way: "W", relation: "R" }[String(osm_type)];
  return prefix && osm_id !== undefined ? `${prefix}${osm_id}` : null;
}

/**
 * A search result as a feature to draw: its full outline (a city's boundary, a road's line),
 * looked up only when asked for, since search results carry just a point.
 */
export function nominatimOutlines(): (
  place: CarmenGeojsonFeature,
) => Promise<Feature> {
  const cache = new Map<string, Promise<Geometry>>();

  const lookup = async (key: string): Promise<Geometry> => {
    const params = new URLSearchParams({
      osm_ids: key,
      format: "geojson",
      polygon_geojson: "1",
      polygon_threshold: String(OUTLINE_SIMPLIFICATION),
    });
    const response = await fetch(`${NOMINATIM_LOOKUP_URL}?${params}`);
    if (!response.ok)
      throw new Error(`Nominatim answered with HTTP ${response.status}`);
    const { features } = (await response.json()) as { features: Feature[] };
    if (!features[0]?.geometry)
      throw new Error("Nominatim has no outline for this place");
    return features[0].geometry;
  };

  return async (place) => {
    const key = osmKey(place);
    // A node is just a point, which the search result already has.
    let geometry: Promise<Geometry> | undefined =
      key && !key.startsWith("N")
        ? cache.get(key)
        : Promise.resolve(place.geometry);
    if (!geometry && key) {
      geometry = lookup(key);
      cache.set(key, geometry);
      geometry.catch(() => cache.delete(key));
    }
    const { category, type, osm_type, osm_id } = place.properties ?? {};
    return {
      type: "Feature",
      geometry: await geometry!,
      properties: {
        name: place.place_name,
        ...(category !== undefined && { category }),
        ...(type !== undefined && { type }),
        // The feature panel links it to openstreetmap.org.
        ...(osm_type !== undefined && { osm: `${osm_type}/${osm_id}` }),
      },
    };
  };
}

const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );

type AddState = "loading" | "added" | "failed";

const ADD_BUTTON: Record<AddState | "idle", { icon: string; title: string }> = {
  idle: { icon: ICONS.plus, title: "Add to the map" },
  loading: { icon: ICONS.plus, title: "Adding…" },
  added: { icon: ICONS.check, title: "Added to the map" },
  failed: { icon: ICONS.close, title: "Couldn't add it" },
};

/**
 * A Google Maps style search box: type, pick a place from the suggestions and the map flies there.
 * No pins, for the candidates or the pick. Each result also has a + to add it to the map,
 * with its full outline, through addToMap.
 */
export function createGeocoder(
  map: MapLibreMap,
  container: HTMLElement,
  addToMap: (features: Feature[]) => AddResult,
): void {
  const flyTo: FitBoundsOptions = {
    // A street address's bbox is a few metres wide; don't dive into it.
    maxZoom: 17,
    padding: 40,
  };
  const outline = nominatimOutlines();
  // Results by OSM key, for the + buttons, and how adding each went.
  const places = new Map<string, CarmenGeojsonFeature>();
  const states = new Map<string, AddState>();

  const renderButton = (button: HTMLElement, state: AddState | undefined) => {
    const { icon, title } = ADD_BUTTON[state ?? "idle"];
    button.innerHTML = icon;
    button.title = title;
    button.setAttribute("aria-label", title);
    button.dataset.state = state ?? "idle";
  };

  const render = (item: CarmenGeojsonFeature | { text: string }): string => {
    const name = "place_name" in item ? item.place_name : item.text;
    const [title, ...address] = name.split(",");
    const key = "place_name" in item ? osmKey(item) : null;
    if (key) places.set(key, item as CarmenGeojsonFeature);
    const { icon, title: label } = ADD_BUTTON[states.get(key ?? "") ?? "idle"];
    return (
      '<div class="maplibregl-ctrl-geocoder--result">' +
      '<div class="geocoder-result-text">' +
      `<div class="maplibregl-ctrl-geocoder--result-title">${escapeHtml(title)}</div>` +
      `<div class="maplibregl-ctrl-geocoder--result-address">${escapeHtml(address.join(",").trim())}</div>` +
      "</div>" +
      (key
        ? `<button type="button" class="geocoder-add" data-osm="${escapeHtml(key)}" data-state="${states.get(key) ?? "idle"}" title="${label}" aria-label="${label}">${icon}</button>`
        : "") +
      "</div>"
    );
  };

  const add = async (button: HTMLElement) => {
    const key = button.dataset.osm!;
    const place = places.get(key);
    if (!place || states.get(key) === "loading") return;
    states.set(key, "loading");
    renderButton(button, "loading");
    let state: AddState = "failed";
    let problem: string | undefined;
    try {
      const { added } = addToMap([await outline(place)]);
      if (added > 0) state = "added";
      else problem = "Its outline isn't a geometry the map can draw";
    } catch (error) {
      problem = (error as Error).message;
    }
    states.set(key, state);
    // The list may have been redrawn meanwhile.
    for (const b of container.querySelectorAll<HTMLElement>(
      `.geocoder-add[data-osm="${CSS.escape(key)}"]`,
    )) {
      renderButton(b, state);
      if (problem) b.title = `Couldn't add it: ${problem}`;
    }
  };

  const geocoder = new MaplibreGeocoder(photonGeocoderApi(), {
    placeholder: "Search places",
    // Photon is made for this; wait for a pause in typing, and enough to go on.
    showResultsWhileTyping: true,
    debounceSearch: 300,
    minLength: 3,
    marker: false,
    showResultMarkers: false,
    flyTo,
    limit: 5,
    clearAndBlurOnEsc: true,
    render,
  });
  // As map.addControl would, but placed in our own layout rather than a map corner.
  const control = geocoder.onAdd(map);
  container.appendChild(control);

  // The + sits inside a result, which selects (and flies) on mouseup. Catch its events first,
  // and keep the input focused so the list stays open for adding more.
  for (const type of ["mousedown", "mouseup", "click"]) {
    control.addEventListener(
      type,
      (e) => {
        const button = (e.target as Element).closest<HTMLElement>(
          ".geocoder-add",
        );
        if (!button) return;
        e.stopPropagation();
        e.preventDefault();
        if (type === "click") void add(button);
      },
      true,
    );
  }
}
