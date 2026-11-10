import "maplibre-gl/dist/maplibre-gl.css";
import "./style.css";
import { basemapStyle, createMap, setBasemap } from "./map";
import {
  GridLayer,
  GRID_DEFINITIONS,
  gridCellAtPoint,
  cellDetails,
} from "./grids";
import { GridControl } from "./gridControl";
import { DrawController, featureDetails, featureGeometry } from "./draw";
import { FeaturePanel } from "./panel";
import { FeaturePopup } from "./popup";
import { Toolbar, historyShortcut, isTyping } from "./toolbar";
import { AddDataModal } from "./addDataModal";
import type { AddResult } from "./addDataModal";
import type { Feature } from "geojson";
import type { GeoJSONStoreFeatures } from "terra-draw";
import { geometryBbox } from "./geometry";
import { applyTheme, isDarkBasemap, SettingsStore } from "./settings";
import type { Basemap } from "./settings";
import { createGeocoder } from "./geocoder";
import { datedFilename, downloadText } from "./download";
import { ICONS } from "./icons";
import { SettingsPanel } from "./settingsPanel";
import { GridInfoModal } from "./gridInfo";
import { CoveragePreview } from "./grids/preview";

const REPO_URL = "https://github.com/arredond/geowut";

const app = document.querySelector<HTMLDivElement>("#app")!;
const mapContainer = document.querySelector<HTMLDivElement>("#map")!;

const settings = new SettingsStore();
applyTheme(settings.get().theme);
const units = () => settings.get().units;

const { map, scale } = createMap(
  mapContainer,
  basemapStyle(settings.get()),
  settings.get().units,
);

const gridLayers = GRID_DEFINITIONS.map((def) => new GridLayer(map, def));
const matchBasemap = (basemap: Basemap) => {
  for (const layer of gridLayers)
    layer.setLabelHalo(isDarkBasemap(basemap) ? "#1a1d21" : "#ffffff");
};
matchBasemap(settings.get().basemap);

const coveragePreview = new CoveragePreview(map);

const featurePanel = new FeaturePanel(
  app,
  () => ({
    h3: gridLayers.find((l) => l.def.id === "h3")!.resolution,
    quadkey: gridLayers.find((l) => l.def.id === "quadkey")!.resolution,
    s2: gridLayers.find((l) => l.def.id === "s2")!.resolution,
    a5: gridLayers.find((l) => l.def.id === "a5")!.resolution,
  }),
  units,
  (cells) => coveragePreview.show(cells),
  // Its parent and child cells can be added as features.
  (features) => addToMap(features),
);

// Covering labels and previews follow the grid levels. Grids change level together on zoom: one refresh for all.
let panelRefreshQueued = false;
for (const layer of gridLayers) {
  layer.addResolutionListener(() => {
    if (panelRefreshQueued) return;
    panelRefreshQueued = true;
    queueMicrotask(() => {
      panelRefreshQueued = false;
      featurePanel.refresh();
    });
  });
}

const featurePopup = new FeaturePopup(map);
const gridInfo = new GridInfoModal(app, gridLayers, units);

function showFeature(feature: GeoJSONStoreFeatures): void {
  featurePanel.show(featureGeometry(feature), {
    key: `feature:${feature.id}`,
    details: (units) => featureDetails(feature, units),
  });
}

const draw = new DrawController(map, {
  onStateChange: (state) => {
    toolbar.setState(state);
    app.classList.toggle("deleting", state === "delete");
    if (state !== "select") featurePopup.hide();
  },
  onHistoryChange: (canUndo, canRedo) => toolbar.setHistory(canUndo, canRedo),
  onMeasurementChange: (measurement) => toolbar.setMeasurement(measurement),
  onFeatureChanged: showFeature,
  onFeaturesRemoved: () => {
    featurePanel.hide();
    featurePopup.hide();
  },
  onMapClicked: (feature, event) => {
    const hit = gridCellAtPoint(map, gridLayers, event.point);
    if (hit) {
      featurePanel.show(hit.cell.geometry, {
        key: `cell:${hit.layer.def.id}:${hit.cell.properties.id}`,
        details: cellDetails(hit),
        cell: { grid: hit.layer.def.id, level: hit.layer.resolution },
      });
    } else if (feature) {
      const id = feature.id!;
      showFeature(feature);
      featurePopup.show(event.lngLat, {
        onEdit: () => draw.edit(id),
        onDelete: () => draw.delete(id),
      });
    } else {
      featurePanel.hide();
    }
  },
});

const toolbar = new Toolbar(
  app,
  {
    setState: (state) => draw.setState(state),
    deleteAll: () => draw.deleteAll(),
    undo: () => draw.undo(),
    redo: () => draw.redo(),
    exportAll: () =>
      downloadText(
        datedFilename("geojson"),
        JSON.stringify(draw.exportFeatures(), null, 2),
        "application/geo+json",
      ),
  },
  units(),
);

settings.subscribe(({ units, theme, basemap, customBasemap }, changed) => {
  if (changed.includes("theme")) applyTheme(theme);
  if (
    changed.includes("basemap") ||
    (basemap === "custom" && changed.includes("customBasemap"))
  ) {
    setBasemap(map, basemapStyle({ basemap, customBasemap }));
    matchBasemap(basemap);
  }
  if (changed.includes("units")) {
    scale.setUnit(units);
    toolbar.setUnits(units);
    featurePanel.refresh();
    gridInfo.refresh();
  }
});

/** Draws features and fits the map to them, for "Add data", pasting and search results. */
function addToMap(features: Feature[]): AddResult {
  const { added, rejected } = draw.addFeatures(features);
  if (added.length === 0) return { added: 0, rejected };

  const [west, south, east, north] = geometryBbox({
    type: "GeometryCollection",
    geometries: added.map((feature) => feature.geometry),
  });
  map.fitBounds(
    [
      [west, south],
      [east, north],
    ],
    { padding: 60, maxZoom: 16 },
  );
  return { added: added.length, rejected };
}

const addDataModal = new AddDataModal(app, addToMap);

// Pasting anywhere but a text field adds the data, as "Add data" would.
document.addEventListener("paste", (e) => {
  if (isTyping(e) || !addDataModal.isHidden()) return;
  const text = e.clipboardData?.getData("text/plain");
  if (!text?.trim()) return;
  e.preventDefault();
  addDataModal.addPasted(text);
});

document.addEventListener("keydown", (e) => {
  const history = historyShortcut(e);
  if (history) {
    e.preventDefault();
    draw[history]();
  } else if (e.key === "Escape") {
    draw.setState("select");
    featurePopup.hide();
  } else if (e.key === "Backspace" && !isTyping(e)) {
    featurePopup.deleteFeature();
  }
});

map.on("load", () => {
  for (const layer of gridLayers) layer.addToMap();
  coveragePreview.addToMap();

  new GridControl(app, gridLayers, () => gridInfo.show());

  const search = document.createElement("div");
  search.className = "search";
  app.appendChild(search);
  createGeocoder(map, search, addToMap);

  const toolbar = document.createElement("div");
  toolbar.className = "toolbar";

  const addDataButton = document.createElement("button");
  addDataButton.type = "button";
  addDataButton.className = "toolbar-button";
  addDataButton.textContent = "Add data";
  addDataButton.addEventListener("click", () => addDataModal.show());

  toolbar.appendChild(addDataButton);
  new SettingsPanel(toolbar, settings);

  const repoLink = document.createElement("a");
  repoLink.className = "toolbar-button icon-only";
  repoLink.href = REPO_URL;
  repoLink.target = "_blank";
  repoLink.rel = "noopener noreferrer";
  repoLink.title = "GeoWut on GitHub";
  repoLink.setAttribute("aria-label", "GeoWut on GitHub");
  repoLink.innerHTML = ICONS.github;
  toolbar.appendChild(repoLink);

  app.appendChild(toolbar);
});

map.on("moveend", () => {
  for (const layer of gridLayers) {
    if (layer.visible) layer.refresh();
  }
});

map.on("zoomend", () => {
  for (const layer of gridLayers) layer.resetResolutionForZoom();
});
