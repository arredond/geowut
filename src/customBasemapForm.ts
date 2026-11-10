import { parseTileUrl } from "./customBasemap";
import type { CustomBasemap } from "./customBasemap";
import type { SettingsStore } from "./settings";
import { fetchCapabilities } from "./capabilities";
import type { ServiceLayer } from "./capabilities";

const INVALID_URL =
  "Needs an http(s) tile URL with {z}/{x}/{y}, {TileMatrix}/{TileRow}/{TileCol} or {bbox-epsg-3857}, or a WMS/WMTS service URL.";

/** The URL field under the Custom basemap: tile templates apply at once, WMS/WMTS capabilities offer their layers. */
export class CustomBasemapForm {
  readonly element: HTMLFormElement;
  private store: SettingsStore;
  private input: HTMLInputElement;
  private button: HTMLButtonElement;
  private layerSelect: HTMLSelectElement;
  private message: HTMLElement;
  private layers: ServiceLayer[] = [];
  /** Bumped on every submit, so a slow capabilities response can't overwrite a newer one. */
  private request = 0;

  constructor(store: SettingsStore) {
    this.store = store;

    this.element = document.createElement("form");
    this.element.className = "custom-basemap";
    this.element.noValidate = true;
    this.element.addEventListener("submit", (e) => {
      e.preventDefault();
      void this.submit();
    });

    this.input = document.createElement("input");
    this.input.type = "url";
    this.input.placeholder = "https://…/{z}/{x}/{y}.png";
    this.input.setAttribute("aria-label", "Custom basemap URL");
    this.input.title =
      "An XYZ, WMTS or WMS tile URL template, or a WMS/WMTS GetCapabilities URL";
    this.input.addEventListener("input", () => this.say(null));

    this.button = document.createElement("button");
    this.button.type = "submit";
    this.button.textContent = "Use";

    this.layerSelect = document.createElement("select");
    this.layerSelect.setAttribute("aria-label", "Service layer");
    this.layerSelect.hidden = true;
    this.layerSelect.addEventListener("change", () => {
      const layer = this.layers[Number(this.layerSelect.value)];
      if (layer) this.apply(this.input.value.trim(), layer);
    });

    this.message = document.createElement("p");
    this.message.className = "custom-basemap-message";

    this.element.append(
      this.input,
      this.button,
      this.layerSelect,
      this.message,
    );
    this.reset();
  }

  /** Back to what's saved, dropping any half-picked capabilities. */
  reset(): void {
    const { basemap, customBasemap } = this.store.get();
    this.request++;
    this.element.hidden = basemap !== "custom";
    this.input.value = customBasemap?.url ?? "";
    this.button.disabled = false;
    this.layers = [];
    this.layerSelect.hidden = true;
    this.say(customBasemap?.layer ? `Layer: ${customBasemap.layer}` : null);
  }

  open(): void {
    this.element.hidden = false;
    this.input.focus();
  }

  private async submit(): Promise<void> {
    const url = this.input.value.trim();
    const request = ++this.request;
    this.layers = [];
    this.layerSelect.hidden = true;

    const source = parseTileUrl(url);
    if (source) {
      this.store.set({ basemap: "custom", customBasemap: { url, source } });
      return;
    }
    if (!/^https?:\/\/\S+$/i.test(url)) {
      this.say(INVALID_URL, true);
      return;
    }

    this.button.disabled = true;
    this.say("Loading capabilities…");
    let layers: ServiceLayer[];
    try {
      layers = await fetchCapabilities(url);
    } catch (error) {
      if (request !== this.request) return;
      this.button.disabled = false;
      this.say((error as Error).message, true);
      return;
    }
    if (request !== this.request) return;
    this.button.disabled = false;

    if (layers.length === 1) {
      this.apply(url, layers[0]);
      return;
    }
    this.layers = layers;
    this.layerSelect.replaceChildren(
      new Option(`Pick one of ${layers.length} layers…`, "", true, true),
      ...layers.map((layer, i) => new Option(layer.title, String(i))),
    );
    this.layerSelect.options[0].disabled = true;
    this.layerSelect.hidden = false;
    this.say(null);
    this.layerSelect.focus();
  }

  private apply(url: string, layer: ServiceLayer): void {
    const customBasemap: CustomBasemap = {
      url,
      layer: layer.title,
      source: layer.source,
    };
    this.store.set({ basemap: "custom", customBasemap });
  }

  private say(text: string | null, error = false): void {
    this.message.hidden = text === null;
    this.message.textContent = text ?? "";
    this.message.classList.toggle("error", error);
  }
}
