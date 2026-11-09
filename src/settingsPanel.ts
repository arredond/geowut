import { ICONS } from "./icons";
import { BASEMAPS } from "./settings";
import type { Settings, SettingsStore } from "./settings";

interface Choice<K extends keyof Settings> {
  key: K;
  title: string;
  options: readonly { id: Settings[K]; label: string }[];
}

const UNIT_CHOICE: Choice<"units"> = {
  key: "units",
  title: "Units",
  options: [
    { id: "metric", label: "Metric" },
    { id: "imperial", label: "Imperial" },
  ],
};

const THEME_CHOICE: Choice<"theme"> = {
  key: "theme",
  title: "Theme",
  options: [
    { id: "light", label: "Light" },
    { id: "dark", label: "Dark" },
    { id: "auto", label: "Auto" },
  ],
};

const BASEMAP_CHOICE: Choice<"basemap"> = {
  key: "basemap",
  title: "Basemap",
  options: BASEMAPS,
};

/** A gear button with a popover of settings, which apply as soon as they're picked. */
export class SettingsPanel {
  private button: HTMLButtonElement;
  private popover: HTMLElement;
  private store: SettingsStore;
  private radios: HTMLInputElement[] = [];

  constructor(container: HTMLElement, store: SettingsStore) {
    this.store = store;

    const wrapper = document.createElement("div");
    wrapper.className = "settings";

    this.button = document.createElement("button");
    this.button.type = "button";
    this.button.className = "toolbar-button icon-only";
    this.button.title = "Settings";
    this.button.setAttribute("aria-label", "Settings");
    this.button.setAttribute("aria-expanded", "false");
    this.button.innerHTML = ICONS.gear;
    this.button.addEventListener("click", () => this.toggle());

    this.popover = document.createElement("div");
    this.popover.className = "settings-popover";
    this.popover.hidden = true;
    this.popover.append(
      this.segmented(UNIT_CHOICE),
      this.segmented(THEME_CHOICE),
      this.list(BASEMAP_CHOICE),
    );

    wrapper.append(this.button, this.popover);
    container.appendChild(wrapper);

    document.addEventListener("click", (e) => {
      if (!wrapper.contains(e.target as Node)) this.toggle(false);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.toggle(false);
    });
    store.subscribe(() => this.sync());
  }

  toggle(open = this.popover.hidden !== false): void {
    this.popover.hidden = !open;
    this.button.setAttribute("aria-expanded", String(open));
    this.button.classList.toggle("active", open);
  }

  private group<K extends keyof Settings>(
    choice: Choice<K>,
    className: string,
  ): HTMLElement {
    const fieldset = document.createElement("fieldset");
    fieldset.className = "settings-group";
    const legend = document.createElement("legend");
    legend.textContent = choice.title;
    const options = document.createElement("div");
    options.className = className;

    for (const option of choice.options) {
      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = `setting-${choice.key}`;
      radio.value = option.id;
      radio.checked = this.store.get()[choice.key] === option.id;
      radio.addEventListener("change", () =>
        this.store.set({ [choice.key]: option.id } as Partial<Settings>),
      );
      this.radios.push(radio);

      const label = document.createElement("label");
      label.append(radio, option.label);
      options.appendChild(label);
    }

    fieldset.append(legend, options);
    return fieldset;
  }

  private segmented<K extends keyof Settings>(choice: Choice<K>): HTMLElement {
    return this.group(choice, "segmented");
  }

  private list<K extends keyof Settings>(choice: Choice<K>): HTMLElement {
    return this.group(choice, "settings-list");
  }

  private sync(): void {
    const settings = this.store.get();
    for (const radio of this.radios) {
      const key = radio.name.replace("setting-", "") as keyof Settings;
      radio.checked = settings[key] === radio.value;
    }
  }
}
