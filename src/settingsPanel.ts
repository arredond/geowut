import { CustomBasemapForm } from "./customBasemapForm";
import { ICONS } from "./icons";
import { BASEMAPS } from "./settings";
import type { Settings, SettingsStore } from "./settings";

/** Settings picked from a list of options, as opposed to the custom basemap's details. */
type ChoiceKey = "units" | "theme" | "basemap";

interface Choice<K extends ChoiceKey> {
  key: K;
  title: string;
  options: readonly { id: Settings[K]; label: string }[];
  /** Instead of storing the pick straight away. */
  pick?: (id: Settings[K]) => void;
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

/** A gear button with a popover of settings, which apply as soon as they're picked. */
export class SettingsPanel {
  private button: HTMLButtonElement;
  private popover: HTMLElement;
  private store: SettingsStore;
  private radios: HTMLInputElement[] = [];
  private customForm: CustomBasemapForm;

  constructor(container: HTMLElement, store: SettingsStore) {
    this.store = store;
    this.customForm = new CustomBasemapForm(store);

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
      this.basemaps(),
      licensesFooter(),
    );

    wrapper.append(this.button, this.popover);
    container.appendChild(wrapper);

    document.addEventListener("click", (e) => {
      if (!wrapper.contains(e.target as Node)) this.toggle(false);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.toggle(false);
    });
    store.subscribe((_, changed) => {
      this.sync();
      if (changed.includes("basemap") || changed.includes("customBasemap"))
        this.customForm.reset();
    });
  }

  toggle(open = this.popover.hidden !== false): void {
    this.popover.hidden = !open;
    this.button.setAttribute("aria-expanded", String(open));
    this.button.classList.toggle("active", open);
  }

  private group<K extends ChoiceKey>(
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
        choice.pick
          ? choice.pick(option.id)
          : this.store.set({ [choice.key]: option.id } as Partial<Settings>),
      );
      this.radios.push(radio);

      const label = document.createElement("label");
      label.append(radio, option.label);
      options.appendChild(label);
    }

    fieldset.append(legend, options);
    return fieldset;
  }

  private segmented<K extends ChoiceKey>(choice: Choice<K>): HTMLElement {
    return this.group(choice, "segmented");
  }

  private list<K extends ChoiceKey>(choice: Choice<K>): HTMLElement {
    return this.group(choice, "settings-list");
  }

  /** Auto, OpenFreeMap's styles, and Custom with a field for its URL. */
  private basemaps(): HTMLElement {
    const fieldset = this.list<"basemap">({
      key: "basemap",
      title: "Basemap",
      options: [
        { id: "auto", label: "Auto (follows theme)" },
        ...BASEMAPS,
        { id: "custom", label: "Custom" },
      ],
      pick: (id) => {
        // Custom only applies once there are tiles to show; until then, ask for them.
        if (id !== "custom" || this.store.get().customBasemap) {
          this.store.set({ basemap: id });
        } else {
          this.sync();
          this.customForm.open();
        }
      },
    });
    fieldset.appendChild(this.customForm.element);
    return fieldset;
  }

  private sync(): void {
    const settings = this.store.get();
    for (const radio of this.radios) {
      const key = radio.name.replace("setting-", "") as keyof Settings;
      radio.checked = settings[key] === radio.value;
    }
  }
}

const REPO_URL = "https://github.com/arredond/geowut";
const LICENSE_URL = `${REPO_URL}/blob/main/LICENSE`;
/** Written next to the site by the build, from the packages bundled. */
const THIRD_PARTY_LICENSES_URL = "third-party-licenses.txt";

/** GeoWut's license, and those of the open-source packages it's built from. */
function licensesFooter(): HTMLElement {
  const footer = document.createElement("p");
  footer.className = "settings-footer";
  const link = (href: string, text: string) => {
    const a = document.createElement("a");
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = text;
    return a;
  };
  footer.append(
    link(REPO_URL, "GitHub"),
    " · ",
    link(LICENSE_URL, "MIT licensed"),
    " · ",
    link(THIRD_PARTY_LICENSES_URL, "Third-party licenses"),
  );
  return footer;
}
