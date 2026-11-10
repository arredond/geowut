import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import type { Plugin } from "vite";
import { SOURCE_PACKAGE_META } from "./thirdPartyLicenses.ts";

const VIRTUAL_ID = "virtual:epsg-proj4";

interface EpsgEntry {
  kind: string;
  proj4?: string;
}

/**
 * Every 2D projected and geographic system in epsg-index, as proj4 definitions by code:
 * 7,000 of them in ~90 kB gzipped, against the index's 8 MB of WKT, names and areas.
 */
export function compactEpsgTable(
  index: Record<string, EpsgEntry>,
): Record<string, string> {
  const table: Record<string, string> = {};
  for (const [code, { kind, proj4 }] of Object.entries(index)) {
    if (!proj4 || !/^CRS-(PROJCRS|GEOGCRS)$/.test(kind)) continue;
    table[code] = proj4.replace(/\s*\+(no_defs|type=crs)\b/g, "").trim();
  }
  return table;
}

/**
 * Serves "virtual:epsg-proj4", the table above, as its own chunk: imported on demand, it's only
 * downloaded for data that names its coordinate system by EPSG code alone. It names epsg-index
 * as its source, for the license plugin to credit.
 */
export function epsgTable(): Plugin {
  const require = createRequire(import.meta.url);
  const indexPath = require.resolve("epsg-index/all.json");
  const moduleId = `\0${VIRTUAL_ID}`;
  return {
    name: "epsg-table",
    resolveId(source) {
      if (source === VIRTUAL_ID) return moduleId;
    },
    load(id) {
      if (id !== moduleId) return;
      const index = JSON.parse(readFileSync(indexPath, "utf8"));
      const json = JSON.stringify(compactEpsgTable(index));
      // JSON.parse beats an object literal of this size, in parsing time.
      return {
        code: `export default JSON.parse(${JSON.stringify(json)});`,
        meta: { [SOURCE_PACKAGE_META]: dirname(indexPath) },
      };
    },
  };
}
