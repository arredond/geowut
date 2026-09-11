import { wktToGeoJSON } from '@terraformer/wkt';
import type { Geometry } from 'geojson';

export class AddDataModal {
  private root: HTMLElement;
  private textarea: HTMLTextAreaElement;
  private error: HTMLElement;
  private onSubmit: (geometry: Geometry) => void;

  constructor(container: HTMLElement, onSubmit: (geometry: Geometry) => void) {
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
    hint.textContent = 'Paste WKT or GeoJSON geometry below.';
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

  private submit(): void {
    const text = this.textarea.value.trim();
    if (!text) return;

    const geometry = parseGeometry(text);
    if (!geometry) {
      this.error.textContent = 'Could not parse that as WKT or GeoJSON.';
      this.error.hidden = false;
      return;
    }

    this.onSubmit(geometry);
    this.hide();
  }
}

function parseGeometry(text: string): Geometry | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && 'type' in parsed) {
      const geometry = (parsed as { type: string; geometry?: Geometry }).geometry ?? (parsed as Geometry);
      if (geometry && 'type' in geometry) return geometry;
    }
  } catch {
    // Not JSON, fall through to WKT.
  }

  try {
    return wktToGeoJSON(text);
  } catch {
    return null;
  }
}
