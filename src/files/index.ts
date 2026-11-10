import type { Feature } from "geojson";
import { UnsupportedDataError } from "../errors";
import { withProjections } from "../projection";
import { extension } from "./common";
import type { InputFile } from "./common";
import type { ShapefileParts } from "./shapefile";

/** The files "Add data" opens, by extension, for the file picker and the help. */
export const FILE_FORMATS = [
  { name: "GeoJSON", extensions: ["geojson", "json"] },
  {
    name: "GeoJSON lines",
    extensions: ["geojsonl", "geojsons", "geojsonseq", "ndjson", "jsonl"],
  },
  { name: "CSV", extensions: ["csv", "tsv"] },
  { name: "WKT, or any text that can be pasted", extensions: ["wkt", "txt"] },
  { name: "KML and KMZ", extensions: ["kml", "kmz"] },
  { name: "GPX", extensions: ["gpx"] },
  {
    name: "Shapefile (zipped, or its .shp, .dbf, .prj and .cpg together)",
    extensions: ["zip", "shp", "dbf", "prj", "cpg"],
  },
  { name: "GeoParquet", extensions: ["parquet", "geoparquet"] },
  { name: "FlatGeobuf", extensions: ["fgb"] },
  { name: "GeoPackage", extensions: ["gpkg"] },
];

export const FILE_ACCEPT = FILE_FORMATS.flatMap(({ extensions }) =>
  extensions.map((ext) => `.${ext}`),
).join(",");

/** Past this, a file would take too long to read, and too much memory, for a tab to bear. */
export const MAX_FILE_BYTES = 250 * 1024 ** 2;

const SHAPEFILE_PARTS = ["shp", "dbf", "prj", "cpg"] as const;
/** Files that come with Shapefiles and the like (indexes, metadata), with nothing to draw of their own. */
const SIDECAR = /\.(shx|sbn|sbx|qix|qmd|aux|xml|ovr)$/i;
/** What else zips hold that isn't data: macOS's resource forks, hidden files, readmes and images. */
const NOT_DATA = /(^|\/)(__MACOSX\/|\.)|\.(txt|md|pdf|html?|png|jpe?g)$/i;

export interface FilesResult {
  features: Feature[];
  /** What went wrong, file by file: unreadable, or read only in part. */
  problems: string[];
}

/** Reads the files, together: a Shapefile's parts may come as several of them. */
export async function readFiles(files: File[]): Promise<FilesResult> {
  const problems: string[] = [];
  const inputs: InputFile[] = [];
  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) {
      problems.push(
        `${file.name} is too big: GeoWut reads files up to ${MAX_FILE_BYTES / 1024 ** 2} MB.`,
      );
      continue;
    }
    inputs.push({
      name: file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
  }
  const features = await readInputs(inputs, problems);
  return { features, problems };
}

/** Reads files, or those found in a zip, gathering what goes wrong into problems. */
async function readInputs(
  inputs: InputFile[],
  problems: string[],
): Promise<Feature[]> {
  const features: Feature[] = [];
  const shapefiles = new Map<string, Partial<ShapefileParts>>();
  const others: InputFile[] = [];
  for (const input of inputs) {
    if (SIDECAR.test(input.name)) continue;
    const ext = extension(input.name);
    if ((SHAPEFILE_PARTS as readonly string[]).includes(ext)) {
      const base = input.name.slice(0, -ext.length - 1);
      const parts = shapefiles.get(base.toLowerCase()) ?? { name: base };
      parts[ext as (typeof SHAPEFILE_PARTS)[number]] = input;
      shapefiles.set(base.toLowerCase(), parts);
    } else others.push(input);
  }

  for (const parts of shapefiles.values()) {
    if (!parts.shp) {
      // A lone .prj or .cpg says nothing; a lone .dbf is a table, without shapes.
      if (parts.dbf)
        problems.push(`${parts.dbf.name} needs its .shp, dropped with it.`);
      continue;
    }
    await read(parts.shp.name, problems, features, async () => {
      const { readShapefile } = await import("./shapefile");
      return readShapefile(parts as ShapefileParts);
    });
  }
  for (const input of others) {
    if (extension(input.name) === "zip") {
      await read(input.name, problems, features, async () => {
        const { unzipSync } = await import("fflate");
        const entries = Object.entries(unzipSync(input.bytes))
          .filter(([name]) => !name.endsWith("/") && !NOT_DATA.test(name))
          .map(([name, bytes]) => ({ name, bytes }));
        if (entries.length === 0)
          throw new UnsupportedDataError(
            `${input.name} holds nothing to read.`,
          );
        return readInputs(entries, problems);
      });
    } else {
      await read(input.name, problems, features, () =>
        readOne(input, problems),
      );
    }
  }
  return features;
}

/** Runs one file's reader, loading proj4 as it needs, and keeps its features or its problem. */
async function read(
  name: string,
  problems: string[],
  features: Feature[],
  reader: () => Promise<Feature[]>,
): Promise<void> {
  const problemsBefore = problems.length;
  try {
    const read = await withProjections(reader);
    // Valid, but empty: unless it already said why (as a CSV's skipped rows, or a zip's files).
    if (read.length === 0 && problems.length === problemsBefore)
      problems.push(`${name} is empty: there are no features in it.`);
    features.push(...read);
  } catch (error) {
    problems.push(
      error instanceof UnsupportedDataError
        ? error.message
        : `${name} couldn't be read${error instanceof Error && error.message ? `: ${error.message}` : "."}`,
    );
  }
}

async function readOne(
  input: InputFile,
  problems: string[],
): Promise<Feature[]> {
  switch (extension(input.name)) {
    case "csv":
    case "tsv": {
      const { readCsv } = await import("./csv");
      const { features, skipped } = readCsv(input);
      if (skipped > 0)
        problems.push(
          `${input.name}: skipped ${skipped} ${skipped === 1 ? "row" : "rows"} without a location GeoWut could read.`,
        );
      return features;
    }
    case "kml":
      return (await import("./kml")).readKml(input);
    case "kmz":
      return (await import("./kml")).readKmz(input);
    case "gpx":
      return (await import("./kml")).readGpx(input);
    case "parquet":
    case "geoparquet":
      return (await import("./parquet")).readParquet(input);
    case "fgb":
      return (await import("./flatgeobuf")).readFlatGeobuf(input);
    case "gpkg":
      return (await import("./geopackage")).readGeoPackage(input);
    default: {
      // GeoJSON, GeoJSON lines, WKT and the like, and any other text worth a try.
      const { readText } = await import("./json");
      const features = readText(input);
      if (!features)
        throw new UnsupportedDataError(
          `${input.name} isn't a file GeoWut can read, or holds nothing it recognises.`,
        );
      return features;
    }
  }
}
