import type { TileSource } from "./customBasemap";

/** A layer of a WMS or WMTS service, ready to show as a basemap. */
export interface ServiceLayer {
  id: string;
  title: string;
  source: TileSource;
}

/** Web Mercator's EPSG codes, old and new. */
export const MERCATOR_CRS = /\b(3857|900913|3785|102100|102113)$/;
const MAX_MERCATOR_LAT = 85.0511287798;
const PREFERRED_FORMATS = ["image/png", "image/jpeg", "image/webp"];

/** PNG, then JPEG, then WebP, then any other image. */
export function preferredFormat<T>(
  items: T[],
  format: (item: T) => string,
): T | undefined {
  const images = items.filter((item) => format(item).startsWith("image/"));
  for (const preferred of PREFERRED_FORMATS) {
    const match = images.find((item) => format(item) === preferred);
    if (match) return match;
  }
  return images[0];
}

/** Degrees bounds, clamped to what Web Mercator can show, or nothing if there are none. */
export function mercatorBounds(
  bbox: number[] | undefined,
): Pick<TileSource, "bounds"> {
  if (bbox?.length !== 4 || !bbox.every(Number.isFinite)) return {};
  const [west, south, east, north] = bbox;
  const clamp = (n: number, max: number) => Math.max(-max, Math.min(max, n));
  return {
    bounds: [
      clamp(west, 180),
      clamp(south, MAX_MERCATOR_LAT),
      clamp(east, 180),
      clamp(north, MAX_MERCATOR_LAT),
    ],
  };
}

/** A URL ready for more query parameters: ending in ? or &. */
export function queryBase(url: string): string {
  if (url.endsWith("?") || url.endsWith("&")) return url;
  return url + (url.includes("?") ? "&" : "?");
}
