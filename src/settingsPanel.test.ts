import './testStorage';
import { beforeEach, describe, expect, it } from 'vitest';
import { SettingsStore } from './settings';
import { SettingsPanel } from './settingsPanel';

describe('SettingsPanel', () => {
  let store: SettingsStore;
  const gear = () => document.querySelector<HTMLButtonElement>('[title="Settings"]')!;
  const popover = () => document.querySelector<HTMLElement>('.settings-popover')!;
  const radio = (name: string, value: string) => document.querySelector<HTMLInputElement>(`input[name="setting-${name}"][value="${value}"]`)!;

  beforeEach(() => {
    localStorage.clear();
    document.body.replaceChildren();
    store = new SettingsStore();
    new SettingsPanel(document.body, store);
  });

  it('opens and closes from the gear', () => {
    expect(popover().hidden).toBe(true);
    gear().click();
    expect(popover().hidden).toBe(false);
    expect(gear().getAttribute('aria-expanded')).toBe('true');
    gear().click();
    expect(popover().hidden).toBe(true);
  });

  it('closes on a click elsewhere or Escape', () => {
    gear().click();
    document.body.click();
    expect(popover().hidden).toBe(true);
    gear().click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(popover().hidden).toBe(true);
  });

  it('shows the current settings', () => {
    expect(radio('units', 'metric').checked).toBe(true);
    expect(radio('theme', 'auto').checked).toBe(true);
    expect(radio('basemap', 'liberty').checked).toBe(true);
  });

  it('offers every OpenFreeMap style', () => {
    const basemaps = [...document.querySelectorAll<HTMLInputElement>('input[name="setting-basemap"]')].map((r) => r.value);
    expect(basemaps).toEqual(['liberty', 'bright', 'positron', 'dark', 'fiord']);
  });

  it('applies a pick straight away, and stays open for the next', () => {
    gear().click();
    radio('units', 'imperial').click();
    radio('basemap', 'fiord').click();
    expect(store.get()).toMatchObject({ units: 'imperial', basemap: 'fiord' });
    expect(popover().hidden).toBe(false);
  });

  it('follows changes made elsewhere', () => {
    store.set({ theme: 'dark' });
    expect(radio('theme', 'dark').checked).toBe(true);
  });
});
