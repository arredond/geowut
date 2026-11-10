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
import { enableFileDrop } from "./fileDrop";
import { Extrusion } from "./extrusion";
import type { AddResult } from "./addDataModal";
import type { Feature } from "geojson";
import type { LngLatLike, MapMouseEvent } from "maplibre-gl";
import type { GeoJSONStoreFeatures } from "terra-draw";
import { geometryBbox } from "./geometry";
import {
  applyTheme,
  isDarkBasemap,
  resolveBasemap,
  SettingsStore,
} from "./settings";
import type { ShownBasemap } from "./settings";
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

// The Auto basemap follows the theme, and so the system's light or dark when that's Auto too.
const systemDark = matchMedia("(prefers-color-scheme: dark)");
const wantedBasemap = () => resolveBasemap(settings.get(), systemDark.matches);
let shownBasemap = wantedBasemap();

const { map, scale } = createMap(
  mapContainer,
  basemapStyle({
    basemap: shownBasemap,
    customBasemap: settings.get().customBasemap,
  }),
  settings.get().units,
);

const gridLayers = GRID_DEFINITIONS.map((def) => new GridLayer(map, def));
const matchBasemap = (basemap: ShownBasemap) => {
  for (const layer of gridLayers)
    layer.setLabelHalo(isDarkBasemap(basemap) ? "#1a1d21" : "#ffffff");
};
matchBasemap(shownBasemap);

/** Swaps the basemap if the settings or the system now call for another (or new custom tiles). */
function showBasemap(force = false): void {
  const basemap = wantedBasemap();
  if (basemap === shownBasemap && !force) return;
  shownBasemap = basemap;
  setBasemap(
    map,
    basemapStyle({ basemap, customBasemap: settings.get().customBasemap }),
  );
  matchBasemap(basemap);
}
systemDark.addEventListener("change", () => showBasemap());

const coveragePreview = new CoveragePreview(map);
const extrusion = new Extrusion(map);

const featurePanel = new FeaturePanel(
  app,
  () => ({
    h3: gridLayers.find((l) => l.def.id === "h3")!.resolution,
    xyz: gridLayers.find((l) => l.def.id === "xyz")!.resolution,
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

/**
 * Where a feature's popup points. Clicks on points and lines land a few pixels off them, and
 * that gap grows as the map zooms in, so the popup snaps to the point, or the nearest spot on
 * the line. Polygons are clicked inside, so there it's the click.
 */
function popupAnchor(
  feature: GeoJSONStoreFeatures,
  event: MapMouseEvent,
): LngLatLike {
  const { geometry } = feature;
  if (geometry.type === "Point") {
    const [lng, lat] = geometry.coordinates;
    return [lng, lat];
  }
  if (geometry.type !== "LineString") return event.lngLat;

  // Nearest on screen, as the click's buffer is measured.
  const click = event.point;
  const vertices = geometry.coordinates.map(([lng, lat]) =>
    map.project([lng, lat]),
  );
  let nearest = vertices[0];
  let nearestDistance = Infinity;
  for (let i = 1; i < vertices.length; i++) {
    const a = vertices[i - 1];
    const ab = vertices[i].sub(a);
    const lengthSq = ab.x * ab.x + ab.y * ab.y;
    const t =
      lengthSq === 0
        ? 0
        : Math.max(
            0,
            Math.min(
              1,
              ((click.x - a.x) * ab.x + (click.y - a.y) * ab.y) / lengthSq,
            ),
          );
    const candidate = a.add(ab.mult(t));
    const distance = candidate.dist(click);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = candidate;
    }
  }
  return map.unproject(nearest);
}

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
  onShapesChange: () => {
    const shapes = draw.shapes();
    toolbar.setHasFeatures(shapes.length > 0);
    extrusion.update(shapes);
  },
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
      featurePopup.show(popupAnchor(feature, event), {
        onEdit: () => draw.edit(id),
        onDelete: () => draw.delete(id),
      });
    } else {
      featurePanel.hide();
    }
  },
});

// One band across the top: search on the left, drawing in the middle, the rest on the right.
// On phones the drawing tools drop to the bottom edge instead.
const topbar = document.createElement("div");
topbar.className = "topbar";
const [topLeft, topCenter, topRight] = ["start", "center", "end"].map(
  (slot) => {
    const el = document.createElement("div");
    el.className = `topbar-${slot}`;
    topbar.appendChild(el);
    return el;
  },
);
app.appendChild(topbar);

const toolbar = new Toolbar(
  topCenter,
  {
    setState: (state) => draw.setState(state),
    deleteAll: () => draw.deleteAll(),
    undo: () => draw.undo(),
    redo: () => draw.redo(),
    exportAll: () => {
      // The button is off on an empty map, but an empty file is never wanted either way.
      if (!draw.hasFeatures()) return;
      downloadText(
        datedFilename("geojson"),
        JSON.stringify(draw.exportFeatures(), null, 2),
        "application/geo+json",
      );
    },
  },
  units(),
);

settings.subscribe(({ units, theme }, changed) => {
  if (changed.includes("theme")) applyTheme(theme);
  showBasemap(shownBasemap === "custom" && changed.includes("customBasemap"));
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

// Pasting anywhere but a text field adds the data, as "Add data" would: files copied in a
// file manager too.
document.addEventListener("paste", (e) => {
  if (isTyping(e) || !addDataModal.isHidden()) return;
  const files = [...(e.clipboardData?.files ?? [])];
  if (files.length > 0) {
    e.preventDefault();
    void addDataModal.addFiles(files);
    return;
  }
  const text = e.clipboardData?.getData("text/plain");
  if (!text?.trim()) return;
  e.preventDefault();
  void addDataModal.addPasted(text);
});

enableFileDrop(app, (files) => void addDataModal.addFiles(files));

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
  extrusion.addToMap();

  const gridControl = new GridControl(app, gridLayers, () => gridInfo.show());
  gridControl.setZoom(map.getZoom());
  // Phones start with the card folded, to leave the map room.
  if (matchMedia("(max-width: 720px)").matches) gridControl.setCollapsed(true);
  map.on("zoom", () => gridControl.setZoom(map.getZoom()));

  const search = document.createElement("div");
  search.className = "search";
  topLeft.appendChild(search);
  createGeocoder(map, search, addToMap);
  collapsibleSearch(search);

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
  repoLink.className = "toolbar-button icon-only repo-link";
  repoLink.href = REPO_URL;
  repoLink.target = "_blank";
  repoLink.rel = "noopener noreferrer";
  repoLink.title = "GeoWut on GitHub";
  repoLink.setAttribute("aria-label", "GeoWut on GitHub");
  repoLink.innerHTML = ICONS.github;
  toolbar.appendChild(repoLink);

  topRight.appendChild(toolbar);
});

/**
 * Where the top band is too narrow for the whole search box, it folds to a magnifying glass
 * that opens it across the band. It folds again on Escape, or once the map is touched or moves
 * (as it flies to a picked place).
 */
function collapsibleSearch(search: HTMLElement): void {
  const input = search.querySelector<HTMLInputElement>("input")!;
  const open = document.createElement("button");
  open.type = "button";
  open.className = "toolbar-button icon-only search-toggle";
  open.title = "Search places";
  open.setAttribute("aria-label", "Search places");
  open.innerHTML = ICONS.search;
  search.prepend(open);

  const setOpen = (isOpen: boolean) => search.classList.toggle("open", isOpen);
  open.addEventListener("click", () => {
    setOpen(true);
    input.focus();
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") setOpen(false);
  });
  map.getContainer().addEventListener("pointerdown", () => setOpen(false));
  map.on("movestart", () => setOpen(false));
}

map.on("moveend", () => {
  for (const layer of gridLayers) {
    if (layer.visible) layer.refresh();
  }
});

map.on("zoomend", () => {
  for (const layer of gridLayers) layer.resetResolutionForZoom();
});
