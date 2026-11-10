import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import { fetchCapabilities, servicesToTry } from "./capabilities";

const HALF_WORLD = "20037508.3427892";
/** Scale denominator of Web Mercator zoom 0 with 256 px tiles. */
const Z0_SCALE = 559082264.0287178;

function matrixSet(
  id: string,
  {
    crs = "urn:ogc:def:crs:EPSG::3857",
    zooms = [0, 1, 2, 3],
    ids = (z: number) => String(z),
    tileSize = 256,
    corner = `-${HALF_WORLD} ${HALF_WORLD}`,
  } = {},
): string {
  const matrices = zooms.map(
    (z) => `
    <TileMatrix>
      <ows:Identifier>${ids(z)}</ows:Identifier>
      <ScaleDenominator>${(Z0_SCALE * 256) / tileSize / 2 ** z}</ScaleDenominator>
      <TopLeftCorner>${corner}</TopLeftCorner>
      <TileWidth>${tileSize}</TileWidth><TileHeight>${tileSize}</TileHeight>
      <MatrixWidth>${2 ** z}</MatrixWidth><MatrixHeight>${2 ** z}</MatrixHeight>
    </TileMatrix>`,
  );
  return `<TileMatrixSet>
    <ows:Identifier>${id}</ows:Identifier>
    <ows:SupportedCRS>${crs}</ows:SupportedCRS>${matrices.join("")}
  </TileMatrixSet>`;
}

function capabilities(contents: string, operations = ""): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Capabilities xmlns="http://www.opengis.net/wmts/1.0" xmlns:ows="http://www.opengis.net/ows/1.1"
  xmlns:xlink="http://www.w3.org/1999/xlink" version="1.0.0">
  ${operations}
  <Contents>${contents}</Contents>
</Capabilities>`;
}

const kvpOperations = (href: string) => `
  <ows:OperationsMetadata>
    <ows:Operation name="GetCapabilities">
      <ows:DCP><ows:HTTP><ows:Get xlink:href="https://elsewhere.example.com/caps?"/></ows:HTTP></ows:DCP>
    </ows:Operation>
    <ows:Operation name="GetTile">
      <ows:DCP><ows:HTTP>
        <ows:Get xlink:href="${href}">
          <ows:Constraint name="GetEncoding"><ows:AllowedValues><ows:Value>KVP</ows:Value></ows:AllowedValues></ows:Constraint>
        </ows:Get>
      </ows:HTTP></ows:DCP>
    </ows:Operation>
  </ows:OperationsMetadata>`;

const CAPS_URL =
  "https://example.com/wmts?SERVICE=WMTS&REQUEST=GetCapabilities";

let fetchSpy: MockInstance<typeof fetch>;
beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, "fetch");
});
afterEach(() => fetchSpy.mockRestore());

/** The layers found when the service answers with this document, whatever is asked. */
function layersOf(xml: string, url = CAPS_URL) {
  fetchSpy.mockImplementation(
    async () => new Response(xml, { headers: { "Content-Type": "text/xml" } }),
  );
  return fetchCapabilities(url);
}

describe("WMTS", () => {
  it("fills in a layer's RESTful template, from its Web Mercator tile matrix set", async () => {
    const xml = capabilities(`
      <Layer>
        <ows:Title>World Imagery</ows:Title>
        <ows:Identifier>World_Imagery</ows:Identifier>
        <ows:WGS84BoundingBox>
          <ows:LowerCorner>-179.99999 -85.00000000000003</ows:LowerCorner>
          <ows:UpperCorner>179.99999 89</ows:UpperCorner>
        </ows:WGS84BoundingBox>
        <Style isDefault="false"><ows:Identifier>other</ows:Identifier></Style>
        <Style isDefault="true"><ows:Identifier>default</ows:Identifier></Style>
        <Format>image/jpeg</Format>
        <TileMatrixSetLink><TileMatrixSet>WorldCRS84Quad</TileMatrixSet></TileMatrixSetLink>
        <TileMatrixSetLink><TileMatrixSet>GoogleMapsCompatible</TileMatrixSet></TileMatrixSetLink>
        <ResourceURL format="application/json" resourceType="FeatureInfo" template="https://example.com/info/{TileMatrix}"/>
        <ResourceURL format="image/jpeg" resourceType="tile"
          template="https://example.com/tile/World_Imagery/{Style}/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.jpg"/>
      </Layer>
      ${matrixSet("WorldCRS84Quad", { crs: "urn:ogc:def:crs:OGC:1.3:CRS84" })}
      ${matrixSet("GoogleMapsCompatible", { zooms: [2, 3, 4] })}`);

    expect(await layersOf(xml, CAPS_URL)).toEqual([
      {
        id: "World_Imagery",
        title: "World Imagery",
        source: {
          tiles: [
            "https://example.com/tile/World_Imagery/default/GoogleMapsCompatible/{z}/{y}/{x}.jpg",
          ],
          scheme: "xyz",
          tileSize: 256,
          minzoom: 2,
          maxzoom: 4,
          bounds: [-179.99999, -85.00000000000003, 179.99999, 85.0511287798],
        },
      },
    ]);
  });

  it("builds KVP GetTile requests, with prefixed matrices, limits and dimensions", async () => {
    const xml = capabilities(
      `
      <Layer>
        <ows:Identifier>OI.OrthoimageCoverage</ows:Identifier>
        <Style isDefault="true"><ows:Identifier>default</ows:Identifier></Style>
        <Format>image/jpeg</Format>
        <Format>image/png</Format>
        <Dimension><ows:Identifier>Time</ows:Identifier><Default>2024</Default><Value>2023</Value><Value>2024</Value></Dimension>
        <TileMatrixSetLink>
          <TileMatrixSet>EPSG:3857</TileMatrixSet>
          <TileMatrixSetLimits>
            <TileMatrixLimits><TileMatrix>EPSG:3857:1</TileMatrix></TileMatrixLimits>
            <TileMatrixLimits><TileMatrix>EPSG:3857:2</TileMatrix></TileMatrixLimits>
          </TileMatrixSetLimits>
        </TileMatrixSetLink>
      </Layer>
      ${matrixSet("EPSG:3857", { crs: "EPSG:3857", ids: (z) => `EPSG:3857:${z}`, corner: "-2.003750834E7 2.0037508E7" })}`,
      kvpOperations("https://tiles.example.com/wmts/pnoa?"),
    );

    const [layer] = await layersOf(xml, CAPS_URL);
    expect(layer.title).toBe("OI.OrthoimageCoverage");
    expect(layer.source).toEqual({
      tiles: [
        "https://tiles.example.com/wmts/pnoa?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0" +
          "&LAYER=OI.OrthoimageCoverage&STYLE=default&TILEMATRIXSET=EPSG%3A3857" +
          "&FORMAT=image%2Fpng&Time=2024&TILEMATRIX=EPSG%3A3857%3A{z}&TILEROW={y}&TILECOL={x}",
      ],
      scheme: "xyz",
      tileSize: 256,
      minzoom: 1,
      maxzoom: 2,
    });
  });

  it("lists every layer that fits, and skips the rest", async () => {
    const layer = (id: string, set: string) => `
      <Layer>
        <ows:Identifier>${id}</ows:Identifier>
        <Format>image/png</Format>
        <TileMatrixSetLink><TileMatrixSet>${set}</TileMatrixSet></TileMatrixSetLink>
      </Layer>`;
    const xml = capabilities(
      [
        layer("a", "mercator"),
        layer("utm", "utm"),
        layer("named", "named"),
        layer("padded", "padded"),
        layer("shifted", "shifted"),
        layer("b", "mercator"),
        matrixSet("mercator"),
        matrixSet("utm", { crs: "EPSG:25830" }),
        matrixSet("named", { ids: (z) => ["low", "mid", "high", "max"][z] }),
        matrixSet("padded", {
          zooms: [8, 9, 10],
          ids: (z) => `L${String(z).padStart(2, "0")}`,
        }),
        matrixSet("shifted", { corner: "-20000000 20000000" }),
      ].join(""),
      kvpOperations("https://example.com/wmts?"),
    );
    expect((await layersOf(xml, CAPS_URL)).map((l) => l.id)).toEqual([
      "a",
      "b",
    ]);
  });

  it.each([
    ["isn't WMTS", "<html><body>Nope</body></html>"],
    ["isn't XML", "{}"],
  ])("refuses a document that %s", async (_, xml) => {
    await expect(layersOf(xml, CAPS_URL)).rejects.toThrow(
      /WMS or WMTS capabilities/,
    );
  });

  it("says so when no layer is in Web Mercator", async () => {
    const xml = capabilities(`
      <Layer>
        <ows:Identifier>utm</ows:Identifier>
        <Format>image/png</Format>
        <TileMatrixSetLink><TileMatrixSet>utm</TileMatrixSet></TileMatrixSetLink>
      </Layer>
      ${matrixSet("utm", { crs: "EPSG:25830" })}`);
    await expect(layersOf(xml, CAPS_URL)).rejects.toThrow(/Web Mercator/);
  });
});

function wmsCapabilities(version: string, layers: string): string {
  const root = version === "1.3.0" ? "WMS_Capabilities" : "WMT_MS_Capabilities";
  const ns = version === "1.3.0" ? 'xmlns="http://www.opengis.net/wms"' : "";
  return `<?xml version="1.0"?>
<${root} version="${version}" ${ns} xmlns:xlink="http://www.w3.org/1999/xlink">
  <Capability>
    <Request>
      <GetCapabilities><Format>text/xml</Format></GetCapabilities>
      <GetMap>
        <Format>image/jpeg</Format>
        <Format>image/png</Format>
        <DCPType><HTTP><Get><OnlineResource xlink:href="https://maps.example.com/wms?map=base&amp;SERVICE=WMS&amp;"/></Get></HTTP></DCPType>
      </GetMap>
    </Request>
    ${layers}
  </Capability>
</${root}>`;
}

describe("WMS", () => {
  it("offers 1.3.0 named layers, inheriting CRS and bounds from their parents", async () => {
    const xml = wmsCapabilities(
      "1.3.0",
      `<Layer>
        <Title>Everything</Title>
        <CRS>EPSG:4326</CRS>
        <CRS>EPSG:3857</CRS>
        <EX_GeographicBoundingBox>
          <westBoundLongitude>-10</westBoundLongitude><eastBoundLongitude>5</eastBoundLongitude>
          <southBoundLatitude>35</southBoundLatitude><northBoundLatitude>44</northBoundLatitude>
        </EX_GeographicBoundingBox>
        <Layer><Name>roads</Name><Title>Roads</Title></Layer>
        <Layer>
          <Name>rivers &amp; lakes</Name>
          <EX_GeographicBoundingBox>
            <westBoundLongitude>-1</westBoundLongitude><eastBoundLongitude>1</eastBoundLongitude>
            <southBoundLatitude>40</southBoundLatitude><northBoundLatitude>41</northBoundLatitude>
          </EX_GeographicBoundingBox>
        </Layer>
      </Layer>`,
    );

    expect(await layersOf(xml, "https://maps.example.com/wms")).toEqual([
      {
        id: "roads",
        title: "Roads",
        source: {
          tiles: [
            "https://maps.example.com/wms?map=base&SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0" +
              "&LAYERS=roads&STYLES=&WIDTH=256&HEIGHT=256&FORMAT=image%2Fpng&CRS=EPSG%3A3857" +
              "&BBOX={bbox-epsg-3857}",
          ],
          scheme: "xyz",
          tileSize: 256,
          bounds: [-10, 35, 5, 44],
        },
      },
      {
        id: "rivers & lakes",
        title: "rivers & lakes",
        source: expect.objectContaining({
          tiles: [expect.stringContaining("&LAYERS=rivers%20%26%20lakes&")],
          bounds: [-1, 40, 1, 41],
        }),
      },
    ]);
  });

  it("reads 1.1.1, with SRS lists and older Web Mercator codes", async () => {
    const xml = wmsCapabilities(
      "1.1.1",
      `<Layer>
        <SRS>EPSG:4326 EPSG:900913</SRS>
        <Layer>
          <Name>base</Name><Title>Base</Title>
          <LatLonBoundingBox minx="-3" miny="40" maxx="-2" maxy="41"/>
        </Layer>
      </Layer>`,
    );
    const [layer] = await layersOf(xml, "https://maps.example.com/wms");
    expect(layer.source.tiles[0]).toContain(
      "&VERSION=1.1.1&LAYERS=base&STYLES=&WIDTH=256&HEIGHT=256&FORMAT=image%2Fpng&SRS=EPSG%3A900913&",
    );
    expect(layer.source.bounds).toEqual([-3, 40, -2, 41]);
  });

  it("skips layers without a name or Web Mercator", async () => {
    const xml = wmsCapabilities(
      "1.3.0",
      `<Layer>
        <Title>Group</Title>
        <CRS>EPSG:3857</CRS>
        <Layer><Title>Unnamed</Title></Layer>
      </Layer>
      <Layer><Name>utm</Name><CRS>EPSG:25830</CRS></Layer>`,
    );
    await expect(layersOf(xml, "https://maps.example.com/wms")).rejects.toThrow(
      /Web Mercator/,
    );
  });
});

describe("servicesToTry", () => {
  it.each([
    ["https://example.com/wmts", ["WMTS"]],
    ["https://example.com/geoserver/wms?", ["WMS"]],
    ["https://example.com/ows?service=WMS", ["WMS"]],
    [
      "https://example.com/wms/x?request=GetCapabilities&service=WMTS",
      ["WMTS"],
    ],
    ["https://example.com/ows?map=x", ["WMTS", "WMS"]],
  ])("guesses %s is %j", (url, expected) => {
    expect(servicesToTry(url)).toEqual(expected);
  });
});

describe("fetchCapabilities", () => {
  it("blames CORS when only an opaque request gets through", async () => {
    fetchSpy
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(new Response(null));
    await expect(fetchCapabilities(CAPS_URL)).rejects.toThrow(
      /doesn't allow requests from other sites/,
    );
  });

  it("explains a server it can't reach", async () => {
    fetchSpy.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(fetchCapabilities(CAPS_URL)).rejects.toThrow(
      /Couldn't load the capabilities/,
    );
  });

  it("reports HTTP errors", async () => {
    fetchSpy.mockImplementation(
      async () => new Response("Not here", { status: 404 }),
    );
    await expect(fetchCapabilities(CAPS_URL)).rejects.toThrow(/HTTP 404/);
  });

  it("tries WMS when a service isn't WMTS", async () => {
    const wms = wmsCapabilities(
      "1.3.0",
      "<Layer><Name>base</Name><CRS>EPSG:3857</CRS></Layer>",
    );
    fetchSpy.mockImplementation(
      async (input) =>
        new Response(
          /SERVICE=WMS\b/i.test(String(input))
            ? wms
            : "<ServiceExceptionReport/>",
          { headers: { "Content-Type": "text/xml" } },
        ),
    );

    const layers = await fetchCapabilities("https://example.com/ows");
    expect(layers.map((l) => l.id)).toEqual(["base"]);
    expect(fetchSpy.mock.calls.map(([url]) => String(url))).toEqual([
      expect.stringMatching(/SERVICE=WMTS/i),
      expect.stringMatching(/SERVICE=WMS\b/i),
    ]);
  });
});
