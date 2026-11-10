import type { WmsEndpoint } from "@camptocamp/ogc-client";
import { MERCATOR_CRS, mercatorBounds, preferredFormat } from "./serviceLayer";
import type { ServiceLayer } from "./serviceLayer";

/**
 * The named layers of a WMS that can be drawn in Web Mercator, as GetMap requests
 * for each 256 px tile, which MapLibre fills in through {bbox-epsg-3857}.
 */
export function wmsLayers(endpoint: WmsEndpoint): ServiceLayer[] {
  const format = preferredFormat(
    endpoint.getServiceInfo().outputFormats ?? [],
    (f) => f,
  );
  if (!format) return [];

  return endpoint.getFlattenedLayers().flatMap((summary) => {
    if (!summary.name) return [];
    const layer = endpoint.getLayerByName(summary.name);
    // ogc-client keeps WMS 1.1.1's space-separated SRS lists as one entry.
    const available = layer.availableCrs.flatMap((c) => c.split(/\s+/));
    const crs =
      available.find((c) => c.toUpperCase() === "EPSG:3857") ??
      available.find((c) => MERCATOR_CRS.test(c));
    if (!crs) return [];

    // ogc-client builds the request; MapLibre needs its own placeholder where the bbox goes.
    const url = endpoint
      .getMapUrl([summary.name], {
        widthPx: 256,
        heightPx: 256,
        crs,
        extent: [0, 0, 0, 0],
        outputFormat: format,
      })
      .replace(/([?&]BBOX=)[^&]*/i, "$1{bbox-epsg-3857}");
    if (!url.includes("{bbox-epsg-3857}")) return [];

    return [
      {
        id: summary.name,
        title: layer.title || summary.name,
        source: {
          tiles: [url],
          scheme: "xyz" as const,
          tileSize: 256,
          ...mercatorBounds(
            layer.boundingBoxes["CRS:84"] ?? layer.boundingBoxes["EPSG:4326"],
          ),
        },
      },
    ];
  });
}
