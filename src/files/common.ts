import type { Feature, GeoJsonProperties, Geometry } from "geojson";
import { mapPositions } from "../projection";

/** A file to read, or one found inside a zip: its name, with any folders, and its bytes. */
export interface InputFile {
  name: string;
  bytes: Uint8Array;
}

export const extension = (name: string) =>
  /\.([^./\\]+)$/.exec(name)?.[1].toLowerCase() ?? "";

export const decodeText = (bytes: Uint8Array) =>
  new TextDecoder().decode(bytes).replace(/^﻿/, "");

/**
 * Values as JSON can hold them, for properties: 64-bit integers (as Parquet and GeoPackage give
 * them) become numbers where that loses nothing and strings where it would, dates ISO strings
 * and bytes hex, as the panel shows properties and exports them as GeoJSON.
 */
export function jsonValue(value: unknown): unknown {
  if (typeof value === "bigint")
    return Number.isSafeInteger(Number(value)) ? Number(value) : String(value);
  if (value instanceof Date)
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (value instanceof Uint8Array)
    return Array.from(value, (b) => b.toString(16).padStart(2, "0")).join("");
  if (Array.isArray(value)) return value.map(jsonValue);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, jsonValue(v)]),
    );
  return value;
}

export function feature(
  geometry: Geometry,
  properties: Record<string, unknown>,
  transform: Parameters<typeof mapPositions>[1] = null,
): Feature {
  return {
    type: "Feature",
    geometry: mapPositions(geometry, transform),
    properties: jsonValue(properties) as GeoJsonProperties,
  };
}
