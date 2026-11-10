import { readFileSync } from "node:fs";
import type { Feature, Point } from "geojson";
import { describe, expect, it, vi } from "vitest";
import { readFiles } from ".";

// Vite serves the WebAssembly by URL; Node, running the tests, reads it from disk.
vi.mock("sql.js/dist/sql-wasm-browser.wasm?url", () => ({
  default: `${process.cwd()}/node_modules/sql.js/dist/sql-wasm-browser.wasm`,
}));

const FIXTURES = `${process.cwd()}/src/files/fixtures/`;

const fixture = (name: string, as = name) =>
  new File([readFileSync(FIXTURES + name)], as);
const text = (name: string, content: string) => new File([content], name);

/** The three places of the fixtures, by name, longitude first. */
const PLACES: Record<string, [number, number]> = {
  "Puerta del Sol": [-3.7038, 40.4168],
  Retiro: [-3.6823, 40.4153],
  Bernabéu: [-3.6883, 40.4531],
};

/** Each feature's name and position, for comparing with PLACES. */
const places = (features: Feature[]) =>
  Object.fromEntries(
    features.map((f) => [
      f.properties?.name,
      (f.geometry as Point).coordinates.slice(0, 2),
    ]),
  );

const expectPlaces = (features: Feature[], names = Object.keys(PLACES)) => {
  const found = places(features);
  expect(Object.keys(found).sort()).toEqual([...names].sort());
  for (const name of names) {
    expect(found[name][0]).toBeCloseTo(PLACES[name][0], 5);
    expect(found[name][1]).toBeCloseTo(PLACES[name][1], 5);
  }
};

async function readOk(...files: File[]) {
  const { features, problems } = await readFiles(files);
  expect(problems).toEqual([]);
  return features;
}

describe("readFiles", () => {
  describe("GeoJSON", () => {
    const collection = {
      type: "FeatureCollection",
      features: Object.entries(PLACES).map(([name, coordinates]) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates },
        properties: { name },
      })),
    };

    it("reads a FeatureCollection", async () => {
      expectPlaces(
        await readOk(text("places.geojson", JSON.stringify(collection))),
      );
    });

    it("reads GeoJSON lines, record separators and all", async () => {
      const lines = collection.features
        .map((f) => `\x1e${JSON.stringify(f)}`)
        .join("\n");
      expectPlaces(await readOk(text("places.geojsonl", lines)));
    });

    it("reads WKT in a text file", async () => {
      const [feature] = await readOk(text("a.wkt", "POINT (1 2)"));
      expect(feature.geometry).toEqual({ type: "Point", coordinates: [1, 2] });
    });
  });

  describe("CSV", () => {
    it("reads latitude and longitude columns, any case, the rest as properties", async () => {
      const features = await readOk(
        text(
          "places.csv",
          "name,Latitude,LON,rank\nPuerta del Sol,40.4168,-3.7038,1\nRetiro,40.4153,-3.6823,2\nBernabéu,40.4531,-3.6883,3\n",
        ),
      );
      expectPlaces(features);
      expect(features[0].properties).toEqual({
        name: "Puerta del Sol",
        rank: "1",
      });
    });

    it("reads semicolon-separated CSV with decimal commas, as European spreadsheets write it", async () => {
      expectPlaces(
        await readOk(
          text(
            "places.csv",
            "name;lat;lng\nPuerta del Sol;40,4168;-3,7038\nRetiro;40,4153;-3,6823\nBernabéu;40,4531;-3,6883\n",
          ),
        ),
      );
    });

    it("reads TSV", async () => {
      expectPlaces(
        await readOk(
          text(
            "places.tsv",
            "name\ty\tx\nPuerta del Sol\t40.4168\t-3.7038\nRetiro\t40.4153\t-3.6823\nBernabéu\t40.4531\t-3.6883\n",
          ),
        ),
      );
    });

    it("reads a geometry column of WKT, EWKT, WKB, EWKB and GeoJSON, mixed", async () => {
      const csv = [
        "name,geometry",
        'Puerta del Sol,"POINT (-3.7038 40.4168)"',
        'Retiro,"SRID=4326;POINT (-3.6823 40.4153)"',
        `Bernabéu,0101000000${wkbHex(-3.6883, 40.4531)}`,
        `Cibeles,"${JSON.stringify({ type: "Point", coordinates: [-3.6931, 40.4193] }).replaceAll('"', '""')}"`,
        `Atocha,0101000020E6100000${wkbHex(-3.6907, 40.4065)}`,
      ].join("\n");
      const features = await readOk(text("places.csv", csv));
      expect(places(features)).toEqual({
        "Puerta del Sol": [-3.7038, 40.4168],
        Retiro: [-3.6823, 40.4153],
        Bernabéu: [-3.6883, 40.4531],
        Cibeles: [-3.6931, 40.4193],
        Atocha: [-3.6907, 40.4065],
      });
    });

    it("prefers a geometry column to coordinates, which stay as properties", async () => {
      const [feature] = await readOk(
        text("a.csv", 'wkt,lat,lon\n"POINT (1 2)",40,-3\n'),
      );
      expect(feature.geometry).toEqual({ type: "Point", coordinates: [1, 2] });
      expect(feature.properties).toEqual({ lat: "40", lon: "-3" });
    });

    it("reprojects EWKT in other SRIDs", async () => {
      const [feature] = await readOk(
        text("a.csv", 'geom\n"SRID=25830;POINT(440290.458 4474257.382)"\n'),
      );
      const [lng, lat] = (feature.geometry as Point).coordinates;
      expect(lng).toBeCloseTo(-3.7038, 4);
      expect(lat).toBeCloseTo(40.4168, 4);
    });

    it("counts the rows it skips", async () => {
      const { features, problems } = await readFiles([
        text("a.csv", "lat,lon\n40,-3\n,\nnorth,west\n95,0\n"),
      ]);
      expect(features).toHaveLength(1);
      expect(problems).toEqual([
        "a.csv: skipped 2 rows without a location GeoWut could read.",
      ]);
    });

    it("says which columns it reads when it finds none", async () => {
      const { problems } = await readFiles([text("a.csv", "a,b\n1,2\n")]);
      expect(problems[0]).toMatch(/a\.csv has no column.*geometry.*lat/);
    });
  });

  describe("KML, KMZ and GPX", () => {
    it("reads KML", async () => {
      const features = await readOk(fixture("places.kml"));
      expectPlaces(features);
      expect(features[0].properties).toMatchObject({ rank: 1 });
    });

    it("reads KMZ", async () => {
      expectPlaces(await readOk(fixture("places.kmz")));
    });

    it("reads GPX waypoints and tracks", async () => {
      const features = await readOk(fixture("places.gpx"));
      expect(features.map((f) => f.geometry.type).sort()).toEqual([
        "LineString",
        "Point",
        "Point",
      ]);
      const track = features.find((f) => f.geometry.type === "LineString");
      expect(track?.properties?.name).toBe("Sol to Retiro");
    });

    it("refuses XML that isn't", async () => {
      const { problems } = await readFiles([text("a.kml", "<kml>")]);
      expect(problems).toEqual(["a.kml isn't well-formed XML."]);
    });
  });

  describe("Shapefile", () => {
    it("reads a zipped one in a folder, reprojecting it as its .prj says", async () => {
      expectPlaces(await readOk(fixture("places-utm.zip")));
    });

    it("reads one dropped as loose files, attributes and accents included", async () => {
      const features = await readOk(
        ...["shp", "shx", "dbf", "prj"].map((ext) =>
          fixture(`places-utm.${ext}`),
        ),
      );
      expectPlaces(features);
      expect(features[0].properties).toEqual({
        name: "Puerta del Sol",
        rank: 1,
      });
    });

    it("draws a .shp without .prj as it is, and its .dbf alone not at all", async () => {
      const { features } = await readFiles([fixture("places-utm.shp")]);
      expect((features[0].geometry as Point).coordinates[0]).toBeGreaterThan(
        400000,
      );
      const { problems } = await readFiles([fixture("places-utm.dbf")]);
      expect(problems).toEqual([
        "places-utm.dbf needs its .shp, dropped with it.",
      ]);
    });
  });

  describe("GeoParquet", () => {
    it.each(["places.parquet", "places-zstd.parquet", "places-gzip.parquet"])(
      "reads %s",
      async (name) => {
        const features = await readOk(fixture(name));
        expectPlaces(features);
        expect(features[0].properties).toEqual({
          name: "Puerta del Sol",
          rank: 1,
        });
      },
    );

    it("reprojects as its PROJJSON says", async () => {
      expectPlaces(await readOk(fixture("places-utm.parquet")));
    });
  });

  describe("FlatGeobuf", () => {
    it("reads and reprojects it", async () => {
      expectPlaces(await readOk(fixture("places-utm.fgb")));
    });
  });

  describe("GeoPackage", () => {
    it("reads and reprojects it", async () => {
      const features = await readOk(fixture("places-utm.gpkg"));
      expectPlaces(features);
      expect(features[0].properties).toMatchObject({ rank: 1 });
    });
  });

  it("reads several files, and says which it couldn't", async () => {
    const { features, problems } = await readFiles([
      fixture("places.kml"),
      text("notes.doc", "nothing here"),
      fixture("places.parquet"),
    ]);
    expect(features).toHaveLength(6);
    expect(problems).toEqual([
      "notes.doc isn't a file GeoWut can read, or holds nothing it recognises.",
    ]);
  });
});

/** WKB's X and Y, little-endian, as hex. */
function wkbHex(x: number, y: number): string {
  const view = new DataView(new ArrayBuffer(16));
  view.setFloat64(0, x, true);
  view.setFloat64(8, y, true);
  return Array.from(new Uint8Array(view.buffer), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

describe("empty files", () => {
  it.each([
    ["an empty export", '{"type":"FeatureCollection","features":[]}'],
    ["Esri JSON without features", '{"features":[]}'],
    ["a blank file", "  \n"],
  ])("says %s is empty, not unreadable", async (_, content) => {
    const { features, problems } = await readFiles([
      new File([content], "map.geojson"),
    ]);
    expect(features).toEqual([]);
    expect(problems).toEqual([
      "map.geojson is empty: there are no features in it.",
    ]);
  });

  it("says a CSV with only its header is empty", async () => {
    const { problems } = await readFiles([new File(["lat,lon\n"], "a.csv")]);
    expect(problems).toEqual(["a.csv is empty: there are no features in it."]);
  });
});
