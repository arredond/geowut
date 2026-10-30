import { Popup } from 'maplibre-gl';
import type { LngLat, Map as MapLibreMap } from 'maplibre-gl';
import type { GeoJsonProperties } from 'geojson';
import { ICONS } from './icons';

/** Built from DOM nodes rather than HTML, as properties are arbitrary pasted text. */
export function buildPropertiesTable(properties: GeoJsonProperties): HTMLTableElement | null {
  const entries = Object.entries(properties ?? {});
  if (entries.length === 0) return null;

  const table = document.createElement('table');
  table.className = 'properties-table';
  for (const [key, value] of entries) {
    const row = table.insertRow();
    const name = document.createElement('th');
    name.textContent = key;
    const cell = document.createElement('td');
    cell.textContent = typeof value === 'object' ? JSON.stringify(value) : String(value);
    row.append(name, cell);
  }
  return table;
}

export interface FeatureActions {
  onEdit: () => void;
  onDelete: () => void;
}

function actionButton(iconHtml: string, label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'popup-action';
  button.title = label;
  button.setAttribute('aria-label', label);
  button.innerHTML = iconHtml;
  button.addEventListener('click', onClick);
  return button;
}

export function buildPopupContent(properties: GeoJsonProperties, { onEdit, onDelete }: FeatureActions): HTMLElement {
  const content = document.createElement('div');

  const actions = document.createElement('div');
  actions.className = 'popup-actions';
  const deleteButton = actionButton(ICONS.trash, 'Delete', onDelete);
  deleteButton.classList.add('danger');
  actions.append(actionButton(ICONS.pencil, 'Edit', onEdit), deleteButton);
  content.appendChild(actions);

  const table = buildPropertiesTable(properties);
  if (table) content.appendChild(table);
  return content;
}

export class FeaturePopup {
  private map: MapLibreMap;
  private popup?: Popup;
  private actions?: FeatureActions;

  constructor(map: MapLibreMap) {
    this.map = map;
  }

  show(properties: GeoJsonProperties, lngLat: LngLat, actions: FeatureActions): void {
    this.actions = actions;
    // A new popup each time: the previous one closes itself on the very click that opens this one.
    this.popup = new Popup({ maxWidth: '320px', closeButton: false, className: 'feature-popup' })
      .setLngLat(lngLat)
      .setDOMContent(buildPopupContent(properties, actions))
      .addTo(this.map);
  }

  /** The same as pressing the popup's delete button, if there's a popup open. */
  deleteFeature(): void {
    if (this.popup?.isOpen()) this.actions?.onDelete();
  }

  hide(): void {
    this.popup?.remove();
  }
}
