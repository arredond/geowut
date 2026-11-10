import { isCustomBasemap } from "./customBasemap";
import type { CustomBasemap } from "./customBasemap";
import type { Units } from "./units";

export type Theme = "light" | "dark" | "auto";

/** OpenFreeMap's styles. Dark ones get dark halos around our labels. */
export const BASEMAPS = [
  { id: "liberty", label: "Liberty", dark: false },
  { id: "bright", label: "Bright", dark: false },
  { id: "positron", label: "Positron", dark: false },
  { id: "dark", label: "Dark", dark: true },
  { id: "fiord", label: "Fiord", dark: true },
] as const;
export type OpenFreeMapStyle = (typeof BASEMAPS)[number]["id"];
/**
 * Custom is a raster tile URL of the user's own, kept in customBasemap. Auto follows the theme:
 * Liberty when it's light, Dark when it's dark.
 */
export type Basemap = OpenFreeMapStyle | "custom" | "auto";
/** The basemap actually shown, Auto settled. */
export type ShownBasemap = Exclude<Basemap, "auto">;

/** Auto's pick, by the theme, or the system's when that's on Auto too. */
export function resolveBasemap(
  { theme, basemap }: Pick<Settings, "theme" | "basemap">,
  systemDark: boolean,
): ShownBasemap {
  if (basemap !== "auto") return basemap;
  const dark = theme === "dark" || (theme === "auto" && systemDark);
  return dark ? "dark" : "liberty";
}

/** We can't tell what a custom basemap looks like, so it gets the light treatment. */
export const isDarkBasemap = (basemap: ShownBasemap) =>
  BASEMAPS.find((b) => b.id === basemap)?.dark ?? false;

export const basemapStyleUrl = (basemap: OpenFreeMapStyle) =>
  `https://tiles.openfreemap.org/styles/${basemap}`;

export interface Settings {
  units: Units;
  theme: Theme;
  basemap: Basemap;
  customBasemap: CustomBasemap | null;
}

export const DEFAULT_SETTINGS: Settings = {
  units: "metric",
  theme: "auto",
  basemap: "auto",
  customBasemap: null,
};

const STORAGE_KEY = "geowut:settings";

const isOneOf = <T>(value: unknown, options: readonly T[]): value is T =>
  options.includes(value as T);

/** Whatever was saved, minus anything no longer valid, such as a basemap that has since been dropped. */
function load(): Settings {
  let saved: Record<string, unknown> = {};
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") ?? {};
  } catch {
    // Storage blocked or garbled: start from the defaults.
  }
  const customBasemap = isCustomBasemap(saved.customBasemap)
    ? saved.customBasemap
    : DEFAULT_SETTINGS.customBasemap;
  return {
    units: isOneOf(saved.units, ["metric", "imperial"] as const)
      ? saved.units
      : DEFAULT_SETTINGS.units,
    theme: isOneOf(saved.theme, ["light", "dark", "auto"] as const)
      ? saved.theme
      : DEFAULT_SETTINGS.theme,
    basemap:
      isOneOf(
        saved.basemap,
        BASEMAPS.map((b) => b.id),
      ) ||
      saved.basemap === "auto" ||
      (saved.basemap === "custom" && customBasemap)
        ? (saved.basemap as Basemap)
        : DEFAULT_SETTINGS.basemap,
    customBasemap,
  };
}

type Listener = (settings: Settings, changed: (keyof Settings)[]) => void;

export class SettingsStore {
  private current: Settings = load();
  private listeners: Listener[] = [];

  get(): Settings {
    return this.current;
  }

  set(change: Partial<Settings>): void {
    const changed = (Object.keys(change) as (keyof Settings)[]).filter(
      (key) => change[key] !== this.current[key],
    );
    if (changed.length === 0) return;
    this.current = { ...this.current, ...change };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.current));
    } catch {
      // Settings then last only as long as the page.
    }
    for (const listener of this.listeners) listener(this.current, changed);
  }

  subscribe(listener: Listener): void {
    this.listeners.push(listener);
  }
}

/** Auto leaves it to the system, through the stylesheet's prefers-color-scheme rules. */
export function applyTheme(
  theme: Theme,
  root: HTMLElement = document.documentElement,
): void {
  if (theme === "auto") delete root.dataset.theme;
  else root.dataset.theme = theme;
}
