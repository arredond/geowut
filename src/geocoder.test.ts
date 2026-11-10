import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import { nominatimOutlines, osmKey, photonGeocoderApi } from "./geocoder";

const toledo = {
  type: "Feature",
  geometry: { type: "Point", coordinates: [-4.024, 39.856] },
  properties: {
    osm_type: "R",
    osm_id: 342999,
    osm_key: "place",
    osm_value: "city",
    type: "city",
    name: "Toledo",
    county: "Toledo",
    state: "Castilla-La Mancha",
    country: "España",
    extent: [-4.18, 39.925, -3.815, 39.811],
  },
};
const address = {
  type: "Feature",
  geometry: { type: "Point", coordinates: [-3.7, 40.41] },
  properties: {
    osm_type: "N",
    osm_id: 7,
    street: "Calle Mayor",
    housenumber: "5",
    city: "Madrid",
    country: "España",
  },
};

describe("photonGeocoderApi", () => {
  let fetch: MockInstance<typeof globalThis.fetch>;
  const respond = (features: object[]) =>
    new Response(JSON.stringify({ type: "FeatureCollection", features }));
  const answer = (features: object[]) =>
    fetch.mockImplementation(async () => respond(features));
  const params = (call = 0) =>
    Object.fromEntries(new URL(String(fetch.mock.calls[call][0])).searchParams);

  beforeEach(() => {
    fetch = vi.spyOn(globalThis, "fetch");
  });
  afterEach(() => fetch.mockRestore());

  it("asks Photon, near the map centre, in a language it knows", async () => {
    answer([]);
    const api = photonGeocoderApi();
    await api.forwardGeocode({
      query: " toled ",
      limit: 3,
      language: "fr-CA",
      proximity: [-3.70379, 40.41678],
    });
    expect(String(fetch.mock.calls[0][0])).toMatch(
      /^https:\/\/photon\.komoot\.io\/api\/\?/,
    );
    expect(params()).toEqual({
      q: "toled",
      limit: "3",
      lang: "fr",
      lon: "-3.704",
      lat: "40.417",
    });

    // The control passes its languages as a list, whatever the typings say.
    await api.forwardGeocode({
      query: "toledo",
      language: ["de-AT", "en"] as unknown as string,
    });
    expect(params(1)).toMatchObject({ lang: "de" });

    // Photon refuses languages it doesn't have, so those go unasked.
    await api.forwardGeocode({ query: "toled", language: "es-ES" });
    expect(params(2)).not.toHaveProperty("lang");
  });

  it("turns results into places with a name, centre and bbox to fly to", async () => {
    answer([toledo, address]);
    const { features } = await photonGeocoderApi().forwardGeocode({
      query: "toled",
    });
    expect(features[0]).toMatchObject({
      text: "Toledo",
      place_name: "Toledo, Castilla-La Mancha, España",
      center: [-4.024, 39.856],
      bbox: [-4.18, 39.811, -3.815, 39.925],
      properties: {
        osm_type: "relation",
        osm_id: 342999,
        category: "place",
        type: "city",
      },
    });
    expect(features[1]).toMatchObject({
      text: "Calle Mayor 5",
      place_name: "Calle Mayor 5, Madrid, España",
    });
    expect(features[1]).not.toHaveProperty("bbox");
    expect(osmKey(features[0])).toBe("R342999");
  });

  it("asks only once for the same search", async () => {
    answer([toledo]);
    const api = photonGeocoderApi();
    await api.forwardGeocode({ query: "toled" });
    await api.forwardGeocode({ query: "toled " });
    expect(fetch).toHaveBeenCalledOnce();
    await api.forwardGeocode({ query: "toled", limit: 10 });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("never lets a slow, older search overwrite a newer one", async () => {
    let answerOld!: (response: Response) => void;
    fetch
      .mockReturnValueOnce(new Promise((resolve) => (answerOld = resolve)))
      .mockResolvedValueOnce(respond([toledo]));
    const api = photonGeocoderApi();
    const old = api.forwardGeocode({ query: "tol" });
    const newer = await api.forwardGeocode({ query: "toledo" });
    answerOld(respond([address]));
    expect((await old).features).toEqual(newer.features);
    expect(newer.features[0].text).toBe("Toledo");
  });

  it("fails on HTTP errors, and tries again next time", async () => {
    fetch.mockResolvedValueOnce(new Response("Slow down", { status: 429 }));
    const api = photonGeocoderApi();
    await expect(api.forwardGeocode({ query: "toled" })).rejects.toThrow(/429/);
    answer([toledo]);
    await expect(api.forwardGeocode({ query: "toled" })).resolves.toMatchObject(
      { features: [expect.anything()] },
    );
  });
});

const place = (
  properties: object,
  geometry = { type: "Point", coordinates: [1, 2] },
) =>
  ({
    type: "Feature",
    geometry,
    properties: { display_name: "Somewhere, Earth", ...properties },
    text: "Somewhere, Earth",
    place_name: "Somewhere, Earth",
    place_type: ["place"],
  }) as Parameters<ReturnType<typeof nominatimOutlines>>[0];

describe("osmKey", () => {
  it.each([
    [{ osm_type: "relation", osm_id: 5326784 }, "R5326784"],
    [{ osm_type: "way", osm_id: 12 }, "W12"],
    [{ osm_type: "node", osm_id: 3 }, "N3"],
    [{ osm_type: "area", osm_id: 3 }, null],
    [{}, null],
  ])("names %j as %s", (properties, key) => {
    expect(osmKey(place(properties))).toBe(key);
  });
});

describe("nominatimOutlines", () => {
  let fetch: MockInstance<typeof globalThis.fetch>;
  const boundary = {
    type: "Polygon",
    coordinates: [
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 0],
      ],
    ],
  };

  beforeEach(() => {
    fetch = vi.spyOn(globalThis, "fetch");
  });
  afterEach(() => fetch.mockRestore());

  it("looks up a relation's outline, simplified, once", async () => {
    fetch.mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            type: "FeatureCollection",
            features: [{ type: "Feature", geometry: boundary, properties: {} }],
          }),
        ),
    );
    const outline = nominatimOutlines();
    const madrid = place({
      osm_type: "relation",
      osm_id: 5326784,
      category: "boundary",
      type: "administrative",
    });

    expect(await outline(madrid)).toEqual({
      type: "Feature",
      geometry: boundary,
      properties: {
        name: "Somewhere, Earth",
        category: "boundary",
        type: "administrative",
        osm: "relation/5326784",
      },
    });
    const url = new URL(String(fetch.mock.calls[0][0]));
    expect(url.pathname).toBe("/lookup");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      osm_ids: "R5326784",
      format: "geojson",
      polygon_geojson: "1",
      polygon_threshold: "0.0001",
    });

    await outline(madrid);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("uses a node's own point, without asking", async () => {
    const feature = await nominatimOutlines()(
      place({ osm_type: "node", osm_id: 3 }),
    );
    expect(feature.geometry).toEqual({ type: "Point", coordinates: [1, 2] });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fails when Nominatim has no outline, and asks again next time", async () => {
    fetch.mockImplementation(
      async () =>
        new Response(
          JSON.stringify({ type: "FeatureCollection", features: [] }),
        ),
    );
    const outline = nominatimOutlines();
    const way = place({ osm_type: "way", osm_id: 12 });
    await expect(outline(way)).rejects.toThrow(/no outline/);
    await expect(outline(way)).rejects.toThrow(/no outline/);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
