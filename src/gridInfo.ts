import type { GridLayer } from "./grids";
import { ICONS } from "./icons";
import { formatArea, formatLength } from "./units";
import type { Units } from "./units";

/** Reference table of cell sizes, per level, for each grid. Opens on the grid the user last looked at. */
export class GridInfoModal {
  private root: HTMLElement;
  private tabs: HTMLElement;
  private body: HTMLElement;
  private layers: GridLayer[];
  private getUnits: () => Units;
  private selected: GridLayer;

  constructor(
    container: HTMLElement,
    layers: GridLayer[],
    getUnits: () => Units,
  ) {
    this.layers = layers;
    this.getUnits = getUnits;
    this.selected = layers[0];

    this.root = document.createElement("div");
    this.root.className = "modal-overlay";
    this.root.hidden = true;
    this.root.addEventListener("click", (e) => {
      if (e.target === this.root) this.hide();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.hide();
    });

    const dialog = document.createElement("div");
    dialog.className = "modal grid-info";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-label", "Grid cell sizes");

    const header = document.createElement("div");
    header.className = "modal-header";
    const heading = document.createElement("h2");
    heading.textContent = "Grid cell sizes";
    const close = document.createElement("button");
    close.type = "button";
    close.className = "icon-button";
    close.title = "Close";
    close.setAttribute("aria-label", "Close");
    close.innerHTML = ICONS.close;
    close.addEventListener("click", () => this.hide());
    header.append(heading, close);

    this.tabs = document.createElement("div");
    this.tabs.className = "segmented";
    this.tabs.setAttribute("role", "tablist");
    for (const layer of layers) {
      const tab = document.createElement("button");
      tab.type = "button";
      tab.setAttribute("role", "tab");
      tab.textContent = layer.def.label;
      tab.style.setProperty("--grid-color", layer.def.color);
      tab.addEventListener("click", () => {
        this.selected = layer;
        this.render();
      });
      this.tabs.appendChild(tab);
    }

    this.body = document.createElement("div");
    this.body.className = "grid-info-body";

    dialog.append(header, this.tabs, this.body);
    this.root.appendChild(dialog);
    container.appendChild(this.root);
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  show(): void {
    this.root.hidden = false;
    this.render();
    this.body.querySelector(".current")?.scrollIntoView?.({ block: "center" });
  }

  hide(): void {
    this.root.hidden = true;
  }

  /** Redraw in place, as after a change of units. */
  refresh(): void {
    if (this.isOpen) this.render();
  }

  private render(): void {
    const { def, resolution, visible } = this.selected;
    const units = this.getUnits();

    this.layers.forEach((layer, i) => {
      this.tabs.children[i].setAttribute(
        "aria-selected",
        String(layer === this.selected),
      );
    });

    const table = document.createElement("table");
    table.className = "grid-info-table";
    const head = table.createTHead().insertRow();
    for (const title of [def.resolutionName, "Area", "Edge length"]) {
      const th = document.createElement("th");
      th.textContent = title;
      head.appendChild(th);
    }

    const rows = table.createTBody();
    for (let level = def.minResolution; level <= def.maxResolution; level++) {
      const { areaKm2, edgeKm } = def.levelStats(level);
      const row = rows.insertRow();
      // The level on the map, when this grid is drawn.
      if (visible && level === resolution) {
        row.className = "current";
        row.title = "Shown on the map";
      }
      row.insertCell().textContent = String(level);
      row.insertCell().textContent = formatArea(areaKm2, units);
      row.insertCell().textContent = formatLength(edgeKm, units);
    }

    const note = document.createElement("p");
    note.className = "grid-info-note";
    note.textContent = def.levelStatsNote;

    const scroller = document.createElement("div");
    scroller.className = "grid-info-scroll";
    scroller.appendChild(table);
    this.body.replaceChildren(note, scroller);
  }
}
