import type { GridLayer } from './grids';

export class GridControl {
  readonly root: HTMLElement;
  private layers: GridLayer[];
  private rows: HTMLElement;
  private allGridsToggle!: HTMLInputElement;
  private layerToggles = new Map<GridLayer, HTMLInputElement>();

  constructor(container: HTMLElement, layers: GridLayer[]) {
    this.root = document.createElement('div');
    this.root.className = 'grid-control';

    this.layers = layers;
    this.root.appendChild(this.buildHeader());

    this.rows = document.createElement('div');
    this.rows.className = 'grid-rows';
    for (const layer of layers) {
      this.rows.appendChild(this.buildRow(layer));
    }
    this.root.appendChild(this.rows);

    container.appendChild(this.root);
  }

  private buildHeader(): HTMLElement {
    const header = document.createElement('label');
    header.className = 'grid-header';

    const heading = document.createElement('h3');
    heading.textContent = 'Grid layers';

    this.allGridsToggle = document.createElement('input');
    this.allGridsToggle.type = 'checkbox';
    this.allGridsToggle.checked = true;
    this.allGridsToggle.addEventListener('change', () => {
      this.rows.hidden = !this.allGridsToggle.checked;
      this.syncVisibility();
    });

    header.append(heading, this.allGridsToggle);
    return header;
  }

  /** Each grid's own checkbox survives the top-level toggle, so switching back on restores the same layers. */
  private syncVisibility(): void {
    for (const layer of this.layers) {
      const visible = this.allGridsToggle.checked && this.layerToggles.get(layer)!.checked;
      if (visible !== layer.visible) layer.setVisible(visible);
    }
  }

  private buildRow(layer: GridLayer): HTMLElement {
    const row = document.createElement('div');
    row.className = 'grid-row';
    row.style.setProperty('--grid-color', layer.def.color);

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.addEventListener('change', () => this.syncVisibility());
    this.layerToggles.set(layer, checkbox);

    const name = document.createElement('label');
    name.className = 'grid-row-label';
    name.append(checkbox, layer.def.label);

    const resolutionInput = document.createElement('input');
    resolutionInput.type = 'number';
    resolutionInput.className = 'grid-row-resolution';
    resolutionInput.min = String(layer.def.minResolution);
    resolutionInput.max = String(layer.def.maxResolution);
    resolutionInput.value = String(layer.resolution);
    resolutionInput.disabled = layer.auto;
    resolutionInput.addEventListener('change', () => {
      layer.setResolution(Number(resolutionInput.value));
      resolutionInput.value = String(layer.resolution);
    });

    // Keep the number input synced whenever the layer's resolution changes elsewhere (e.g. on zoom).
    layer.onResolutionChange = (resolution) => {
      resolutionInput.value = String(resolution);
    };

    layer.onTooManyCellsChange = (tooManyCells) => {
      resolutionInput.classList.toggle('too-many-cells', tooManyCells);
      resolutionInput.title = tooManyCells ? 'Too many cells to draw here: lower the resolution or zoom in' : '';
    };

    const autoToggle = document.createElement('input');
    autoToggle.type = 'checkbox';
    autoToggle.checked = layer.auto;
    autoToggle.addEventListener('change', () => {
      resolutionInput.disabled = autoToggle.checked;
      layer.setAuto(autoToggle.checked);
    });

    const autoLabel = document.createElement('label');
    autoLabel.className = 'grid-row-auto';
    autoLabel.title = 'Pick the resolution from the map zoom';
    autoLabel.append(autoToggle, 'Auto');

    row.append(name, autoLabel, resolutionInput);
    return row;
  }
}
