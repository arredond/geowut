import { geojsonToWKT } from '@terraformer/wkt';
import type { Geometry } from 'geojson';
import { geometryBbox, geometryCenter, bboxToString } from './geometry';
import { h3Coverage, quadkeyCoverage, s2Coverage, TooManyCellsError } from './coverage';
import { copyText } from './clipboard';

export interface Resolutions {
  h3: number;
  quadkey: number;
  s2: number;
}

interface CopyItem {
  label: string;
  /** Computed on click: serializing or covering a big geometry can take a while. */
  value: () => string;
}

export class FeaturePanel {
  private root: HTMLElement;
  private getResolutions: () => Resolutions;

  constructor(container: HTMLElement, getResolutions: () => Resolutions) {
    this.getResolutions = getResolutions;
    this.root = document.createElement('div');
    this.root.className = 'feature-panel';
    this.root.hidden = true;
    container.appendChild(this.root);
  }

  show(geometry: Geometry, extraValues: { label: string; value: string }[] = []): void {
    const resolutions = this.getResolutions();
    const [centerLng, centerLat] = geometryCenter(geometry);

    const items: CopyItem[] = [
      ...extraValues.map(({ label, value }) => ({ label, value: () => value })),
      { label: 'GeoJSON', value: () => JSON.stringify(geometry) },
      { label: 'Well Known Text (WKT)', value: () => geojsonToWKT(geometry) },
      { label: 'Bounding Box', value: () => bboxToString(geometryBbox(geometry)) },
      { label: 'Center (lng/lat)', value: () => `${centerLng},${centerLat}` },
      { label: 'Center (lat/lng)', value: () => `${centerLat},${centerLng}` },
    ];

    if (geometry.type === 'Point') {
      items.push(
        { label: 'Lng/Lat', value: () => `${centerLng},${centerLat}` },
        { label: 'Lat/Lng', value: () => `${centerLat},${centerLng}` },
      );
    }

    items.push(
      { label: `H3 covering (res ${resolutions.h3})`, value: () => h3Coverage(geometry, resolutions.h3).join(',') },
      {
        label: `Quadkey covering (zoom ${resolutions.quadkey})`,
        value: () => quadkeyCoverage(geometry, resolutions.quadkey).join(','),
      },
      { label: `S2 covering (level ${resolutions.s2})`, value: () => s2Coverage(geometry, resolutions.s2).join(',') },
    );

    this.render(items);
    this.root.hidden = false;
  }

  hide(): void {
    this.root.hidden = true;
  }

  private render(items: CopyItem[]): void {
    this.root.replaceChildren();

    const heading = document.createElement('h2');
    heading.textContent = 'Copy to clipboard';
    this.root.appendChild(heading);

    const closeButton = document.createElement('button');
    closeButton.className = 'panel-close';
    closeButton.textContent = '×';
    closeButton.setAttribute('aria-label', 'Close');
    closeButton.addEventListener('click', () => this.hide());
    this.root.appendChild(closeButton);

    const list = document.createElement('div');
    list.className = 'button-holder';
    for (const item of items) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'copy-button';
      button.textContent = item.label;
      button.addEventListener('click', async () => {
        button.textContent = await copyItem(item);
        setTimeout(() => {
          button.textContent = item.label;
        }, 1200);
      });
      list.appendChild(button);
    }
    this.root.appendChild(list);
  }
}

async function copyItem(item: CopyItem): Promise<string> {
  try {
    return (await copyText(item.value())) ? 'Copied!' : 'Failed to copy';
  } catch (error) {
    return error instanceof TooManyCellsError ? 'Too many cells: lower the resolution' : 'Failed to copy';
  }
}
