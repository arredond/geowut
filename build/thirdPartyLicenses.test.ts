import { describe, expect, it } from "vitest";
import {
  formatLicenses,
  packageDir,
  resolveDependency,
} from "./thirdPartyLicenses";

const root = process.cwd().replaceAll("\\", "/");

describe("packageDir", () => {
  it.each([
    ["/app/node_modules/h3-js/dist/h3-js.es.js", "/app/node_modules/h3-js"],
    [
      "/app/node_modules/@terraformer/wkt/dist/t-wkt.esm.js?commonjs",
      "/app/node_modules/@terraformer/wkt",
    ],
    [
      "/app/node_modules/a/node_modules/b/index.js",
      "/app/node_modules/a/node_modules/b",
    ],
    ["\0/app/node_modules/x/y.js", "/app/node_modules/x"],
    ["C:\\app\\node_modules\\x\\y.js", "C:/app/node_modules/x"],
  ])("finds the package of %s", (id, dir) => {
    expect(packageDir(id)).toBe(dir);
  });

  it("skips our own code and virtual modules", () => {
    expect(packageDir("/app/src/main.ts")).toBeNull();
    expect(packageDir("\0vite/preload-helper.js")).toBeNull();
  });
});

describe("resolveDependency", () => {
  it("looks outward from the package, as Node does", () => {
    expect(
      resolveDependency(`${root}/node_modules/maplibre-gl`, "earcut"),
    ).toBe(`${root}/node_modules/earcut`);
    expect(
      resolveDependency(`${root}/node_modules/maplibre-gl`, "not-a-package"),
    ).toBeNull();
  });
});

describe("formatLicenses", () => {
  it("lists each package with its license, source and text", () => {
    const text = formatLicenses([
      {
        name: "a",
        version: "1.0.0",
        license: "MIT",
        repository: "https://example.com/a",
        text: "Copyright A",
      },
      { name: "b", version: "2.0.0", license: "ISC" },
    ]);
    expect(text).toContain(
      "a 1.0.0 (MIT)\nhttps://example.com/a\n\nCopyright A",
    );
    expect(text).toContain(
      "b 2.0.0 (ISC)\n\nNo license file is included with this package; it is licensed under ISC.",
    );
  });
});
