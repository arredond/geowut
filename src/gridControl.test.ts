import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GridControl } from './gridControl';
import type { GridLayer } from './grids';

function fakeLayer(id: string): GridLayer {
  const layer = {
    def: { id, label: `${id} cells`, color: '#000', minResolution: 0, maxResolution: 20 },
    visible: false,
    auto: true,
    resolution: 5,
    setVisible: vi.fn((visible: boolean) => {
      layer.visible = visible;
    }),
    setAuto: vi.fn((auto: boolean) => {
      layer.auto = auto;
    }),
    setResolution: vi.fn((resolution: number) => {
      layer.resolution = resolution;
    }),
  };
  return layer as unknown as GridLayer;
}

describe('GridControl', () => {
  let layers: GridLayer[];
  const rows = () => document.querySelector<HTMLElement>('.grid-rows')!;
  const allGrids = () => document.querySelector<HTMLInputElement>('.grid-header input')!;
  const layerToggle = (i: number) => document.querySelectorAll<HTMLInputElement>('.grid-row-label input')[i];
  const autoToggle = (i: number) => document.querySelectorAll<HTMLInputElement>('.grid-row-auto input')[i];
  const resolution = (i: number) => document.querySelectorAll<HTMLInputElement>('.grid-row-resolution')[i];
  const toggle = (input: HTMLInputElement) => input.click();

  beforeEach(() => {
    document.body.replaceChildren();
    layers = [fakeLayer('h3'), fakeLayer('s2')];
    new GridControl(document.body, layers);
  });

  it('starts expanded, with no layers on and auto on', () => {
    expect(rows().hidden).toBe(false);
    expect(allGrids().checked).toBe(true);
    expect(layerToggle(0).checked).toBe(false);
    expect(autoToggle(0).checked).toBe(true);
    expect(resolution(0).disabled).toBe(true);
  });

  it('toggles a single layer', () => {
    toggle(layerToggle(0));
    expect(layers[0].setVisible).toHaveBeenCalledWith(true);
    expect(layers[1].setVisible).not.toHaveBeenCalled();
  });

  describe('top-level toggle', () => {
    it('collapses the card and hides every layer', () => {
      toggle(layerToggle(0));
      toggle(allGrids());
      expect(rows().hidden).toBe(true);
      expect(layers[0].visible).toBe(false);
    });

    it('brings back only the layers that were on', () => {
      toggle(layerToggle(0));
      toggle(allGrids());
      toggle(allGrids());
      expect(rows().hidden).toBe(false);
      expect(layers[0].visible).toBe(true);
      expect(layers[1].visible).toBe(false);
      expect(layerToggle(0).checked).toBe(true);
    });
  });

  describe('auto toggle', () => {
    it('unlocks the resolution when off, locks it when on', () => {
      toggle(autoToggle(0));
      expect(layers[0].setAuto).toHaveBeenLastCalledWith(false);
      expect(resolution(0).disabled).toBe(false);
      expect(resolution(1).disabled).toBe(true);

      toggle(autoToggle(0));
      expect(layers[0].setAuto).toHaveBeenLastCalledWith(true);
      expect(resolution(0).disabled).toBe(true);
    });

    it('is independent of the layer checkbox', () => {
      toggle(autoToggle(0));
      expect(layerToggle(0).checked).toBe(false);
    });
  });

  it('applies typed resolutions, showing the clamped value', () => {
    vi.mocked(layers[0].setResolution).mockImplementation(() => {
      layers[0].resolution = 20;
    });
    resolution(0).value = '99';
    resolution(0).dispatchEvent(new Event('change'));
    expect(layers[0].setResolution).toHaveBeenCalledWith(99);
    expect(resolution(0).value).toBe('20');
  });

  it('follows resolution changes from zooming', () => {
    layers[0].onResolutionChange!(11);
    expect(resolution(0).value).toBe('11');
  });

  it('flags resolutions with too many cells to draw', () => {
    layers[0].onTooManyCellsChange!(true);
    expect(resolution(0).classList.contains('too-many-cells')).toBe(true);
    expect(resolution(0).title).not.toBe('');

    layers[0].onTooManyCellsChange!(false);
    expect(resolution(0).classList.contains('too-many-cells')).toBe(false);
    expect(resolution(0).title).toBe('');
  });
});
