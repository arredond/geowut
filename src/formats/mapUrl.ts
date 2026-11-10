import type { Position } from "geojson";
import { validLngLat } from "./common";

const NUMBER = String.raw`[-+]?\d+(?:\.\d+)?`;
const LAT_LNG = new RegExp(`^\\s*(${NUMBER})\\s*,\\s*(${NUMBER})\\s*$`);

/** Query parameters that hold "lat,lng" in one map or another. */
const LAT_LNG_PARAMS = [
  "q",
  "query",
  "ll",
  "sll",
  "center",
  "destination",
  "daddr",
  "coordinate",
];

const toPosition = (lat: string | number, lng: string | number) => {
  const position = [Number(lng), Number(lat)];
  return validLngLat(position[0], position[1]) ? position : null;
};

const latLng = (value: string | null) => {
  const match = value && LAT_LNG.exec(value);
  return match ? toPosition(match[1], match[2]) : null;
};

/**
 * The place a map link points at: Google Maps, OpenStreetMap, Bing, Apple Maps, the zoom/lat/lng
 * hash most web maps keep (MapLibre's, Mapbox's, geojson.io's), and geo: URIs. A marked place,
 * such as Google's pin or OSM's marker, wins over the map's centre. Null if it isn't such a link.
 */
export function parseMapUrl(text: string): Position | null {
  const trimmed = text.trim();
  const geo = new RegExp(
    `^geo:(${NUMBER}),(${NUMBER})(?:,${NUMBER})?(?:[;?].*)?$`,
    "i",
  ).exec(trimmed);
  if (geo) {
    // Android writes a searched place as geo:0,0?q=lat,lng(label).
    const query = /[?&]q=([^&(]+)/.exec(trimmed);
    if (Number(geo[1]) === 0 && Number(geo[2]) === 0 && query)
      return latLng(decodeURIComponent(query[1]));
    return toPosition(geo[1], geo[2]);
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(url.protocol)) return null;
  const href = decodeURIComponent(url.href);

  // Google's place pin, !3d<lat>!4d<lng>, then its view, @lat,lng,zoom.
  const pin = new RegExp(`!3d(${NUMBER})!4d(${NUMBER})`).exec(href);
  if (pin) return toPosition(pin[1], pin[2]);
  const view = new RegExp(`/@(${NUMBER}),(${NUMBER})`).exec(href);
  if (view) return toPosition(view[1], view[2]);

  const params = url.searchParams;
  const mlat = params.get("mlat");
  const mlon = params.get("mlon");
  if (mlat && mlon) return toPosition(mlat, mlon);
  for (const name of LAT_LNG_PARAMS) {
    const position = latLng(params.get(name));
    if (position) return position;
  }
  // Bing writes its centre as cp=lat~lng.
  const bing = new RegExp(`^(${NUMBER})~(${NUMBER})$`).exec(
    params.get("cp") ?? "",
  );
  if (bing) return toPosition(bing[1], bing[2]);
  const lat = params.get("lat");
  const lng = params.get("lng") ?? params.get("lon");
  if (lat && lng) return toPosition(lat, lng);

  // #map=zoom/lat/lng (OpenStreetMap) or #zoom/lat/lng (MapLibre, Mapbox), maybe with bearing and pitch.
  const hash = new RegExp(
    `^#(?:map=)?${NUMBER}/(${NUMBER})/(${NUMBER})(?:[/&].*)?$`,
  ).exec(url.hash);
  if (hash) return toPosition(hash[1], hash[2]);
  return null;
}
