import { describe, expect, it } from "vitest";
import { parseMapUrl } from "./mapUrl";

describe("parseMapUrl", () => {
  it.each([
    ["Google's view", "https://www.google.com/maps/@40.4168,-3.7038,15z"],
    [
      "Google's pin over its view",
      "https://www.google.com/maps/place/Puerta+del+Sol/@40.41,-3.71,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d40.4168!4d-3.7038!16s",
    ],
    [
      "Google's search",
      "https://www.google.com/maps/search/?api=1&query=40.4168,-3.7038",
    ],
    ["Google's q", "https://maps.google.com/?q=40.4168,-3.7038"],
    ["Google, encoded", "https://maps.google.com/?q=40.4168%2C-3.7038"],
    [
      "OSM's marker over its view",
      "https://www.openstreetmap.org/?mlat=40.4168&mlon=-3.7038#map=12/40.1/-3.1",
    ],
    ["OSM's view", "https://www.openstreetmap.org/#map=15/40.4168/-3.7038"],
    ["a web map's hash", "https://geojson.io/#15.5/40.4168/-3.7038/20/45"],
    ["Bing", "https://www.bing.com/maps?cp=40.4168~-3.7038&lvl=15"],
    ["Apple", "https://maps.apple.com/?ll=40.4168,-3.7038&z=15"],
    ["a geo: URI", "geo:40.4168,-3.7038"],
    ["a geo: URI with altitude and accuracy", "geo:40.4168,-3.7038,650;u=35"],
    ["Android's geo: search", "geo:0,0?q=40.4168,-3.7038(Sol)"],
  ])("reads %s", (_, url) => {
    expect(parseMapUrl(url)).toEqual([-3.7038, 40.4168]);
  });

  it.each([
    "https://www.google.com/maps",
    "https://example.com/?q=hello",
    "ftp://example.com/?ll=40,-3",
    "geo:95,0",
    "not a url",
  ])("ignores %s", (url) => expect(parseMapUrl(url)).toBeNull());
});
