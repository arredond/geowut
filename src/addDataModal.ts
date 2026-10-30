import { wktToGeoJSON } from '@terraformer/wkt';
import type { Feature, GeoJSON, Geometry } from 'geojson';

export interface AddResult {
  added: number;
  rejected: number;
}

export class AddDataModal {
  private root: HTMLElement;
  private textarea: HTMLTextAreaElement;
  private error: HTMLElement;
  private onSubmit: (features: Feature[]) => AddResult;

  constructor(container: HTMLElement, onSubmit: (features: Feature[]) => AddResult) {
    this.onSubmit = onSubmit;

    this.root = document.createElement('div');
    this.root.className = 'modal-overlay';
    this.root.hidden = true;
    this.root.addEventListener('click', (e) => {
      if (e.target === this.root) this.hide();
    });

    const dialog = document.createElement('div');
    dialog.className = 'modal';

    const heading = document.createElement('h2');
    heading.textContent = 'Add data';
    dialog.appendChild(heading);

    const hint = document.createElement('p');
    hint.textContent = 'Paste WKT or GeoJSON below.';
    dialog.appendChild(hint);

    this.textarea = document.createElement('textarea');
    this.textarea.rows = 8;
    this.textarea.placeholder = 'POINT (-3 40)  or  {"type":"Point","coordinates":[-3,40]}';
    dialog.appendChild(this.textarea);

    this.error = document.createElement('p');
    this.error.className = 'modal-error';
    this.error.hidden = true;
    dialog.appendChild(this.error);

    const actions = document.createElement('div');
    actions.className = 'modal-actions';

    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.textContent = 'Cancel';
    cancelButton.addEventListener('click', () => this.hide());

    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.className = 'primary';
    addButton.textContent = 'Add';
    addButton.addEventListener('click', () => this.submit());

    actions.append(cancelButton, addButton);
    dialog.appendChild(actions);

    this.root.appendChild(dialog);
    container.appendChild(this.root);
  }

  show(): void {
    this.textarea.value = '';
    this.error.hidden = true;
    this.root.hidden = false;
    this.textarea.focus();
  }

  hide(): void {
    this.root.hidden = true;
  }

  private showError(message: string): void {
    this.error.textContent = message;
    this.error.hidden = false;
  }

  private submit(): void {
    const text = this.textarea.value.trim();
    if (!text) return;

    const features = parseFeatures(text);
    const { added, rejected } = features.length > 0 ? this.onSubmit(features) : { added: 0, rejected: 0 };
    if (added === 0) {
      this.showError('Could not parse that as WKT or GeoJSON.');
    } else if (rejected > 0) {
      this.textarea.value = '';
      this.showError(`Skipped ${rejected} of ${features.length} features with invalid geometry.`);
    } else {
      this.hide();
    }
  }
}

export function parseFeatures(text: string): Feature[] {
  try {
    return geoJsonToFeatures(JSON.parse(text));
  } catch {
    // Not JSON, fall through to WKT.
  }

  try {
    return [toFeature(wktToGeoJSON(text))];
  } catch {
    return [];
  }
}

function geoJsonToFeatures(geojson: GeoJSON): Feature[] {
  switch (geojson.type) {
    case 'FeatureCollection':
      return geojson.features.filter((feature) => feature.geometry);
    case 'Feature':
      return geojson.geometry ? [geojson] : [];
    default:
      return 'coordinates' in Object(geojson) || 'geometries' in Object(geojson) ? [toFeature(geojson)] : [];
  }
}

function toFeature(geometry: Geometry): Feature {
  return { type: 'Feature', geometry, properties: null };
}
