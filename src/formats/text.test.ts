import { describe, expect, it } from "vitest";
import { withProjections } from "../projection";
import { parseFeatures } from "./text";

const point = { type: "Point", coordinates: [1, 2] };

describe("parseFeatures", () => {
  it("wraps bare geometries", () => {
    expect(parseFeatures(JSON.stringify(point))).toEqual([
      { type: "Feature", geometry: point, properties: null },
    ]);
  });

  it("keeps a Feature with its properties", () => {
    const feature = {
      type: "Feature",
      geometry: point,
      properties: { name: "Centro" },
    };
    expect(parseFeatures(JSON.stringify(feature))).toEqual([feature]);
  });

  it("expands a FeatureCollection", () => {
    const features = [
      { type: "Feature", geometry: point, properties: { name: "a" } },
      { type: "Feature", geometry: point, properties: { name: "b" } },
    ];
    expect(
      parseFeatures(JSON.stringify({ type: "FeatureCollection", features })),
    ).toEqual(features);
  });

  it("skips features without geometry", () => {
    const features = [{ type: "Feature", geometry: null, properties: {} }];
    expect(
      parseFeatures(JSON.stringify({ type: "FeatureCollection", features })),
    ).toEqual([]);
    expect(parseFeatures(JSON.stringify(features[0]))).toEqual([]);
  });

  it("parses WKT", () => {
    expect(parseFeatures("POINT (-3 40)")).toEqual([
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [-3, 40] },
        properties: null,
      },
    ]);
  });

  const box = {
    type: "Feature",
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [-3.8, 40.3],
          [-3.5, 40.3],
          [-3.5, 40.6],
          [-3.8, 40.6],
          [-3.8, 40.3],
        ],
      ],
    },
    properties: null,
  };

  it.each([
    "-3.8 40.3 -3.5 40.6",
    "-3.8,40.3,-3.5,40.6",
    "[-3.8, 40.3, -3.5, 40.6]",
    "-te -3.8 40.3 -3.5 40.6",
    "-spat -3.8 40.3 -3.5 40.6",
    "-projwin -3.8 40.6 -3.5 40.3",
    "Extent: (-3.800000, 40.300000) - (-3.500000, 40.600000)",
  ])("turns the bounding box %s into a rectangle", (text) => {
    expect(parseFeatures(text)).toEqual([box]);
  });

  it("parses lat, lng pairs as points, one per line", () => {
    expect(parseFeatures("40.4168, -3.7038\n\n  -33.86,151.21  ")).toEqual([
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [-3.7038, 40.4168] },
        properties: null,
      },
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [151.21, -33.86] },
        properties: null,
      },
    ]);
  });

  it("mixes bounding boxes and points across lines", () => {
    expect(parseFeatures("-3.8 40.3 -3.5 40.6\n40.4, -3.7")).toHaveLength(2);
  });

  it("parses Esri JSON, such as a REST query response", () => {
    const features = parseFeatures(
      JSON.stringify({
        spatialReference: { wkid: 4326 },
        features: [{ geometry: { x: -3, y: 40 }, attributes: { OBJECTID: 1 } }],
      }),
    );
    expect(features).toEqual([
      {
        type: "Feature",
        id: 1,
        geometry: { type: "Point", coordinates: [-3, 40] },
        properties: { OBJECTID: 1 },
      },
    ]);
  });

  const geometryOf = (text: string) =>
    parseFeatures(text).map((feature) => feature.geometry);
  const madrid = { type: "Point", coordinates: [-3.7038, 40.4168] };

  it("parses GeoJSON lines, record separators and all", () => {
    const line = JSON.stringify(point);
    expect(geometryOf(`${line}\n\n${line}`)).toEqual([point, point]);
    expect(geometryOf(`\x1e${line}\n\x1e${line}\n`)).toEqual([point, point]);
  });

  it("parses EWKT, unprojecting Web Mercator", () => {
    expect(geometryOf("SRID=4326;POINT(-3.7038 40.4168)")).toEqual([madrid]);
    expect(geometryOf("srid=3857; POINT(0 0)")).toEqual([
      { type: "Point", coordinates: [0, 0] },
    ]);
  });

  it("reprojects EWKT in other SRIDs, loading proj4 for it", async () => {
    const [feature] = await withProjections(() =>
      parseFeatures("SRID=25830;POINT(440000 4474000)"),
    );
    const [lng, lat] = (feature.geometry as GeoJSON.Point).coordinates;
    expect(lng).toBeCloseTo(-3.7072, 4);
    expect(lat).toBeCloseTo(40.4145, 4);
  });

  it("drops M values from WKT, PostGIS's POINTM included", () => {
    expect(geometryOf("POINTM(1 2 3)")).toEqual([point]);
    expect(geometryOf("POINT ZM (1 2 3 4)")).toEqual([
      { type: "Point", coordinates: [1, 2, 3] },
    ]);
    expect(geometryOf("POINT Z (1 2 3)")).toEqual([
      { type: "Point", coordinates: [1, 2, 3] },
    ]);
  });

  it("parses points in degrees, minutes and seconds, mixed with other lines", () => {
    expect(
      parseFeatures(`40°25'0.6"N 3°42'13.7"W\n-3.8 40.3 -3.5 40.6\n40.4, -3.7`),
    ).toHaveLength(3);
  });

  it("parses map links, one per line", () => {
    expect(
      geometryOf(
        "https://www.google.com/maps/@40.4168,-3.7038,15z\ngeo:40.4168,-3.7038",
      ),
    ).toEqual([madrid, madrid]);
  });

  it("parses hex WKB and EWKB, as PostGIS prints them, one or many", () => {
    const ewkb = "0101000020E6100000FE65F7E461A10DC0857CD0B359354440";
    expect(geometryOf(ewkb)).toEqual([madrid]);
    expect(geometryOf(`${ewkb}\n\\x${ewkb}`)).toEqual([madrid, madrid]);
  });

  it("parses geohashes and plus codes as their areas, with their codes", () => {
    expect(
      parseFeatures("ezjmgtwu, 8FVC9G8F+6X").map((f) => f.properties),
    ).toEqual([{ geohash: "ezjmgtwu" }, { plusCode: "8FVC9G8F+6X" }]);
  });

  it("parses encoded polylines", () => {
    expect(geometryOf("_p~iF~ps|U_ulLnnqC_mqNvxq`@")[0]?.type).toBe(
      "LineString",
    );
  });

  it("reads IDs that are also cell IDs as cells, unless prefixed", () => {
    expect(parseFeatures("0d4283d")[0].properties).not.toHaveProperty(
      "geohash",
    );
    expect(parseFeatures("gh:0d4283d")[0].properties).toEqual({
      geohash: "0d4283d",
    });
    expect(parseFeatures("geohash:u")).toHaveLength(1);
  });

  it("reads a prefixed polyline at the precision it names", () => {
    const [line] = geometryOf("polyline6:_p~iF~ps|U_ulLnnqC_mqNvxq`@");
    expect((line as GeoJSON.LineString).coordinates[0]).toEqual([-12.02, 3.85]);
  });

  it("explains that short plus codes need a place", () => {
    expect(() => parseFeatures("9G8F+6X Zürich")).toThrow(/short plus code/);
  });

  it.each([
    "not geojson",
    "hello world",
    "u",
    "{}\nnope",
    "40 -3",
    "91, -3.7",
    "1, 2, 3",
    "1 2 1 5",
    "0 0 200 10",
    "[0, 0, 0, 0]",
    "40.4, -3.7\nnope",
    "40.4, -3.7 meters",
    "null",
    "[1,2]",
    "5",
    '{"foo":1}',
    '{"type":"Polygon"}',
    '{"type":"FeatureCollection"}',
  ])("finds nothing in %s", (text) => {
    expect(parseFeatures(text)).toEqual([]);
  });
});
