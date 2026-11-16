import { gridIcon } from "./grids";
import type { GridLayer } from "./grids";
import { CURVE_SHAPE } from "./grids/curve";
import { GRATICULE_COLOR, GRATICULE_SHAPE } from "./grids/graticule";
import type { Graticule } from "./grids/graticule";
import { ICONS } from "./icons";

export class GridControl {
  readonly root: HTMLElement;
  private layers: GridLayer[];
  private rows: HTMLElement;
  private collapseButton!: HTMLButtonElement;
  private collapsed = false;
  private layerToggles = new Map<GridLayer, HTMLInputElement>();
  private zoomLabel!: HTMLElement;

  private onInfo: () => void;

  constructor(
    container: HTMLElement,
    layers: GridLayer[],
    onInfo: () => void = () => {},
    graticule?: Graticule,
  ) {
    this.onInfo = onInfo;
    this.root = document.createElement("div");
    this.root.className = "grid-control";

    this.layers = layers;
    this.root.appendChild(this.buildHeader());

    this.rows = document.createElement("div");
    this.rows.className = "grid-rows";
    for (const layer of layers) {
      this.rows.appendChild(this.buildRow(layer));
    }
    // Set apart from the grids above: it has no cells or levels, only lines that follow the zoom.
    if (graticule) {
      const divider = document.createElement("hr");
      divider.className = "grid-divider";
      this.rows.append(divider, this.buildGraticuleRow(graticule));
    }
    this.root.appendChild(this.rows);
    this.setCollapsed(false);

    container.appendChild(this.root);
  }

  private buildHeader(): HTMLElement {
    const header = document.createElement("div");
    header.className = "grid-header";

    // The title folds the card too, as the chevron does; the info button between them doesn't.
    const heading = document.createElement("h3");
    heading.className = "grid-header-title";
    heading.textContent = "Grid layers";
    heading.addEventListener("click", () => this.setCollapsed(!this.collapsed));

    // The map's zoom, as grid levels follow it.
    this.zoomLabel = document.createElement("span");
    this.zoomLabel.className = "grid-header-zoom";
    this.zoomLabel.title = "Map zoom";

    const info = document.createElement("button");
    info.type = "button";
    info.className = "icon-button grid-info-button";
    info.title = "Cell sizes per level";
    info.setAttribute("aria-label", "Cell sizes per level");
    info.innerHTML = ICONS.info;
    info.addEventListener("click", () => this.onInfo());

    this.collapseButton = document.createElement("button");
    this.collapseButton.type = "button";
    this.collapseButton.className = "icon-button grid-collapse-button";
    this.collapseButton.innerHTML = ICONS.chevron;
    this.collapseButton.addEventListener("click", () =>
      this.setCollapsed(!this.collapsed),
    );

    header.append(heading, info, this.zoomLabel, this.collapseButton);
    return header;
  }

  /** Show the map's zoom, to one decimal. */
  setZoom(zoom: number): void {
    this.zoomLabel.textContent = `Zoom ${zoom.toFixed(1)}`;
  }

  /** Folds the card down to its header, out of the way; the grids on stay on. */
  setCollapsed(collapsed: boolean): void {
    this.collapsed = collapsed;
    this.rows.hidden = collapsed;
    this.root.classList.toggle("collapsed", collapsed);
    const label = collapsed ? "Expand grid layers" : "Collapse grid layers";
    this.collapseButton.title = label;
    this.collapseButton.setAttribute("aria-label", label);
    this.collapseButton.setAttribute("aria-expanded", String(!collapsed));
  }

  private syncVisibility(): void {
    for (const layer of this.layers) {
      const visible = this.layerToggles.get(layer)!.checked;
      if (visible !== layer.visible) layer.setVisible(visible);
    }
  }

  private buildGraticuleRow(graticule: Graticule): HTMLElement {
    const row = document.createElement("div");
    row.className = "grid-row graticule-row";
    row.style.setProperty("--grid-color", GRATICULE_COLOR);

    const toggle = switchInput("Show latitude and longitude lines");
    toggle.addEventListener("change", () =>
      graticule.setVisible(toggle.checked),
    );

    const swatch = document.createElement("span");
    swatch.className = "grid-swatch";
    swatch.innerHTML = gridIcon({ shape: GRATICULE_SHAPE });

    const name = document.createElement("label");
    name.className = "grid-row-label";
    name.title = "The graticule: lines of latitude and longitude";
    name.append(toggle, swatch, "Lat/long");

    // In place of a level: how far apart the lines are, which the zoom sets.
    const spacing = document.createElement("span");
    spacing.className = "graticule-step";
    const showStep = (step: number) => {
      spacing.textContent = `every ${step}°`;
      spacing.title = `Lines every ${step}°, spaced to suit the zoom`;
    };
    showStep(graticule.step);
    graticule.onStepChange = showStep;

    row.append(name, spacing);
    return row;
  }

  private buildRow(layer: GridLayer): HTMLElement {
    const row = document.createElement("div");
    row.className = "grid-row";
    row.style.setProperty("--grid-color", layer.def.color);

    const toggle = switchInput(`Show the ${layer.def.label} grid`);
    toggle.addEventListener("change", () => this.syncVisibility());
    this.layerToggles.set(layer, toggle);

    // A cell in miniature, outlined and tinted as the grid draws them.
    const swatch = document.createElement("span");
    swatch.className = "grid-swatch";
    swatch.innerHTML = gridIcon(layer.def);

    const name = document.createElement("label");
    name.className = "grid-row-label";
    name.append(toggle, swatch, layer.def.label);

    const resolutionInput = document.createElement("input");
    resolutionInput.type = "number";
    resolutionInput.className = "grid-row-resolution";
    resolutionInput.min = String(layer.def.minResolution);
    resolutionInput.max = String(layer.def.maxResolution);
    resolutionInput.value = String(layer.resolution);
    resolutionInput.disabled = layer.auto;
    resolutionInput.setAttribute(
      "aria-label",
      `${layer.def.label} ${layer.def.resolutionName?.toLowerCase() ?? "resolution"}`,
    );
    resolutionInput.addEventListener("change", () => {
      layer.setResolution(Number(resolutionInput.value));
      resolutionInput.value = String(layer.resolution);
    });

    const autoToggle = document.createElement("input");
    autoToggle.type = "checkbox";
    autoToggle.checked = layer.auto;
    const setAuto = (auto: boolean) => {
      autoToggle.checked = auto;
      resolutionInput.disabled = auto;
      layer.setAuto(auto);
    };
    autoToggle.addEventListener("change", () => setAuto(autoToggle.checked));

    const autoLabel = document.createElement("label");
    autoLabel.className = "grid-row-auto";
    autoLabel.title = "Pick the resolution from the map zoom";
    autoLabel.append(autoToggle, "Auto");

    // Stepping picks a level by hand, so it leaves auto first, from the level shown.
    const step = (delta: number, label: string, text: string) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "grid-step";
      button.textContent = text;
      button.title = label;
      button.setAttribute("aria-label", `${label}: ${layer.def.label}`);
      button.addEventListener("click", () => {
        if (layer.auto) setAuto(false);
        layer.setResolution(layer.resolution + delta);
        resolutionInput.value = String(layer.resolution);
      });
      return button;
    };
    const stepper = document.createElement("div");
    stepper.className = "grid-stepper";
    stepper.append(
      step(-1, "Coarser", "−"),
      resolutionInput,
      step(1, "Finer", "+"),
    );

    // Keep the number input synced whenever the layer's resolution changes elsewhere (e.g. on zoom).
    layer.onResolutionChange = (resolution) => {
      resolutionInput.value = String(resolution);
    };

    layer.onTooManyCellsChange = (tooManyCells) => {
      resolutionInput.classList.toggle("too-many-cells", tooManyCells);
      stepper.classList.toggle("too-many-cells", tooManyCells);
      resolutionInput.title = tooManyCells
        ? "Too many cells to draw here: lower the resolution or zoom in"
        : "";
    };

    const level = document.createElement("div");
    level.className = "grid-row-level";
    level.append(autoLabel, stepper);

    row.append(name, curveButton(layer), level);
    return row;
  }
}

/**
 * A quiet toggle for the grid's space-filling curve, kept off the map until asked for. Grids
 * without one get a blank of the same size, so the rows' controls still line up.
 */
function curveButton(layer: GridLayer): HTMLElement {
  const { curve, label } = layer.def;
  if (!curve) {
    const blank = document.createElement("span");
    blank.className = "grid-curve-button";
    blank.setAttribute("aria-hidden", "true");
    return blank;
  }
  const button = document.createElement("button");
  button.type = "button";
  button.className = "icon-button grid-curve-button";
  button.innerHTML = `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">${CURVE_SHAPE}</svg>`;
  button.title = `Show ${curve.name}, through the cells in ID order`;
  button.setAttribute("aria-label", `Show the ${label} curve`);
  const show = (on: boolean) => {
    button.setAttribute("aria-pressed", String(on));
    button.classList.toggle("active", on);
  };
  show(layer.curve);
  button.addEventListener("click", () => {
    layer.setCurve(!layer.curve);
    show(layer.curve);
  });
  return button;
}

/** A checkbox drawn as a switch, and announced as one. */
function switchInput(label: string): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "checkbox";
  input.className = "switch";
  input.setAttribute("role", "switch");
  input.setAttribute("aria-label", label);
  return input;
}
