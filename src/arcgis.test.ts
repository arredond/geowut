import { describe, expect, it } from "vitest";
import { arcgisToFeatures, isArcGIS, UnsupportedDataError } from "./arcgis";

const feature = (geometry: object, properties: object | null = null) => ({
  type: "Feature",
  geometry,
  properties,
});

/** Web Mercator metres of (lng -3.7, lat 40.4). */
const MADRID_3857 = { x: -411882.1159, y: 4924240.5872 };

describe("isArcGIS", () => {
  it.each([
    [{ x: 1, y: 2 }],
    [{ points: [[1, 2]] }],
    [{ paths: [] }],
    [{ rings: [] }],
    [{ xmin: 0, ymin: 0, xmax: 1, ymax: 1 }],
    [{ geometry: { x: 1, y: 2 }, attributes: {} }],
    [{ attributes: { a: 1 } }],
    [{ features: [{ geometry: { x: 1, y: 2 } }] }],
  ])("recognises %j", (value) => {
    expect(isArcGIS(value)).toBe(true);
  });

  it.each([
    [{ type: "Point", coordinates: [1, 2] }],
    [{ type: "FeatureCollection", features: [] }],
    [{ features: [{ type: "Feature" }] }],
    [{ x: "1", y: 2 }],
    [[1, 2]],
    [null],
  ])("leaves %j alone", (value) => {
    expect(isArcGIS(value)).toBe(false);
  });
});

describe("arcgisToFeatures", () => {
  it("converts bare geometries", () => {
    expect(arcgisToFeatures({ x: -3.7, y: 40.4 })).toEqual([
      feature({ type: "Point", coordinates: [-3.7, 40.4] }),
    ]);
    expect(
      arcgisToFeatures({
        paths: [
          [
            [0, 0],
            [1, 1],
          ],
        ],
      }),
    ).toEqual([
      feature({
        type: "LineString",
        coordinates: [
          [0, 0],
          [1, 1],
        ],
      }),
    ]);
  });

  it("turns rings into polygons, holes included", () => {
    const [{ geometry }] = arcgisToFeatures({
      rings: [
        [
          [0, 0],
          [0, 10],
          [10, 10],
          [10, 0],
          [0, 0],
        ],
        [
          [2, 2],
          [4, 2],
          [4, 4],
          [2, 4],
          [2, 2],
        ],
      ],
      spatialReference: { wkid: 4326 },
    });
    expect(geometry.type).toBe("Polygon");
    expect((geometry as { coordinates: unknown[] }).coordinates).toHaveLength(
      2,
    );
  });

  it("turns an envelope into a rectangle", () => {
    const [{ geometry }] = arcgisToFeatures({
      xmin: -3.8,
      ymin: 40.3,
      xmax: -3.5,
      ymax: 40.6,
    });
    expect(geometry).toMatchObject({ type: "Polygon" });
  });

  it("keeps attributes, and an id from OBJECTID", () => {
    expect(
      arcgisToFeatures({
        geometry: { x: 1, y: 2 },
        attributes: { OBJECTID: 7, name: "Centro" },
      }),
    ).toEqual([
      {
        ...feature(
          { type: "Point", coordinates: [1, 2] },
          { OBJECTID: 7, name: "Centro" },
        ),
        id: 7,
      },
    ]);
  });

  it("reads REST query responses in Web Mercator, skipping features without geometry", () => {
    const features = arcgisToFeatures({
      displayFieldName: "name",
      geometryType: "esriGeometryPoint",
      spatialReference: { wkid: 102100, latestWkid: 3857 },
      fields: [],
      features: [
        { geometry: MADRID_3857, attributes: { name: "Madrid" } },
        { attributes: { name: "Nowhere" } },
      ],
    });
    expect(features).toHaveLength(1);
    const [lng, lat] = (features[0].geometry as { coordinates: number[] })
      .coordinates;
    expect(lng).toBeCloseTo(-3.7, 6);
    expect(lat).toBeCloseTo(40.4, 6);
    expect(features[0].properties).toEqual({ name: "Madrid" });
  });

  it("lets a feature's own spatial reference win over its set's", () => {
    const [{ geometry }] = arcgisToFeatures({
      spatialReference: { wkid: 3857 },
      features: [
        { geometry: { x: -3.7, y: 40.4, spatialReference: { wkid: 4326 } } },
      ],
    });
    expect(geometry).toEqual({ type: "Point", coordinates: [-3.7, 40.4] });
  });

  it("takes a list of features", () => {
    expect(
      arcgisToFeatures([
        { geometry: { x: 1, y: 2 }, attributes: { a: 1 } },
        { geometry: { x: 3, y: 4 }, attributes: { a: 2 } },
      ]),
    ).toHaveLength(2);
  });

  it.each([
    [{ x: 500000, y: 4470000, spatialReference: { wkid: 25830 } }, /25830/],
    [{ x: 1, y: 2, spatialReference: { wkt: 'PROJCS["Custom"]' } }, /WKT/],
  ])("refuses other spatial references", (json, message) => {
    expect(() => arcgisToFeatures(json)).toThrow(UnsupportedDataError);
    expect(() => arcgisToFeatures(json)).toThrow(message);
  });
});
