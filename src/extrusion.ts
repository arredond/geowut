import type { Feature, FeatureCollection, Polygon } from "geojson";
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import type { GeoJSONStoreFeatures } from "terra-draw";

const SOURCE_ID = "z-extrusion";
const LAYER_ID = "z-extrusion";
/** Terra Draw's own polygon fill, so prisms read as the polygons they stand on. */
const COLOR = "#3f97e0";

/**
 * Polygons with Z, as prisms rising from the ground to their highest Z, taken for metres above
 * it: MapLibre's fill-extrusion, flat-topped. Each stands on the polygon as the map holds it,
 * following it while it's dragged. Lines and points stay flat, MapLibre having no way to lift
 * them. Shown only while the map is tilted: from straight above, a prism is just a second fill.
 */
export function extrusionFeatures(shapes: GeoJSONStoreFeatures[]): Feature[] {
  return shapes.flatMap((shape) => {
    const z = shape.properties.zRange as [number, number] | undefined;
    // Below the ground there's nothing to raise.
    if (shape.geometry.type !== "Polygon" || !z || z[1] <= 0) return [];
    return [
      {
        type: "Feature",
        geometry: shape.geometry as Polygon,
        properties: { height: z[1] },
      },
    ];
  });
}

export class Extrusion {
  private map: MapLibreMap;
  private features: Feature[] = [];

  constructor(map: MapLibreMap) {
    this.map = map;
  }

  /** Adds the layer under Terra Draw's, so its handles and outlines stay on top. */
  addToMap(): void {
    this.map.addSource(SOURCE_ID, { type: "geojson", data: this.collection() });
    const beforeId = this.map
      .getStyle()
      .layers.find((layer) => layer.id.startsWith("td-"))?.id;
    this.map.addLayer(
      {
        id: LAYER_ID,
        type: "fill-extrusion",
        source: SOURCE_ID,
        layout: { visibility: "none" },
        paint: {
          "fill-extrusion-color": COLOR,
          "fill-extrusion-height": ["get", "height"],
          "fill-extrusion-base": 0,
          "fill-extrusion-opacity": 0.6,
        },
      },
      beforeId,
    );
    this.map.on("pitch", () => this.updateVisibility());
    this.updateVisibility();
  }

  update(shapes: GeoJSONStoreFeatures[]): void {
    this.features = extrusionFeatures(shapes);
    this.map.getSource<GeoJSONSource>(SOURCE_ID)?.setData(this.collection());
    this.updateVisibility();
  }

  private collection(): FeatureCollection {
    return { type: "FeatureCollection", features: this.features };
  }

  private updateVisibility(): void {
    if (!this.map.getLayer(LAYER_ID)) return;
    const visible = this.map.getPitch() > 0 && this.features.length > 0;
    this.map.setLayoutProperty(
      LAYER_ID,
      "visibility",
      visible ? "visible" : "none",
    );
  }
}
