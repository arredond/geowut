import { TOOLS } from "./draw";
import type { DrawState, Tool } from "./draw";
import { ICONS } from "./icons";
import { formatMeasurement, MEASURE_TOOLS } from "./measure";
import type { Measurement, MeasureTool } from "./measure";
import type { Units } from "./units";

export interface ToolbarActions {
  setState: (state: DrawState) => void;
  deleteAll: () => void;
  undo: () => void;
  redo: () => void;
}

const TOOL_LABELS: Record<Tool, string> = {
  point: "Draw a point",
  linestring: "Draw a line",
  polygon: "Draw a polygon",
  rectangle: "Draw a rectangle",
  circle: "Draw a circle",
  freehand: "Draw freehand",
};

const MEASURE_LABELS: Record<MeasureTool, string> = {
  "measure-line": "Measure distance",
  "measure-area": "Measure area",
};

const MEASURE_HINTS: Record<MeasureTool, string> = {
  "measure-line": "Click to start a line",
  "measure-area": "Click to start an area",
};

function iconButton(
  iconHtml: string,
  label: string,
  onClick: () => void,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "draw-tool";
  button.title = label;
  button.setAttribute("aria-label", label);
  button.innerHTML = iconHtml;
  button.addEventListener("click", onClick);
  return button;
}

export function isTyping(event: KeyboardEvent): boolean {
  return (
    event.target instanceof Element &&
    event.target.matches('textarea, input:not([type="checkbox"])')
  );
}

/** Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z, unless they'd be undoing typing instead. */
export function historyShortcut(event: KeyboardEvent): "undo" | "redo" | null {
  if (
    isTyping(event) ||
    !(event.ctrlKey || event.metaKey) ||
    event.altKey ||
    event.key.toLowerCase() !== "z"
  )
    return null;
  return event.shiftKey ? "redo" : "undo";
}

export class Toolbar {
  private state: DrawState = "select";
  private buttons = new Map<DrawState, HTMLButtonElement>();
  private deleteChips: HTMLElement;
  private measureChips = new Map<
    MeasureTool,
    { row: HTMLElement; readout: HTMLElement }
  >();
  private measurement: Measurement | null = null;
  private units: Units;
  private undoButton: HTMLButtonElement;
  private redoButton: HTMLButtonElement;

  constructor(container: HTMLElement, actions: ToolbarActions, units: Units) {
    this.units = units;
    const root = document.createElement("div");
    root.className = "draw-toolbar";

    // Clicking the active tool leaves it.
    const toggle = (state: DrawState) => () =>
      actions.setState(this.state === state ? "select" : state);

    for (const tool of TOOLS) {
      const button = iconButton(ICONS[tool], TOOL_LABELS[tool], toggle(tool));
      this.buttons.set(tool, button);
      root.appendChild(button);
    }

    const divider = document.createElement("div");
    divider.className = "draw-divider";
    root.appendChild(divider);

    for (const tool of MEASURE_TOOLS) {
      const button = iconButton(
        ICONS[tool],
        MEASURE_LABELS[tool],
        toggle(tool),
      );
      this.buttons.set(tool, button);

      const readout = document.createElement("span");
      readout.className = "draw-chip draw-readout";
      readout.setAttribute("aria-live", "polite");
      const closeChip = iconButton(ICONS.close, "Stop measuring", () =>
        actions.setState("select"),
      );
      closeChip.className = "draw-chip";

      const chips = document.createElement("div");
      chips.className = "draw-chips";
      chips.hidden = true;
      chips.append(readout, closeChip);
      this.measureChips.set(tool, { row: chips, readout });

      const row = document.createElement("div");
      row.className = "draw-tool-row";
      row.append(button, chips);
      root.appendChild(row);
    }

    const trash = iconButton(ICONS.trash, "Delete features", toggle("delete"));
    this.buttons.set("delete", trash);

    const allChip = document.createElement("button");
    allChip.type = "button";
    allChip.className = "draw-chip";
    allChip.textContent = "All";
    allChip.title = "Delete every feature";
    allChip.addEventListener("click", actions.deleteAll);

    const closeChip = iconButton(ICONS.close, "Stop deleting", () =>
      actions.setState("select"),
    );
    closeChip.className = "draw-chip";

    this.deleteChips = document.createElement("div");
    this.deleteChips.className = "draw-chips";
    this.deleteChips.hidden = true;
    this.deleteChips.append(allChip, closeChip);

    const trashRow = document.createElement("div");
    trashRow.className = "draw-tool-row";
    trashRow.append(trash, this.deleteChips);
    root.appendChild(trashRow);

    this.undoButton = iconButton(ICONS.undo, "Undo", actions.undo);
    this.redoButton = iconButton(ICONS.redo, "Redo", actions.redo);
    this.undoButton.disabled = true;
    this.redoButton.disabled = true;
    root.append(this.undoButton, this.redoButton);

    container.appendChild(root);
  }

  setState(state: DrawState): void {
    this.state = state;
    for (const [buttonState, button] of this.buttons) {
      button.classList.toggle("active", buttonState === state);
    }
    this.deleteChips.hidden = state !== "delete";
    for (const [tool, { row }] of this.measureChips)
      row.hidden = tool !== state;
  }

  /** Shown next to the active measure tool. */
  setMeasurement(measurement: Measurement | null): void {
    this.measurement = measurement;
    this.renderMeasurement();
  }

  setUnits(units: Units): void {
    this.units = units;
    this.renderMeasurement();
  }

  private renderMeasurement(): void {
    const { measurement } = this;
    for (const [tool, { readout }] of this.measureChips) {
      readout.textContent = measurement
        ? formatMeasurement(measurement, this.units)
        : MEASURE_HINTS[tool];
      readout.classList.toggle("hint", !measurement);
    }
  }

  setHistory(canUndo: boolean, canRedo: boolean): void {
    this.undoButton.disabled = !canUndo;
    this.redoButton.disabled = !canRedo;
  }
}
