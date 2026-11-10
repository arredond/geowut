import type { Feature } from "geojson";
import { isEmptyCollection, parseFeatures } from "../formats/text";
import { decodeText } from "./common";
import type { InputFile } from "./common";

/**
 * GeoJSON, GeoJSON lines, Esri JSON, or anything else that can be pasted: a .wkt or .txt file
 * is read as if its text had been. None if it's valid but empty (a blank file, or a collection
 * without features); null if nothing in it could be read.
 */
export function readText(file: InputFile): Feature[] | null {
  const text = decodeText(file.bytes).trim();
  const features = parseFeatures(text);
  if (features.length > 0) return features;
  return !text || isEmptyCollection(text) ? [] : null;
}
