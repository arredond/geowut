import { describe, expect, it } from "vitest";
import { formatArea, formatLength } from "./units";

describe("formatLength", () => {
  it("uses meters under a kilometer", () => {
    expect(formatLength(0.8504, "metric")).toBe("850 m");
    expect(formatLength(0.0123, "metric")).toBe("12.3 m");
  });

  it("keeps about three significant digits in kilometers", () => {
    expect(formatLength(1.23456, "metric")).toBe("1.23 km");
    expect(formatLength(12.3456, "metric")).toBe("12.3 km");
    expect(formatLength(12345.6, "metric")).toBe("12,346 km");
  });

  it("uses miles, and feet under a tenth of a mile", () => {
    expect(formatLength(1.609344, "imperial")).toBe("1 mi");
    expect(formatLength(0.03048, "imperial")).toBe("100 ft");
    expect(formatLength(0.3218688, "imperial")).toBe("0.2 mi");
  });
});

describe("formatArea", () => {
  it("uses square kilometers, then hectares, then square meters", () => {
    expect(formatArea(2.5, "metric")).toBe("2.5 km²");
    expect(formatArea(0.5, "metric")).toBe("50 ha");
    expect(formatArea(0.005, "metric")).toBe("5,000 m²");
  });

  it("uses square miles, then acres, then square feet", () => {
    expect(formatArea(2.589988, "imperial")).toBe("1 mi²");
    expect(formatArea(2.589988 / 64, "imperial")).toBe("10 ac");
    expect(formatArea((0.3048 ** 2 / 1e6) * 100, "imperial")).toBe("100 ft²");
  });
});
