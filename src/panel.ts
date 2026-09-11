import { geojsonToWKT } from '@terraformer/wkt';
import type { GeoJSONStoreFeatures } from 'terra-draw';
import { geometryBbox, geometryCenter, bboxToString } from './geometry';
import { h3Coverage, quadkeyCoverage, s2Coverage } from './coverage';
import { copyText } from './clipboard';

export interface Resolutions {
  h3: number;
  quadkey: number;
  s2: number;
}

interface CopyItem {
  label: string;
  value: string;
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

  show(feature: GeoJSONStoreFeatures): void {
    const geometry = feature.geometry;
    const resolutions = this.getResolutions();
    const geojsonString = JSON.stringify(geometry);
    const [centerLng, centerLat] = geometryCenter(geometry);

    const items: CopyItem[] = [
      { label: 'GeoJSON', value: geojsonString },
      { label: 'Well Known Text (WKT)', value: geojsonToWKT(geometry) },
      { label: 'Bounding Box', value: bboxToString(geometryBbox(geometry)) },
      { label: 'Center (lng/lat)', value: `${centerLng},${centerLat}` },
      { label: 'Center (lat/lng)', value: `${centerLat},${centerLng}` },
    ];

    if (geometry.type === 'Point') {
      items.push({ label: 'Lng/Lat', value: `${centerLng},${centerLat}` }, { label: 'Lat/Lng', value: `${centerLat},${centerLng}` });
    }

    items.push(
      { label: `H3 covering (res ${resolutions.h3})`, value: h3Coverage(geometry, resolutions.h3).join(',') },
      {
        label: `Quadkey covering (zoom ${resolutions.quadkey})`,
        value: quadkeyCoverage(geometry, resolutions.quadkey).join(','),
      },
      { label: `S2 covering (level ${resolutions.s2})`, value: s2Coverage(geometry, resolutions.s2).join(',') },
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
        const ok = await copyText(item.value);
        const original = button.textContent;
        button.textContent = ok ? 'Copied!' : 'Failed to copy';
        setTimeout(() => {
          button.textContent = original;
        }, 1200);
      });
      list.appendChild(button);
    }
    this.root.appendChild(list);
  }
}
