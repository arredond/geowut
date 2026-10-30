import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';
import { createMap } from './map';
import { GridLayer, GRID_DEFINITIONS, gridCellAtPoint, cellCopyValues } from './grids';
import { GridControl } from './gridControl';
import { DrawController, featureGeometry, featureMeasurements, featureProperties } from './draw';
import { FeaturePanel } from './panel';
import { FeaturePopup } from './popup';
import { Toolbar, historyShortcut, isTyping } from './toolbar';
import { AddDataModal } from './addDataModal';
import { geometryBbox } from './geometry';

const app = document.querySelector<HTMLDivElement>('#app')!;
const mapContainer = document.querySelector<HTMLDivElement>('#map')!;

const map = createMap(mapContainer);

const gridLayers = GRID_DEFINITIONS.map((def) => new GridLayer(map, def));

const featurePanel = new FeaturePanel(app, () => ({
  h3: gridLayers.find((l) => l.def.id === 'h3')!.resolution,
  quadkey: gridLayers.find((l) => l.def.id === 'quadkey')!.resolution,
  s2: gridLayers.find((l) => l.def.id === 's2')!.resolution,
}));

const featurePopup = new FeaturePopup(map);

const draw = new DrawController(map, {
  onStateChange: (state) => {
    toolbar.setState(state);
    app.classList.toggle('deleting', state === 'delete');
    if (state !== 'select') featurePopup.hide();
  },
  onHistoryChange: (canUndo, canRedo) => toolbar.setHistory(canUndo, canRedo),
  onFeatureChanged: (feature) => featurePanel.show(featureGeometry(feature)),
  onFeaturesRemoved: () => {
    featurePanel.hide();
    featurePopup.hide();
  },
  onMapClicked: (feature, event) => {
    const hit = gridCellAtPoint(map, gridLayers, event.point);
    if (hit) {
      featurePanel.show(hit.cell.geometry, cellCopyValues(hit));
    } else if (feature) {
      const id = feature.id!;
      featurePanel.show(featureGeometry(feature));
      featurePopup.show({ ...featureMeasurements(feature), ...featureProperties(feature) }, event.lngLat, {
        onEdit: () => draw.edit(id),
        onDelete: () => draw.delete(id),
      });
    } else {
      featurePanel.hide();
    }
  },
});

const toolbar = new Toolbar(app, {
  setState: (state) => draw.setState(state),
  deleteAll: () => draw.deleteAll(),
  undo: () => draw.undo(),
  redo: () => draw.redo(),
});

const addDataModal = new AddDataModal(app, (features) => {
  const { added, rejected } = draw.addFeatures(features);
  if (added.length === 0) return { added: 0, rejected };

  const [west, south, east, north] = geometryBbox({
    type: 'GeometryCollection',
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
});

document.addEventListener('keydown', (e) => {
  const history = historyShortcut(e);
  if (history) {
    e.preventDefault();
    draw[history]();
  } else if (e.key === 'Escape') {
    draw.setState('select');
    featurePopup.hide();
  } else if (e.key === 'Backspace' && !isTyping(e)) {
    featurePopup.deleteFeature();
  }
});

map.on('load', () => {
  for (const layer of gridLayers) layer.addToMap();

  new GridControl(app, gridLayers);

  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';

  const addDataButton = document.createElement('button');
  addDataButton.type = 'button';
  addDataButton.className = 'toolbar-button';
  addDataButton.textContent = 'Add data';
  addDataButton.addEventListener('click', () => addDataModal.show());

  toolbar.appendChild(addDataButton);
  app.appendChild(toolbar);
});

map.on('moveend', () => {
  for (const layer of gridLayers) {
    if (layer.visible) layer.refresh();
  }
});

map.on('zoomend', () => {
  for (const layer of gridLayers) layer.resetResolutionForZoom();
});
