import type {
  WmtsEndpoint,
  WmtsLayer,
  WmtsMatrixSet,
} from "@camptocamp/ogc-client";
import {
  MERCATOR_CRS,
  mercatorBounds,
  preferredFormat,
  queryBase,
} from "./serviceLayer";
import type { ServiceLayer } from "./serviceLayer";

type TileMatrix = WmtsMatrixSet["tileMatrices"][number];

/** Circumference of the Web Mercator world, in metres. */
const WORLD_METRES = 40075016.68557849;
const HALF_WORLD = WORLD_METRES / 2;
/** WMTS's "standardized rendering pixel size", 0.28 mm. */
const PIXEL_METRES = 0.00028;

/** The layers of a WMTS that can be shown on a Web Mercator map, with the tiles to do it. */
export function wmtsLayers(endpoint: WmtsEndpoint): ServiceLayer[] {
  return endpoint.getLayers().flatMap((layer) => {
    const resolved = resolveLayer(endpoint, layer);
    return resolved ? [resolved] : [];
  });
}

interface MercatorMatrices {
  tileSize: number;
  /** The tile matrix identifier with {z} for the zoom, eg. "{z}" or "EPSG:3857:{z}". */
  matrix: string;
  /** Zoom of each tile matrix, by identifier. */
  zooms: Map<string, number>;
}

/** A tile matrix set's zoom levels, if it is Web Mercator with identifiers that follow the zoom. */
export function mercatorMatrices(set: WmtsMatrixSet): MercatorMatrices | null {
  if (!MERCATOR_CRS.test(set.crs)) return null;

  const zooms = new Map<string, number>();
  let tileSize: number | undefined;
  let prefix: string | undefined;
  for (const matrix of set.tileMatrices) {
    const zoom = mercatorZoom(matrix);
    if (zoom === null) return null;
    if (tileSize !== undefined && matrix.tileWidth !== tileSize) return null;
    tileSize = matrix.tileWidth;

    // MapLibre can only put the zoom into the URL, so identifiers must be it, after a fixed prefix.
    const { identifier } = matrix;
    if (!identifier.endsWith(String(zoom))) return null;
    const idPrefix = identifier.slice(0, -String(zoom).length);
    if (prefix !== undefined && idPrefix !== prefix) return null;
    prefix = idPrefix;
    zooms.set(identifier, zoom);
  }

  if (zooms.size === 0 || tileSize === undefined) return null;
  return { tileSize, matrix: `${prefix}{z}`, zooms };
}

/** The Web Mercator zoom a tile matrix matches, if it does. */
function mercatorZoom({
  tileWidth,
  tileHeight,
  topLeft: [left, top],
  scaleDenominator,
}: TileMatrix): number | null {
  if (tileWidth !== tileHeight) return null;
  // Some servers round the corner, by a few metres at most.
  if (Math.abs(left + HALF_WORLD) > 10 || Math.abs(top - HALF_WORLD) > 10)
    return null;
  const tileMetres = scaleDenominator * PIXEL_METRES * tileWidth;
  const exactZoom = Math.log2(WORLD_METRES / tileMetres);
  const zoom = Math.round(exactZoom);
  return Math.abs(exactZoom - zoom) < 0.01 && zoom >= 0 ? zoom : null;
}

function resolveLayer(
  endpoint: WmtsEndpoint,
  layer: WmtsLayer,
): ServiceLayer | null {
  for (const link of layer.matrixSets) {
    const set = endpoint
      .getMatrixSets()
      .find((s) => s.identifier === link.identifier);
    const matrices = set && mercatorMatrices(set);
    if (!matrices) continue;

    const tile = tileTemplate(layer, link.identifier, matrices.matrix);
    if (!tile) continue;

    // Limits, when given, narrow the zooms the layer actually has.
    const limited = link.limits.length
      ? link.limits.map((limit) => limit.tileMatrix)
      : [...matrices.zooms.keys()];
    const zooms = limited.flatMap((matrix) => {
      const zoom = matrices.zooms.get(matrix);
      return zoom === undefined ? [] : [zoom];
    });
    if (zooms.length === 0) continue;

    // ogc-client parses titles but doesn't declare them on WmtsLayer.
    const { title } = layer as WmtsLayer & { title?: string };
    return {
      id: layer.name,
      title: title || layer.name,
      source: {
        tiles: [tile],
        scheme: "xyz",
        tileSize: matrices.tileSize,
        minzoom: Math.min(...zooms),
        maxzoom: Math.max(...zooms),
        ...mercatorBounds(layer.latLonBoundingBox),
      },
    };
  }
  return null;
}

/**
 * A URL template with {z}, {x} and {y}: the layer's own RESTful one, or a KVP GetTile request.
 * Built here rather than with ogc-client's getTileUrl, which would encode the braces.
 */
function tileTemplate(
  layer: WmtsLayer,
  setId: string,
  matrix: string,
): string | null {
  const style = layer.defaultStyle || layer.styles[0]?.name || "default";
  const dimensions = (layer.dimensions ?? []).map(
    (d) => [d.identifier, d.defaultValue ?? d.values[0] ?? ""] as const,
  );
  const link =
    preferredFormat(
      layer.resourceLinks.filter((l) => l.encoding === "REST"),
      (l) => l.format,
    ) ??
    preferredFormat(
      layer.resourceLinks.filter((l) => l.encoding === "KVP"),
      (l) => l.format,
    );
  if (!link) return null;

  if (link.encoding === "REST") {
    const values: Record<string, string> = {
      style,
      tilematrixset: setId,
      tilematrix: matrix,
      tilerow: "{y}",
      tilecol: "{x}",
      ...Object.fromEntries(
        dimensions.map(([name, value]) => [name.toLowerCase(), value]),
      ),
    };
    const filled = link.url.replace(
      /\{([^}]+)\}/g,
      (placeholder, name: string) => values[name.toLowerCase()] ?? placeholder,
    );
    return /\{(?!z\}|x\}|y\})[^}]*\}/.test(filled) ? null : filled;
  }

  const params = [
    ["SERVICE", "WMTS"],
    ["REQUEST", "GetTile"],
    ["VERSION", "1.0.0"],
    ["LAYER", layer.name],
    ["STYLE", style],
    ["TILEMATRIXSET", setId],
    ["FORMAT", link.format],
    ...dimensions,
  ].map(([key, value]) => `${key}=${encodeURIComponent(value)}`);
  // Added raw, since encoding would mangle the braces MapLibre fills in.
  const matrixPrefix = encodeURIComponent(matrix.slice(0, -"{z}".length));
  params.push(`TILEMATRIX=${matrixPrefix}{z}`, "TILEROW={y}", "TILECOL={x}");
  return queryBase(link.url) + params.join("&");
}
