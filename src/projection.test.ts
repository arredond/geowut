import { describe, expect, it } from "vitest";
import { UnsupportedDataError } from "./errors";
import {
  crsTransform,
  NeedsProjectionError,
  webMercatorToLngLat,
  withProjections,
} from "./projection";

// ETRS89 / UTM zone 30N, as a Shapefile's .prj (Esri's WKT 1) writes it.
const UTM_30N_PRJ =
  'PROJCS["ETRS_1989_UTM_Zone_30N",GEOGCS["GCS_ETRS_1989",DATUM["D_ETRS_1989",SPHEROID["GRS_1980",6378137.0,298.257222101]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",500000.0],PARAMETER["False_Northing",0.0],PARAMETER["Central_Meridian",-3.0],PARAMETER["Scale_Factor",0.9996],PARAMETER["Latitude_Of_Origin",0.0],UNIT["Meter",1.0]]';
const SOL_UTM = [440000, 4474000];

const expectNearSol = ([lng, lat]: number[]) => {
  expect(lng).toBeCloseTo(-3.7072, 4);
  expect(lat).toBeCloseTo(40.4145, 4);
};

describe("crsTransform", () => {
  it("leaves WGS84 and the datums near it alone", () => {
    expect(crsTransform({ epsg: 4326 }, "It")).toBeNull();
    expect(crsTransform({ epsg: 4258 }, "It")).toBeNull();
  });

  it("unprojects Web Mercator without proj4", () => {
    expect(crsTransform({ epsg: 3857 }, "It")).toBe(webMercatorToLngLat);
  });

  it("asks for proj4 for anything else", () => {
    expect(() => crsTransform({ epsg: 25830 }, "It")).toThrow(
      NeedsProjectionError,
    );
  });
});

describe("withProjections", () => {
  it("reads WKT, as in a .prj", async () => {
    const transform = await withProjections(() =>
      crsTransform({ wkt: UTM_30N_PRJ }, "It"),
    );
    expectNearSol(transform!(SOL_UTM));
  });

  it("looks EPSG codes up", async () => {
    const transform = await withProjections(() =>
      crsTransform({ epsg: 25830 }, "It"),
    );
    expectNearSol(transform!(SOL_UTM));
  });

  it("keeps Z", async () => {
    const transform = await withProjections(() =>
      crsTransform({ epsg: 25830 }, "It"),
    );
    expect(transform!([...SOL_UTM, 650])[2]).toBe(650);
  });

  it("refuses codes it doesn't know and WKT it can't read, saying why", async () => {
    await expect(
      withProjections(() => crsTransform({ epsg: 999999 }, "That file")),
    ).rejects.toThrow(/That file is in EPSG:999999/);
    await expect(
      withProjections(() => crsTransform({ wkt: "nonsense" }, "That file")),
    ).rejects.toThrow(UnsupportedDataError);
  });
});
