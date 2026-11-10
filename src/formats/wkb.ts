import type {
  Feature,
  Geometry,
  LineString,
  Point,
  Polygon,
  Position,
} from "geojson";
import { crsTransform, mapPositions } from "../projection";
import { toFeature } from "./common";

/**
 * Hex-encoded WKB, as PostGIS and most databases print geometries: optionally led by "\x" (a
 * bytea) or "0x" (SQL Server, MySQL). Even the smallest geometry, a point, takes 21 bytes.
 */
const HEX_WKB = /^(?:\\x|0x)?((?:0[01])[0-9a-f]{40,})$/i;

// PostGIS's EWKB flags the type's high bits; ISO WKB adds 1000s to it.
const EWKB_Z = 0x80000000;
const EWKB_M = 0x40000000;
const EWKB_SRID = 0x20000000;

class Reader {
  private view: DataView;
  private offset = 0;
  littleEndian = true;

  constructor(bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  get done(): boolean {
    return this.offset === this.view.byteLength;
  }

  private need(bytes: number): void {
    if (this.offset + bytes > this.view.byteLength)
      throw new RangeError("WKB ended early");
  }

  byte(): number {
    this.need(1);
    return this.view.getUint8(this.offset++);
  }

  uint32(): number {
    this.need(4);
    const value = this.view.getUint32(this.offset, this.littleEndian);
    this.offset += 4;
    return value;
  }

  double(): number {
    this.need(8);
    const value = this.view.getFloat64(this.offset, this.littleEndian);
    this.offset += 8;
    return value;
  }

  /** A count of things to come, checked against what's left so a bad one can't run away. */
  count(minBytesEach: number): number {
    const count = this.uint32();
    this.need(count * minBytesEach);
    return count;
  }
}

interface Header {
  type: number;
  hasZ: boolean;
  hasM: boolean;
  srid?: number;
}

function readHeader(reader: Reader): Header {
  const order = reader.byte();
  if (order > 1) throw new RangeError("Not a WKB byte order");
  reader.littleEndian = order === 1;
  const raw = reader.uint32();
  const srid = raw & EWKB_SRID ? reader.uint32() : undefined;
  const iso = raw & 0xffff;
  const dimensions = Math.floor(iso / 1000);
  if (dimensions > 3) throw new RangeError("Not a WKB geometry type");
  return {
    type: iso % 1000,
    hasZ: Boolean(raw & EWKB_Z) || dimensions === 1 || dimensions === 3,
    hasM: Boolean(raw & EWKB_M) || dimensions === 2 || dimensions === 3,
    srid,
  };
}

/** One geometry, nested ones included. M values are dropped, as GeoJSON has no place for them. */
function readGeometry(reader: Reader, header = readHeader(reader)): Geometry {
  const { hasZ, hasM } = header;
  const ordinates = 2 + Number(hasZ) + Number(hasM);
  const position = (): Position => {
    const values = Array.from({ length: ordinates }, () => reader.double());
    return hasZ ? values.slice(0, 3) : values.slice(0, 2);
  };
  const positions = () =>
    Array.from({ length: reader.count(ordinates * 8) }, position);
  const rings = () => Array.from({ length: reader.count(4) }, positions);
  // A multi geometry's parts are whole geometries, headers and all, of the one type.
  const parts = <T extends Geometry>(type: T["type"]): T[] =>
    Array.from({ length: reader.count(5) }, () => {
      const part = readGeometry(reader);
      if (part.type !== type) throw new RangeError("Mixed multi geometry");
      return part as T;
    });

  switch (header.type) {
    case 1: {
      const coordinates = position();
      // PostGIS writes an empty point as NaNs.
      if (coordinates.some(Number.isNaN)) throw new RangeError("Empty point");
      return { type: "Point", coordinates };
    }
    case 2:
      return { type: "LineString", coordinates: positions() };
    case 3:
      return { type: "Polygon", coordinates: rings() };
    case 4:
      return {
        type: "MultiPoint",
        coordinates: parts<Point>("Point").map((p) => p.coordinates),
      };
    case 5:
      return {
        type: "MultiLineString",
        coordinates: parts<LineString>("LineString").map((l) => l.coordinates),
      };
    case 6:
      return {
        type: "MultiPolygon",
        coordinates: parts<Polygon>("Polygon").map((p) => p.coordinates),
      };
    case 7:
      return {
        type: "GeometryCollection",
        geometries: Array.from({ length: reader.count(5) }, () =>
          readGeometry(reader),
        ),
      };
    default:
      throw new RangeError(`Unsupported WKB type ${header.type}`);
  }
}

/**
 * A hex-encoded WKB or EWKB geometry as a feature, or null if the text isn't one. EWKB in
 * another SRID than WGS84 is reprojected (see crsTransform); WKB without one is taken for
 * WGS84. Curves, TINs and such are not read.
 */
export function wkbFeature(text: string): Feature | null {
  const match = HEX_WKB.exec(text);
  if (!match || match[1].length % 2) return null;
  const hex = match[1];
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++)
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);

  const wkb = readWkb(bytes);
  if (!wkb) return null;
  const { geometry, srid } = wkb;
  return toFeature(
    srid === undefined
      ? geometry
      : mapPositions(geometry, crsTransform({ epsg: srid }, "That EWKB")),
  );
}

/** WKB or EWKB bytes as a geometry, with EWKB's SRID if it has one: null unless the bytes are exactly one geometry. */
export function readWkb(
  bytes: Uint8Array,
): { geometry: Geometry; srid?: number } | null {
  const reader = new Reader(bytes);
  try {
    const header = readHeader(reader);
    const geometry = readGeometry(reader, header);
    return reader.done ? { geometry, srid: header.srid } : null;
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }
}
