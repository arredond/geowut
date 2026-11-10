import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

const OL_TILEGRID_STUB = "\0ogc-client-ol-tilegrid";

/**
 * ogc-client lazily imports an OpenLayers tile grid helper, which needs ol and proj4: optional
 * peer dependencies we don't install, whose empty stand-ins break the build. We never call it, and
 * ogc-client already catches the import failing, so it gets a module that fails straight away.
 */
const withoutOgcClientOpenLayers: Plugin = {
  name: "without-ogc-client-openlayers",
  enforce: "pre",
  resolveId(source, importer) {
    if (
      source === "./ol-tilegrid.js" &&
      importer?.includes("@camptocamp/ogc-client")
    )
      return OL_TILEGRID_STUB;
  },
  load(id) {
    if (id === OL_TILEGRID_STUB)
      return 'throw new Error("OpenLayers tile grids are not bundled with GeoWut.");';
  },
};

export default defineConfig({
  plugins: [withoutOgcClientOpenLayers],
  // maplibre-gl locates its worker script as a sibling file next to its own
  // module URL at runtime. Vite's dev-time dependency pre-bundling moves it
  // into node_modules/.vite/deps without that sibling, breaking the lookup -
  // excluding it keeps it served straight from node_modules instead.
  // ogc-client is served as is too, so the plugin above also applies in dev.
  optimizeDeps: {
    exclude: ["maplibre-gl", "@camptocamp/ogc-client"],
    // ogc-client's XML parser is CommonJS, so it still needs pre-bundling.
    include: ["@camptocamp/ogc-client > @rgrove/parse-xml"],
  },
  worker: {
    format: "es",
  },
  test: {
    environment: "jsdom",
  },
});
