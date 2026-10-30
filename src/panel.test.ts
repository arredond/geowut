import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Geometry } from 'geojson';
import { FeaturePanel } from './panel';
import { copyText } from './clipboard';
import * as coverage from './coverage';

vi.mock('./clipboard', () => ({ copyText: vi.fn(async () => true) }));

const polygon: Geometry = { type: 'Polygon', coordinates: [[[0, 0], [2, 0], [2, 2], [0, 0]]] };
const point: Geometry = { type: 'Point', coordinates: [1, 2] };

describe('FeaturePanel', () => {
  let panel: FeaturePanel;
  const root = () => document.querySelector<HTMLElement>('.feature-panel')!;
  const labels = () => [...document.querySelectorAll('.copy-button')].map((b) => b.textContent);
  const button = (text: string) => [...document.querySelectorAll<HTMLButtonElement>('.copy-button')].find((b) => b.textContent!.startsWith(text))!;
  const copied = async (text: string) => {
    button(text).click();
    await vi.waitFor(() => expect(copyText).toHaveBeenCalled());
    return vi.mocked(copyText).mock.lastCall![0];
  };

  beforeEach(() => {
    vi.clearAllMocks();
    document.body.replaceChildren();
    panel = new FeaturePanel(document.body, () => ({ h3: 5, quadkey: 8, s2: 9 }));
  });

  it('starts hidden and shows every format for a polygon', () => {
    expect(root().hidden).toBe(true);
    panel.show(polygon);
    expect(root().hidden).toBe(false);
    expect(labels()).toEqual([
      'GeoJSON',
      'Well Known Text (WKT)',
      'Bounding Box',
      'Center (lng/lat)',
      'Center (lat/lng)',
      'H3 covering (res 5)',
      'Quadkey covering (zoom 8)',
      'S2 covering (level 9)',
    ]);
  });

  it('adds raw coordinates for points only', () => {
    panel.show(point);
    expect(labels()).toContain('Lng/Lat');
    expect(labels()).toContain('Lat/Lng');
  });

  it('puts extra values first, as for grid cells', () => {
    panel.show(polygon, [{ label: 'Quadkey', value: '0123' }]);
    expect(labels()[0]).toBe('Quadkey');
  });

  it('copies extra values', async () => {
    panel.show(polygon, [{ label: 'Quadkey', value: '0123' }]);
    expect(await copied('Quadkey')).toBe('0123');
  });

  it('copies the geometry in each format', async () => {
    panel.show(polygon);
    expect(await copied('GeoJSON')).toBe(JSON.stringify(polygon));
    expect(await copied('Well Known')).toBe('POLYGON ((0 0, 2 0, 2 2, 0 0))');
    expect(await copied('Bounding')).toBe('0,0,2,2');
    expect(await copied('Center (lng')).toBe('1,1');
  });

  it('flips the center for lat/lng', async () => {
    panel.show(point);
    expect(await copied('Center (lat')).toBe('2,1');
  });

  it('computes coverings on click, not on show', async () => {
    const h3Coverage = vi.spyOn(coverage, 'h3Coverage');
    panel.show(polygon);
    expect(h3Coverage).not.toHaveBeenCalled();
    await copied('H3');
    expect(h3Coverage).toHaveBeenCalledWith(polygon, 5);
  });

  it('opens instantly for geometry too big to cover, and explains on click', async () => {
    const huge: Geometry = { type: 'Polygon', coordinates: [[[-10, 35], [5, 35], [5, 45], [-10, 35]]] };
    panel = new FeaturePanel(document.body, () => ({ h3: 15, quadkey: 23, s2: 24 }));
    panel.show(huge);

    button('S2').click();

    await vi.waitFor(() => expect(button('Too many cells')).toBeDefined());
    expect(copyText).not.toHaveBeenCalled();
  });

  it('reports clipboard failures and restores the label', async () => {
    vi.useFakeTimers();
    vi.mocked(copyText).mockResolvedValueOnce(false);
    panel.show(polygon);
    const copy = button('GeoJSON');

    copy.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(copy.textContent).toBe('Failed to copy');

    await vi.advanceTimersByTimeAsync(1200);
    expect(copy.textContent).toBe('GeoJSON');
    vi.useRealTimers();
  });

  it('restores the label after a double click', async () => {
    vi.useFakeTimers();
    panel.show(polygon);
    const copy = button('GeoJSON');

    copy.click();
    await vi.advanceTimersByTimeAsync(10);
    copy.click();
    await vi.advanceTimersByTimeAsync(2000);

    expect(copy.textContent).toBe('GeoJSON');
    vi.useRealTimers();
  });

  it('closes with the close button', () => {
    panel.show(polygon);
    document.querySelector<HTMLElement>('.panel-close')!.click();
    expect(root().hidden).toBe(true);
  });
});
