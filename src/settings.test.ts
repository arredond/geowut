import './testStorage';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyTheme, DEFAULT_SETTINGS, SettingsStore } from './settings';

describe('SettingsStore', () => {
  beforeEach(() => localStorage.clear());

  it('defaults to metric, the system theme and Liberty', () => {
    expect(new SettingsStore().get()).toEqual({ units: 'metric', theme: 'auto', basemap: 'liberty' });
  });

  it('remembers changes across page loads', () => {
    new SettingsStore().set({ units: 'imperial', basemap: 'dark' });
    expect(new SettingsStore().get()).toEqual({ ...DEFAULT_SETTINGS, units: 'imperial', basemap: 'dark' });
  });

  it('drops saved values that are no longer valid', () => {
    localStorage.setItem('geowut:settings', JSON.stringify({ units: 'furlongs', theme: 'dark', basemap: 'voyager' }));
    expect(new SettingsStore().get()).toEqual({ ...DEFAULT_SETTINGS, theme: 'dark' });
  });

  it('survives garbled storage', () => {
    localStorage.setItem('geowut:settings', '{nope');
    expect(new SettingsStore().get()).toEqual(DEFAULT_SETTINGS);
  });

  it('tells listeners what changed, and nothing when nothing did', () => {
    const store = new SettingsStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.set({ units: 'metric' });
    expect(listener).not.toHaveBeenCalled();
    store.set({ units: 'imperial', theme: 'auto' });
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ units: 'imperial' }), ['units']);
  });
});

describe('applyTheme', () => {
  it('forces light or dark, and leaves auto to the system', () => {
    const root = document.createElement('html');
    applyTheme('dark', root);
    expect(root.dataset.theme).toBe('dark');
    applyTheme('auto', root);
    expect(root.dataset.theme).toBeUndefined();
  });
});
