import { describe, expect, it } from "vitest";
import { parseDms } from "./dms";

const MADRID = [-3.70381, 40.41683];

describe("parseDms", () => {
  it.each([
    `40°25'0.6"N 3°42'13.7"W`, // Google Maps
    `40°25′0.6″N, 3°42′13.7″W`, // primes
    `40º 25' 0.6'' N 3º 42' 13.7'' W`, // ordinal signs and doubled quotes
    `N 40°25'0.6" W 3°42'13.7"`, // leading hemispheres
    `3°42'13.7"W 40°25'0.6"N`, // longitude first
    `40 25 0.6 N 3 42 13.7 W`, // no symbols
    `40°25'0.6" -3°42'13.7"`, // signed, no hemispheres
    `40° 25.01' N, 3° 42.2283' W`, // degrees and decimal minutes
    `40.41683° N, 3.70381° W`, // decimal degrees
    `40.41683N 3.70381W`,
    `40.41683, -3.70381°`,
    `40deg25'0.6"n 3deg42'13.7"w`,
  ])("reads %s", (text) => {
    const [lng, lat] = parseDms(text)!;
    expect(lng).toBeCloseTo(MADRID[0], 4);
    expect(lat).toBeCloseTo(MADRID[1], 4);
  });

  it.each([
    "40.4168, -3.7038", // plain numbers are read elsewhere
    `40°N 3°S`, // two latitudes
    `40°60'N 3°W`, // 60 minutes
    `40.5°25'N 3°W`, // a fraction before the last part
    `40°25'-3"N 3°W`, // a sign past the degrees
    `-40°N 3°W`, // a sign and a hemisphere
    `95°N 3°W`, // off the globe
    `40°N`, // one coordinate
    `40°N 3°W 2°E`,
    `40"25'N 3°W`, // units out of order
    "Norte 40, Oeste 3",
    "4e3", // a hex ID
    "1e5 2e5",
  ])("refuses %s", (text) => expect(parseDms(text)).toBeNull());
});
