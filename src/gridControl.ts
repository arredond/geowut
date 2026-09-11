import type { GridLayer } from './grids';

export class GridControl {
  readonly root: HTMLElement;

  constructor(container: HTMLElement, layers: GridLayer[]) {
    this.root = document.createElement('div');
    this.root.className = 'grid-control';

    const heading = document.createElement('h3');
    heading.textContent = 'Grid layers';
    this.root.appendChild(heading);

    for (const layer of layers) {
      this.root.appendChild(this.buildRow(layer));
    }

    container.appendChild(this.root);
  }

  private buildRow(layer: GridLayer): HTMLElement {
    const row = document.createElement('label');
    row.className = 'grid-row';
    row.style.setProperty('--grid-color', layer.def.color);

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.addEventListener('change', () => layer.setVisible(checkbox.checked));

    const name = document.createElement('span');
    name.className = 'grid-row-label';
    name.textContent = layer.def.label;

    const resolutionInput = document.createElement('input');
    resolutionInput.type = 'number';
    resolutionInput.className = 'grid-row-resolution';
    resolutionInput.min = String(layer.def.minResolution);
    resolutionInput.max = String(layer.def.maxResolution);
    resolutionInput.value = String(layer.resolution);
    resolutionInput.addEventListener('change', () => {
      layer.setResolution(Number(resolutionInput.value));
      resolutionInput.value = String(layer.resolution);
    });

    // Keep the number input synced whenever the layer's resolution changes elsewhere (e.g. on zoom).
    layer.onResolutionChange = (resolution) => {
      resolutionInput.value = String(resolution);
    };

    row.append(checkbox, name, resolutionInput);
    return row;
  }
}
