import "./testStorage";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import { CustomBasemapForm } from "./customBasemapForm";
import { SettingsStore } from "./settings";

function wms(...names: string[]): string {
  const layers = names
    .map((n) => `<Layer><Name>${n}</Name><Title>${n} map</Title></Layer>`)
    .join("");
  return `<WMS_Capabilities version="1.3.0" xmlns:xlink="http://www.w3.org/1999/xlink">
    <Capability>
      <Request><GetMap>
        <Format>image/png</Format>
        <DCPType><HTTP><Get><OnlineResource xlink:href="https://maps.example.com/wms?"/></Get></HTTP></DCPType>
      </GetMap></Request>
      <Layer><CRS>EPSG:3857</CRS>${layers}</Layer>
    </Capability>
  </WMS_Capabilities>`;
}

const SERVICE = "https://maps.example.com/wms";

describe("CustomBasemapForm", () => {
  let store: SettingsStore;
  let form: CustomBasemapForm;
  let fetch: MockInstance<typeof globalThis.fetch>;
  const input = () => form.element.querySelector("input")!;
  const button = () => form.element.querySelector("button")!;
  const select = () => form.element.querySelector("select")!;
  const message = () =>
    form.element.querySelector<HTMLElement>(".custom-basemap-message")!;
  const submit = async (value: string) => {
    input().value = value;
    form.element.requestSubmit();
    await vi.waitFor(() => expect(button().disabled).toBe(false));
  };

  beforeEach(() => {
    localStorage.clear();
    store = new SettingsStore();
    form = new CustomBasemapForm(store);
    // What the settings panel does for it.
    store.subscribe(() => form.reset());
    fetch = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => fetch.mockRestore());

  it("uses tile templates straight away, without fetching", async () => {
    await submit("https://example.com/wms?LAYERS=x&BBOX={bbox-epsg-3857}");
    expect(fetch).not.toHaveBeenCalled();
    expect(store.get().customBasemap?.source.tiles).toEqual([
      "https://example.com/wms?LAYERS=x&BBOX={bbox-epsg-3857}",
    ]);
  });

  it("refuses something that isn't a URL", async () => {
    await submit("tiles please");
    expect(message().hidden).toBe(false);
    expect(message().classList).toContain("error");
    expect(store.get().basemap).toBe("liberty");
  });

  it("applies a service's only layer", async () => {
    fetch.mockResolvedValue(new Response(wms("roads")));
    await submit(SERVICE);
    expect(String(fetch.mock.calls[0][0])).toMatch(
      /^https:\/\/maps\.example\.com\/wms\?.*SERVICE=WMS.*REQUEST=GetCapabilities/i,
    );
    expect(store.get()).toMatchObject({
      basemap: "custom",
      customBasemap: { url: SERVICE, layer: "roads map" },
    });
    expect(message().textContent).toBe("Layer: roads map");
  });

  it("lets you pick among several layers", async () => {
    fetch.mockResolvedValue(new Response(wms("roads", "rivers")));
    await submit(SERVICE);
    expect(store.get().basemap).toBe("liberty");
    expect(select().hidden).toBe(false);
    expect([...select().options].map((o) => o.text)).toEqual([
      "Pick one of 2 layers…",
      "roads map",
      "rivers map",
    ]);

    select().value = "1";
    select().dispatchEvent(new Event("change"));
    expect(store.get().customBasemap).toMatchObject({
      url: SERVICE,
      layer: "rivers map",
      source: { tiles: [expect.stringContaining("LAYERS=rivers&")] },
    });
    expect(select().hidden).toBe(true);
  });

  it("shows why capabilities couldn't be used", async () => {
    fetch.mockRejectedValue(new TypeError("Failed to fetch"));
    await submit(SERVICE);
    expect(message().textContent).toMatch(/CORS/);
    expect(message().classList).toContain("error");
  });

  it("ignores a slow answer once something else was submitted", async () => {
    let answer!: (response: Response) => void;
    fetch.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    input().value = SERVICE;
    form.element.requestSubmit();
    await submit("https://example.com/{z}/{x}/{y}.png");

    answer(new Response(wms("roads")));
    await new Promise((resolve) => setTimeout(resolve));
    expect(store.get().customBasemap?.url).toBe(
      "https://example.com/{z}/{x}/{y}.png",
    );
  });
});
