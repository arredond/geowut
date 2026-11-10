import type { StyleSpecification } from "maplibre-gl";

export interface TileSource {
  tiles: string[];
  scheme: "xyz" | "tms";
  /** Pixels per tile, 256 unless a WMTS tile matrix set says otherwise. */
  tileSize?: number;
  minzoom?: number;
  maxzoom?: number;
  /** West, south, east, north in degrees, so MapLibre doesn't ask for tiles outside them. */
  bounds?: [number, number, number, number];
}

/** A custom basemap as the user gave it, along with the tiles it resolved to. */
export interface CustomBasemap {
  /** A tile URL template, or a WMS/WMTS service URL. */
  url: string;
  /** The service layer's title, when picked from capabilities. */
  layer?: string;
  source: TileSource;
}

const isHttpUrl = (url: unknown) =>
  typeof url === "string" && /^https?:\/\/\S+$/i.test(url);
const isNumber = (n: unknown) => typeof n === "number" && Number.isFinite(n);

/** Whether something from storage still has the shape of a custom basemap. */
export function isCustomBasemap(value: unknown): value is CustomBasemap {
  const { url, layer, source } = Object(value) as Record<string, unknown>;
  if (!isHttpUrl(url) || (layer !== undefined && typeof layer !== "string"))
    return false;
  const { tiles, scheme, tileSize, minzoom, maxzoom, bounds } = Object(
    source,
  ) as Record<string, unknown>;
  return (
    Array.isArray(tiles) &&
    tiles.length > 0 &&
    tiles.every(isHttpUrl) &&
    (scheme === "xyz" || scheme === "tms") &&
    [tileSize, minzoom, maxzoom].every((n) => n === undefined || isNumber(n)) &&
    (bounds === undefined ||
      (Array.isArray(bounds) && bounds.length === 4 && bounds.every(isNumber)))
  );
}

/** Placeholders MapLibre fills in itself: XYZ, Bing-style quadkeys and WMS-style bboxes. */
const MAPLIBRE_PLACEHOLDERS = [
  "{z}",
  "{x}",
  "{y}",
  "{quadkey}",
  "{bbox-epsg-3857}",
  "{ratio}",
];

/**
 * Turns a raster tile URL template into tile URLs MapLibre understands, or null if it isn't one.
 * Accepts XYZ ({z}/{x}/{y}, with {s} subdomains, {-y} for TMS and {r} for retina),
 * WMTS RESTful or KVP templates ({TileMatrix}/{TileRow}/{TileCol}), {quadkey} and WMS {bbox-epsg-3857}.
 */
export function parseTileUrl(input: string): TileSource | null {
  let url = input.trim();
  if (!isHttpUrl(url)) return null;

  let scheme: TileSource["scheme"] = "xyz";
  url = url
    .replace(/\{TileMatrix\}/gi, "{z}")
    .replace(/\{TileRow\}/gi, "{y}")
    .replace(/\{TileCol\}/gi, "{x}")
    .replace(/\{r\}/g, "")
    .replace(/\{-y\}/g, () => {
      scheme = "tms";
      return "{y}";
    });

  const placeholders: string[] = url.match(/\{[^}]*\}/g) ?? [];
  const unknown = placeholders.filter(
    (p) => p !== "{s}" && !MAPLIBRE_PLACEHOLDERS.includes(p),
  );
  if (unknown.length > 0) return null;

  const has = (p: string) => placeholders.includes(p);
  const xyz = has("{z}") && has("{x}") && has("{y}");
  if (!xyz && !has("{quadkey}") && !has("{bbox-epsg-3857}")) return null;

  const tiles = has("{s}")
    ? ["a", "b", "c"].map((s) => url.replaceAll("{s}", s))
    : [url];
  return { tiles, scheme };
}

/** Same glyphs as OpenFreeMap's styles, so grid labels still render over a raster basemap. */
const GLYPHS = "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf";

export function rasterStyle({
  tileSize = 256,
  ...source
}: TileSource): StyleSpecification {
  return {
    version: 8,
    glyphs: GLYPHS,
    sources: {
      basemap: { type: "raster", tileSize, ...source },
    },
    layers: [{ id: "basemap", type: "raster", source: "basemap" }],
  };
}
