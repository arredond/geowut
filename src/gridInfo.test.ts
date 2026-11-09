import { beforeEach, describe, expect, it } from 'vitest';
import { GridInfoModal } from './gridInfo';
import { GRID_DEFINITIONS } from './grids';
import type { GridLayer } from './grids';
import type { Units } from './units';

describe('GridInfoModal', () => {
  let units: Units;
  let layers: GridLayer[];
  let modal: GridInfoModal;
  const overlay = () => document.querySelector<HTMLElement>('.modal-overlay')!;
  const tab = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((t) => t.textContent === label)!;
  const rows = () => [...document.querySelectorAll('.grid-info-table tbody tr')];
  const cells = (row: Element) => [...row.children].map((cell) => cell.textContent);

  beforeEach(() => {
    document.body.replaceChildren();
    units = 'metric';
    layers = GRID_DEFINITIONS.map((def) => ({ def, resolution: 9, visible: false }) as unknown as GridLayer);
    modal = new GridInfoModal(document.body, layers, () => units);
  });

  it('starts closed, and opens on H3', () => {
    expect(overlay().hidden).toBe(true);
    modal.show();
    expect(overlay().hidden).toBe(false);
    expect(tab('H3 cells').getAttribute('aria-selected')).toBe('true');
    expect(document.querySelector('.grid-info-table th')!.textContent).toBe('Resolution');
  });

  it('lists every level of the grid with its area and edge length', () => {
    modal.show();
    expect(rows()).toHaveLength(16);
    expect(cells(rows()[9])).toEqual(['9', '10.5 ha', '201 m']);
  });

  it('switches grids with the tabs', () => {
    modal.show();
    tab('S2 cells').click();
    expect(tab('S2 cells').getAttribute('aria-selected')).toBe('true');
    expect(cells(rows()[0])[0]).toBe('1');
    expect(rows()).toHaveLength(24);
    expect(document.querySelector('.grid-info-note')!.textContent).toMatch(/Averages/);
  });

  it('marks the level on the map, if the grid is drawn', () => {
    modal.show();
    expect(document.querySelector('tr.current')).toBeNull();
    layers[0].visible = true;
    modal.show();
    expect(cells(document.querySelector('tr.current')!)[0]).toBe('9');
  });

  it('switches units in place', () => {
    modal.show();
    units = 'imperial';
    modal.refresh();
    expect(cells(rows()[9])).toEqual(['9', '26 ac', '0.12 mi']);
  });

  it('closes with Escape or a click outside', () => {
    modal.show();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(overlay().hidden).toBe(true);
    modal.show();
    overlay().click();
    expect(overlay().hidden).toBe(true);
  });
});
