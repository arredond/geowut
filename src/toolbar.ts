import { TOOLS } from './draw';
import type { DrawState, Tool } from './draw';
import { ICONS } from './icons';

export interface ToolbarActions {
  setState: (state: DrawState) => void;
  deleteAll: () => void;
  undo: () => void;
  redo: () => void;
}

const TOOL_LABELS: Record<Tool, string> = {
  point: 'Draw a point',
  linestring: 'Draw a line',
  polygon: 'Draw a polygon',
  rectangle: 'Draw a rectangle',
  circle: 'Draw a circle',
  freehand: 'Draw freehand',
};

function iconButton(iconHtml: string, label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'draw-tool';
  button.title = label;
  button.setAttribute('aria-label', label);
  button.innerHTML = iconHtml;
  button.addEventListener('click', onClick);
  return button;
}

export function isTyping(event: KeyboardEvent): boolean {
  return event.target instanceof Element && event.target.matches('textarea, input:not([type="checkbox"])');
}

/** Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z, unless they'd be undoing typing instead. */
export function historyShortcut(event: KeyboardEvent): 'undo' | 'redo' | null {
  if (isTyping(event) || !(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== 'z') return null;
  return event.shiftKey ? 'redo' : 'undo';
}

export class Toolbar {
  private state: DrawState = 'select';
  private buttons = new Map<DrawState, HTMLButtonElement>();
  private deleteChips: HTMLElement;
  private undoButton: HTMLButtonElement;
  private redoButton: HTMLButtonElement;

  constructor(container: HTMLElement, actions: ToolbarActions) {
    const root = document.createElement('div');
    root.className = 'draw-toolbar';

    // Clicking the active tool leaves it.
    const toggle = (state: DrawState) => () => actions.setState(this.state === state ? 'select' : state);

    for (const tool of TOOLS) {
      const button = iconButton(ICONS[tool], TOOL_LABELS[tool], toggle(tool));
      this.buttons.set(tool, button);
      root.appendChild(button);
    }

    const trash = iconButton(ICONS.trash, 'Delete features', toggle('delete'));
    this.buttons.set('delete', trash);

    const allChip = document.createElement('button');
    allChip.type = 'button';
    allChip.className = 'draw-chip';
    allChip.textContent = 'All';
    allChip.title = 'Delete every feature';
    allChip.addEventListener('click', actions.deleteAll);

    const closeChip = iconButton(ICONS.close, 'Stop deleting', () => actions.setState('select'));
    closeChip.className = 'draw-chip';

    this.deleteChips = document.createElement('div');
    this.deleteChips.className = 'draw-chips';
    this.deleteChips.hidden = true;
    this.deleteChips.append(allChip, closeChip);

    const trashRow = document.createElement('div');
    trashRow.className = 'draw-tool-row';
    trashRow.append(trash, this.deleteChips);
    root.appendChild(trashRow);

    this.undoButton = iconButton(ICONS.undo, 'Undo', actions.undo);
    this.redoButton = iconButton(ICONS.redo, 'Redo', actions.redo);
    this.undoButton.disabled = true;
    this.redoButton.disabled = true;
    root.append(this.undoButton, this.redoButton);

    container.appendChild(root);
  }

  setState(state: DrawState): void {
    this.state = state;
    for (const [buttonState, button] of this.buttons) {
      button.classList.toggle('active', buttonState === state);
    }
    this.deleteChips.hidden = state !== 'delete';
  }

  setHistory(canUndo: boolean, canRedo: boolean): void {
    this.undoButton.disabled = !canUndo;
    this.redoButton.disabled = !canRedo;
  }
}
