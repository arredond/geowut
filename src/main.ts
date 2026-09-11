import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';
import { createMap } from './map';
import { GridLayer, GRID_DEFINITIONS } from './grids';
import { GridControl } from './gridControl';
import { setupDraw, addGeometryToDraw } from './draw';
import { FeaturePanel } from './panel';
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

const drawControl = setupDraw(map, {
  onFeatureSelected: (feature) => featurePanel.show(feature),
  onFeatureDeselected: () => featurePanel.hide(),
  onFeatureDeleted: () => featurePanel.hide(),
});

const addDataModal = new AddDataModal(app, (geometry) => {
  addGeometryToDraw(drawControl, geometry);
  const [west, south, east, north] = geometryBbox(geometry);
  map.fitBounds(
    [
      [west, south],
      [east, north],
    ],
    { padding: 60, maxZoom: 16 },
  );
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
