import { geojsonToWKT } from '@terraformer/wkt';
import type { Geometry } from 'geojson';
import { geometryBbox, geometryCenter, bboxToString } from './geometry';
import { h3Coverage, quadkeyCoverage, s2Coverage, TooManyCellsError } from './coverage';
import { copyText } from './clipboard';
import { ICONS } from './icons';
import type { Units } from './units';

export interface Resolutions {
  h3: number;
  quadkey: number;
  s2: number;
}

export interface DetailRow {
  label: string;
  value: string;
}

/** Coverings past this many cells are too many to draw. */
export const MAX_PREVIEW_CELLS = 10_000;

export type Grid = keyof Resolutions;

export interface PanelContent {
  /** Same key, same thing shown: as a feature is edited, its covering previews stay on and follow it. */
  key?: string;
  /** What's known about the feature or cell, in the units of the moment. Each one copies on its own. */
  details?: (units: Units) => DetailRow[];
  /** A grid cell: its covering in its own grid, at its own level, would just be itself. */
  cell?: { grid: Grid; level: number };
}

interface CopyItem {
  label: string;
  /** Computed on click: serializing or covering a big geometry can take a while. */
  value: () => string;
}

interface Covering extends CopyItem {
  grid: Grid;
  cells: () => string[];
}

/** How long a copy's outcome shows before the button goes back to normal. */
const FEEDBACK_MS = 1200;
const feedbackTimers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

/** Copy, then say how it went on the button itself: a check, or why it failed. */
async function copyWithFeedback(button: HTMLElement, value: () => string): Promise<void> {
  let message: string;
  try {
    message = (await copyText(value())) ? '' : 'Failed to copy';
  } catch (error) {
    message = error instanceof TooManyCellsError ? 'Too many cells: lower the resolution' : 'Failed to copy';
  }

  button.dataset.state = message ? 'failed' : 'copied';
  button.querySelector('.copy-status')!.textContent = message || 'Copied';
  button.querySelector('.copy-icon')!.innerHTML = message ? '' : ICONS.check;

  clearTimeout(feedbackTimers.get(button));
  feedbackTimers.set(
    button,
    setTimeout(() => {
      delete button.dataset.state;
      button.querySelector('.copy-status')!.textContent = '';
      button.querySelector('.copy-icon')!.innerHTML = ICONS.copy;
    }, FEEDBACK_MS),
  );
}

function feedbackParts(): [HTMLElement, HTMLElement] {
  const status = document.createElement('span');
  status.className = 'copy-status';
  status.setAttribute('aria-live', 'polite');
  const icon = document.createElement('span');
  icon.className = 'copy-icon';
  icon.innerHTML = ICONS.copy;
  return [status, icon];
}

/** Built from DOM nodes rather than HTML, as pasted properties are arbitrary text. */
export function buildDetailsTable(rows: DetailRow[]): HTMLTableElement | null {
  if (rows.length === 0) return null;
  const table = document.createElement('table');
  table.className = 'details-table';
  for (const { label, value } of rows) {
    const row = table.insertRow();
    const name = document.createElement('th');
    name.textContent = label;
    row.append(name);
    row.insertCell().textContent = value;

    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'copy-value';
    copy.title = `Copy ${label}`;
    copy.setAttribute('aria-label', `Copy ${label}`);
    copy.append(...feedbackParts());
    copy.addEventListener('click', () => copyWithFeedback(copy, () => value));
    row.insertCell().appendChild(copy);
  }
  return table;
}

/** Rows of copy buttons, each with room for an extra control at its end. */
function buildCopyList<T extends CopyItem>(items: T[], extra?: (item: T, copyButton: HTMLButtonElement) => HTMLElement): HTMLElement {
  const list = document.createElement('div');
  list.className = 'copy-list';
  for (const item of items) {
    const row = document.createElement('div');
    row.className = 'copy-row';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'copy-button';
    const label = document.createElement('span');
    label.className = 'copy-label';
    label.textContent = item.label;
    button.append(label, ...feedbackParts());
    button.addEventListener('click', () => copyWithFeedback(button, item.value));
    row.appendChild(button);
    if (extra) row.appendChild(extra(item, button));
    list.appendChild(row);
  }
  return list;
}

/** Say why on the row's own copy button, as a failed copy would. */
function showFailure(button: HTMLElement, message: string): void {
  button.dataset.state = 'failed';
  button.querySelector('.copy-status')!.textContent = message;
  button.querySelector('.copy-icon')!.innerHTML = '';
  clearTimeout(feedbackTimers.get(button));
  feedbackTimers.set(
    button,
    setTimeout(() => {
      delete button.dataset.state;
      button.querySelector('.copy-status')!.textContent = '';
      button.querySelector('.copy-icon')!.innerHTML = ICONS.copy;
    }, FEEDBACK_MS * 2),
  );
}

function section(title: string, ...content: HTMLElement[]): HTMLElement {
  const wrapper = document.createElement('section');
  wrapper.className = 'panel-section';
  const heading = document.createElement('h2');
  heading.textContent = title;
  wrapper.append(heading, ...content);
  return wrapper;
}

/** A covering's cells, or why they can't be drawn. */
function previewableCells(covering: Covering): string[] | string {
  try {
    const cells = covering.cells();
    return cells.length > MAX_PREVIEW_CELLS ? 'Too many cells to show' : cells;
  } catch (error) {
    if (error instanceof TooManyCellsError) return 'Too many cells to show';
    throw error;
  }
}

export class FeaturePanel {
  private root: HTMLElement;
  private getResolutions: () => Resolutions;
  private getUnits: () => Units;
  private shown?: [Geometry, PanelContent];
  private onPreview: (cells: Partial<Record<Grid, string[]>>) => void;
  /** Coverings toggled on, which stay on as the levels change... */
  private wanted = new Set<Grid>();
  /** ...those of them drawn on the map, with their cells... */
  private previews = new Map<Grid, string[]>();
  /** ...and those too big to draw at the current level, with why. */
  private unavailable = new Map<Grid, string>();

  constructor(
    container: HTMLElement,
    getResolutions: () => Resolutions,
    getUnits: () => Units = () => 'metric',
    onPreview: (cells: Partial<Record<Grid, string[]>>) => void = () => {},
  ) {
    this.getResolutions = getResolutions;
    this.getUnits = getUnits;
    this.onPreview = onPreview;
    this.root = document.createElement('div');
    this.root.className = 'feature-panel';
    this.root.hidden = true;
    container.appendChild(this.root);
  }

  show(geometry: Geometry, content: PanelContent = {}): void {
    const sameSubject = content.key !== undefined && content.key === this.shown?.[1].key && !this.root.hidden;
    this.shown = [geometry, content];
    const [centerLng, centerLat] = geometryCenter(geometry);

    const formats: CopyItem[] = [
      { label: 'GeoJSON', value: () => JSON.stringify(geometry) },
      { label: 'Well Known Text (WKT)', value: () => geojsonToWKT(geometry) },
      { label: 'Bounding box', value: () => bboxToString(geometryBbox(geometry)) },
    ];
    // A point is its own center.
    if (geometry.type === 'Point') {
      formats.push(
        { label: 'Lng/Lat', value: () => `${centerLng},${centerLat}` },
        { label: 'Lat/Lng', value: () => `${centerLat},${centerLng}` },
      );
    } else {
      formats.push(
        { label: 'Center (lng/lat)', value: () => `${centerLng},${centerLat}` },
        { label: 'Center (lat/lng)', value: () => `${centerLat},${centerLng}` },
      );
    }

    if (!sameSubject) this.wanted.clear();
    const coverings = this.coverings(geometry, content.cell);
    this.updatePreviews(coverings.filter((c) => this.wanted.has(c.grid)));
    this.render(content.details?.(this.getUnits()) ?? [], formats, coverings);
    this.root.hidden = false;
  }

  /** Show the same again, as after a change of units or grid levels: previews on stay on, at the new levels. */
  refresh(): void {
    if (!this.root.hidden && this.shown) this.show(...this.shown);
  }

  hide(): void {
    this.root.hidden = true;
    this.wanted.clear();
    this.updatePreviews([]);
  }

  private coverings(geometry: Geometry, cell: PanelContent['cell']): Covering[] {
    const resolutions = this.getResolutions();
    const covering = (grid: Grid, label: string, cover: (geometry: Geometry, resolution: number) => string[]): Covering => {
      const cells = () => cover(geometry, resolutions[grid]);
      return { grid, label, cells, value: () => cells().join(',') };
    };
    const coverings = [
      covering('h3', `H3 (res ${resolutions.h3})`, h3Coverage),
      covering('quadkey', `Quadkey (zoom ${resolutions.quadkey})`, quadkeyCoverage),
      covering('s2', `S2 (level ${resolutions.s2})`, s2Coverage),
    ];
    return coverings.filter(({ grid }) => !(cell?.grid === grid && cell.level === resolutions[grid]));
  }

  /** Draw exactly these coverings, recomputed for the geometry and levels now shown, except any that grew too big. */
  private updatePreviews(coverings: Covering[]): void {
    this.previews.clear();
    this.unavailable.clear();
    for (const covering of coverings) {
      const cells = previewableCells(covering);
      if (typeof cells === 'string') this.unavailable.set(covering.grid, cells);
      else this.previews.set(covering.grid, cells);
    }
    this.onPreview(Object.fromEntries(this.previews));
  }

  private previewToggle(covering: Covering, copyButton: HTMLButtonElement): HTMLElement {
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'preview-toggle';
    const sync = () => {
      const on = this.wanted.has(covering.grid);
      const unavailable = this.unavailable.get(covering.grid);
      toggle.setAttribute('aria-pressed', String(on));
      toggle.classList.toggle('unavailable', Boolean(unavailable));
      toggle.title = unavailable ? `${unavailable} at this level` : on ? 'Hide on map' : 'Show on map';
      toggle.setAttribute('aria-label', `${on ? 'Hide on map' : 'Show on map'}: ${covering.label}`);
      toggle.innerHTML = on ? ICONS.eye : ICONS.eyeOff;
    };
    toggle.addEventListener('click', () => {
      if (this.wanted.has(covering.grid)) {
        this.wanted.delete(covering.grid);
        this.previews.delete(covering.grid);
        this.unavailable.delete(covering.grid);
      } else {
        const cells = previewableCells(covering);
        if (typeof cells === 'string') return showFailure(copyButton, cells);
        this.wanted.add(covering.grid);
        this.previews.set(covering.grid, cells);
      }
      this.onPreview(Object.fromEntries(this.previews));
      sync();
    });
    sync();
    return toggle;
  }

  private render(details: DetailRow[], formats: CopyItem[], coverings: Covering[]): void {
    this.root.replaceChildren();

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'icon-button panel-close';
    closeButton.title = 'Close';
    closeButton.setAttribute('aria-label', 'Close');
    closeButton.innerHTML = ICONS.close;
    closeButton.addEventListener('click', () => this.hide());
    this.root.appendChild(closeButton);

    const table = buildDetailsTable(details);
    if (table) this.root.appendChild(section('Properties', table));
    this.root.appendChild(section('Copy as', buildCopyList(formats)));
    if (coverings.length > 0) {
      this.root.appendChild(section('Coverings', buildCopyList(coverings, (covering, button) => this.previewToggle(covering, button))));
    }
  }
}
