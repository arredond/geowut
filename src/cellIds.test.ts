import * as a5 from "a5-js";
import * as h3 from "h3-js";
import { s2 } from "s2js";
import { describe, expect, it } from "vitest";
import { parseFeatures } from "./addDataModal";
import { cellReadings, parseCellIds } from "./cellIds";
import { tileToQuadkey } from "./grids/quadkey";

const MADRID = { lat: 40.4, lng: -3.7 };
const h3Cell = h3.latLngToCell(MADRID.lat, MADRID.lng, 9);
const s2Id = s2.cellid.parent(
  s2.cellid.fromLatLng(s2.LatLng.fromDegrees(MADRID.lat, MADRID.lng)),
  12,
);
const s2Token = s2.cellid.toToken(s2Id);
const a5Id = a5.lonLatToCell(
  [MADRID.lng, MADRID.lat] as unknown as Parameters<typeof a5.lonLatToCell>[0],
  10,
);
const a5Hex = a5.u64ToHex(a5Id);

const read = (text: string) =>
  parseCellIds(text)?.map((f) => f.properties as Record<string, unknown>);

describe("parseCellIds", () => {
  it.each([
    ["H3 hex", h3Cell, { grid: "h3", id: h3Cell, resolution: 9 }],
    [
      "H3 integer",
      BigInt(`0x${h3Cell}`).toString(),
      { grid: "h3", id: h3Cell, resolution: 9 },
    ],
    ["quadkey", "0313", { grid: "quadkey", id: "0313", zoom: 4 }],
    [
      "Z/X/Y tile",
      "12/2005/1544",
      { grid: "quadkey", id: tileToQuadkey(2005, 1544, 12), zoom: 12 },
    ],
    ["S2 token", s2Token, { grid: "s2", id: s2Token, level: 12 }],
    ["S2 integer", s2Id.toString(), { grid: "s2", id: s2Token, level: 12 }],
    ["A5 hex", a5Hex, { grid: "a5", id: a5Hex, resolution: 10 }],
    ["A5 integer", a5Id.toString(), { grid: "a5", id: a5Hex, resolution: 10 }],
    // All digits, yet hex: A5's IDs often are.
    [
      "A5 hex of only digits",
      "5180000000000000",
      { grid: "a5", id: "5180000000000000", resolution: 2 },
    ],
  ])("reads an %s", (_, text, properties) => {
    expect(read(text)).toEqual([properties]);
  });

  it("tells A5's coarse IDs, all 0-3 and zeros, from quadkeys", () => {
    // Resolution 0 and 1 A5 IDs, which would also make quadkeys.
    const res0 = a5.u64ToHex(a5.getRes0Cells()[0]);
    expect(res0).toMatch(/^[0-3]+$/);
    expect(read(res0)?.[0]).toMatchObject({ grid: "a5", resolution: 0 });
    // A short quadkey ending in zeros is still a quadkey.
    expect(read("0313000000")?.[0]).toMatchObject({
      grid: "quadkey",
      zoom: 10,
    });
  });

  it("reads signed integers, as BigQuery stores S2 IDs", () => {
    // Token 94: an S2 cell on face 4, past 2^63.
    expect(read("-7782220156096217088")).toEqual([
      { grid: "s2", id: "94", level: 1 },
    ]);
  });

  it("draws each cell as its own polygon", () => {
    const [feature] = parseCellIds(h3Cell)!;
    expect(feature.geometry).toEqual({
      type: "Polygon",
      coordinates: [
        expect.arrayContaining([
          expect.arrayContaining([expect.any(Number), expect.any(Number)]),
        ]),
      ],
    });
  });

  it("reads lists, as coverings and children are copied", () => {
    const children = h3.cellToChildren(h3Cell, 10);
    expect(read(children.join(","))?.map((p) => p.id)).toEqual(children);
    expect(read(`${s2Token}\n${s2Token.slice(0, -1)}3`)).toHaveLength(2);
    expect(read(`${h3Cell} 0313`)?.map((p) => p.grid)).toEqual([
      "h3",
      "quadkey",
    ]);
  });

  it("reads a list in the one grid that fits all of it", () => {
    // Alone, a token without trailing zeros reads first as S2; next to A5 IDs, as A5.
    const a5Cells = a5.cellToChildren(a5Id).map((c) => a5.u64ToHex(c));
    const odd = a5Cells.find((hex) => !hex.endsWith("0"));
    if (odd) {
      expect(read(odd)?.[0].grid).not.toBe(undefined);
      expect(
        read([...a5Cells, odd].join(","))?.every((p) => p.grid === "a5"),
      ).toBe(true);
    }
    expect(read(a5Cells.join(","))?.every((p) => p.grid === "a5")).toBe(true);
  });

  it("takes a prefix to settle which grid", () => {
    expect(cellReadings(`h3:${h3Cell}`)).toEqual([{ grid: "h3", id: h3Cell }]);
    expect(cellReadings("quadkey:1")).toEqual([{ grid: "quadkey", id: "1" }]);
    expect(cellReadings(`s2:${s2Token}`).every((r) => r.grid === "s2")).toBe(
      true,
    );
  });

  it.each([
    "hello",
    "5",
    "1",
    "42",
    "12/99999/1",
    "0/0/0",
    `${h3Cell}, nope`,
    "",
  ])("finds no cells in %j", (text) => {
    expect(parseCellIds(text)).toBeNull();
  });
});

describe("Add data with cell IDs", () => {
  it("adds them, even when JSON would read them as a number", () => {
    const integer = BigInt(`0x${h3Cell}`).toString();
    expect(parseFeatures(integer)[0].properties).toMatchObject({
      grid: "h3",
      id: h3Cell,
    });
    expect(parseFeatures("0313")[0].properties).toMatchObject({
      grid: "quadkey",
    });
  });

  it("still reads coordinates as coordinates", () => {
    expect(parseFeatures("40.4, -3.7")[0].geometry.type).toBe("Point");
    expect(parseFeatures("-3.8 40.3 -3.5 40.6")[0].geometry.type).toBe(
      "Polygon",
    );
  });
});
