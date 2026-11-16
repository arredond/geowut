import type { Map } from "maplibre-gl";
import type { MaplibreStarfieldLayer } from "@geoql/maplibre-gl-starfield";

/** Not one of our overlay prefixes: custom layers aren't part of the style, so it's re-added by hand. */
export const STARFIELD_ID = "starfield";

/** Past this zoom the globe fills the view and has flattened out: no space left to show. */
export const STARFIELD_MAX_ZOOM = 6;

/** Deep space behind the globe, a touch lighter towards it, shown until the stars are in. */
export const SPACE_BACKGROUND =
  "radial-gradient(circle, #101a2c 25%, #03050a 75%)";

/** ESO/S. Brunier's Milky Way panorama (eso0932a, CC BY 4.0), resized to 4096×2048 as the plugin suggests. */
export const GALAXY_URL = `${import.meta.env.BASE_URL}milkyway.jpg`;

/** Credit the panorama's license asks for, shown with the map's other attributions. */
export const GALAXY_ATTRIBUTION =
  'Milky Way © <a href="https://www.eso.org/public/images/eso0932a/" target="_blank" rel="noopener">ESO/S. Brunier</a> (CC BY 4.0)';

/** How often the sun moves to where it is now, in milliseconds: Earth turns a quarter degree a minute. */
const SUN_UPDATE_MS = 60_000;

const DEG = Math.PI / 180;
const wrap180 = (deg: number) => ((((deg + 180) % 360) + 360) % 360) - 180;

/**
 * Where the sun is overhead at a moment, in degrees: its declination as the latitude, and the
 * longitude where it's solar noon. The Astronomical Almanac's low-precision formulas, good to
 * about a hundredth of a degree for decades either side of 2000: far finer than a skybox needs.
 */
export function subsolarPoint(date: Date): { lng: number; lat: number } {
  const days = date.getTime() / 86_400_000 - 10_957.5; // since J2000.0, 2000-01-01 12:00 UTC
  const meanLongitude = 280.46 + 0.9856474 * days;
  const meanAnomaly = (357.528 + 0.9856003 * days) * DEG;
  const eclipticLongitude =
    (meanLongitude +
      1.915 * Math.sin(meanAnomaly) +
      0.02 * Math.sin(2 * meanAnomaly)) *
    DEG;
  const obliquity = (23.439 - 0.0000004 * days) * DEG;
  const declination = Math.asin(
    Math.sin(obliquity) * Math.sin(eclipticLongitude),
  );
  const rightAscension = Math.atan2(
    Math.cos(obliquity) * Math.sin(eclipticLongitude),
    Math.cos(eclipticLongitude),
  );
  const siderealTime = 280.46061837 + 360.98564736629 * days;
  return {
    lng: wrap180(rightAscension / DEG - siderealTime),
    lat: declination / DEG,
  };
}

/**
 * Stars, the Milky Way and the sun behind the globe, from @geoql/maplibre-gl-starfield. It brings
 * three.js, so it's only fetched once the globe is on, and MapLibre drops custom layers with each
 * new style, so it's put back after every basemap swap. The sun sits where it really is, so it
 * shows past the globe's edge when you look at the night side, and keeps up as Earth turns.
 */
export class Starfield {
  private map: Map;
  private enabled = false;
  private load?: Promise<typeof MaplibreStarfieldLayer>;
  private layer?: MaplibreStarfieldLayer;
  private sunTimer?: ReturnType<typeof setInterval>;

  constructor(map: Map) {
    this.map = map;
    map.on("style.load", () => void this.sync());
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    void this.sync();
  }

  private async sync(): Promise<void> {
    if (!this.enabled) {
      if (this.map.getLayer(STARFIELD_ID)) this.map.removeLayer(STARFIELD_ID);
      clearInterval(this.sunTimer);
      this.sunTimer = undefined;
      return;
    }
    this.load ??= import("@geoql/maplibre-gl-starfield").then(
      (module) => module.MaplibreStarfieldLayer,
    );
    const Layer = await this.load;
    // Turned off while loading, or added already by an earlier call.
    if (!this.enabled || this.map.getLayer(STARFIELD_ID)) return;
    const sun = subsolarPoint(new Date());
    const layer = new Layer({
      id: STARFIELD_ID,
      // Point sizes are in device pixels: as fine on a high-density screen as elsewhere.
      starSize: 1.6 * devicePixelRatio,
      galaxyTextureUrl: GALAXY_URL,
      sunEnabled: true,
      sunSize: 100,
      sunIntensity: 0.7,
      // The plugin takes the subsolar point: east longitude from 0 to 360, and declination.
      sunAzimuth: (sun.lng + 360) % 360,
      sunAltitude: sun.lat,
      // Its fading is for a sky seen from the ground; from space the stars stay out by day.
      autoFadeStars: false,
    });
    try {
      // Beneath everything, so the globe hides the stars (and the sun) behind it.
      this.map.addLayer(layer, this.map.getStyle().layers[0]?.id);
    } catch {
      // A style still loading: its style.load comes back here. (isStyleLoaded won't do, as it
      // waits for tiles too.)
      return;
    }
    this.layer = layer;
    this.map.setLayerZoomRange(STARFIELD_ID, 0, STARFIELD_MAX_ZOOM);
    this.sunTimer ??= setInterval(() => this.moveSun(), SUN_UPDATE_MS);
  }

  private moveSun(): void {
    if (!this.layer || !this.map.getLayer(STARFIELD_ID)) return;
    const { lng, lat } = subsolarPoint(new Date());
    this.layer.setSunPosition((lng + 360) % 360, lat);
  }
}
