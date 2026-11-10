import type { ServiceLayer } from "./serviceLayer";

export type { ServiceLayer } from "./serviceLayer";

type Service = "WMTS" | "WMS";

/** ogc-client reads anything XML-ish without complaint, finding no layers in what isn't capabilities. */
class NotCapabilities extends Error {}

/** Which services a URL may be, most likely first: as it says, or else WMTS, then WMS. */
export function servicesToTry(url: string): Service[] {
  const named = url.match(/[?&]service=(wmts|wms)\b/i)?.[1];
  if (named) return [named.toUpperCase() as Service];
  if (/wmts/i.test(url)) return ["WMTS"];
  if (/wms/i.test(url)) return ["WMS"];
  return ["WMTS", "WMS"];
}

/** The layers of a WMS or WMTS service that can be shown on a Web Mercator map. Throws with a message for the user. */
export async function fetchCapabilities(url: string): Promise<ServiceLayer[]> {
  // Loaded on demand: it's sizeable, and only custom basemaps need it.
  const [ogc, { wmsLayers }, { wmtsLayers }] = await Promise.all([
    import("@camptocamp/ogc-client"),
    import("./wms"),
    import("./wmts"),
  ]);
  // Its worker needs a browser; elsewhere (tests) it can work on the main thread.
  if (typeof Worker === "undefined") ogc.enableFallbackWithoutWorker();

  let lastError: Error | undefined;
  for (const service of servicesToTry(url)) {
    let layers: ServiceLayer[];
    try {
      if (service === "WMTS") {
        const endpoint = await new ogc.WmtsEndpoint(url).isReady();
        if (endpoint.getLayers().length === 0) throw new NotCapabilities();
        layers = wmtsLayers(endpoint);
      } else {
        const endpoint = await new ogc.WmsEndpoint(url).isReady();
        if (endpoint.getFlattenedLayers().length === 0)
          throw new NotCapabilities();
        layers = wmsLayers(endpoint);
      }
    } catch (error) {
      if (error instanceof ogc.EndpointError && error.isCrossOriginRelated)
        throw new Error(
          "Couldn't load the capabilities: the server doesn't allow requests from other sites (CORS).",
        );
      if (error instanceof ogc.EndpointError && error.httpStatus)
        lastError = new Error(
          `The capabilities request failed (HTTP ${error.httpStatus}).`,
        );
      else if (error instanceof ogc.EndpointError)
        lastError = new Error(
          "Couldn't load the capabilities. Check the URL, or the server may not allow requests from other sites (CORS).",
        );
      else
        lastError = new Error(
          "That URL didn't return WMS or WMTS capabilities.",
        );
      continue;
    }
    if (layers.length > 0) return layers;
    lastError = new Error(
      "None of its layers come in Web Mercator (EPSG:3857), the only projection the map can show.",
    );
  }
  throw lastError!;
}
