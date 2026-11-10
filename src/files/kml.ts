import type { Feature } from "geojson";
import { gpx, kml } from "@tmcw/togeojson";
import { unzipSync } from "fflate";
import { UnsupportedDataError } from "../errors";
import { decodeText, extension, jsonValue } from "./common";
import type { InputFile } from "./common";

function parseXml(file: InputFile): Document {
  const doc = new DOMParser().parseFromString(
    decodeText(file.bytes),
    "application/xml",
  );
  if (doc.querySelector("parsererror"))
    throw new UnsupportedDataError(`${file.name} isn't well-formed XML.`);
  return doc;
}

/** Features with their properties made plain JSON, and none without a geometry (KML folders, GPX metadata). */
const located = (features: Feature[]): Feature[] =>
  features
    .filter((f) => f.geometry)
    .map((f) => ({
      ...f,
      properties: jsonValue(f.properties) as Feature["properties"],
    }));

/** KML's placemarks, with their names, descriptions, extended data and styles as properties. */
export const readKml = (file: InputFile): Feature[] =>
  located(kml(parseXml(file)).features as Feature[]);

/** GPX's waypoints, routes and tracks, elevations included. */
export const readGpx = (file: InputFile): Feature[] =>
  located(gpx(parseXml(file)).features as Feature[]);

/**
 * A KMZ: a zip holding a KML, doc.kml by convention, with any images it uses. Its other KMLs, as
 * some KMZs carry, are read too.
 */
export function readKmz(file: InputFile): Feature[] {
  const entries = Object.entries(unzipSync(file.bytes)).filter(
    ([name]) => extension(name) === "kml",
  );
  if (entries.length === 0)
    throw new UnsupportedDataError(`${file.name} holds no KML.`);
  entries.sort(([a], [b]) => Number(b === "doc.kml") - Number(a === "doc.kml"));
  return entries.flatMap(([name, bytes]) => readKml({ name, bytes }));
}
