import { Popup } from "maplibre-gl";
import type { LngLatLike, Map as MapLibreMap } from "maplibre-gl";
import { ICONS } from "./icons";
import { DEFAULT_COLOR } from "./featureStyle";
import { createEmojiPicker } from "./emojiPicker";
import type { FeatureStyle } from "./featureStyle";

export interface StyleActions {
  current: FeatureStyle;
  /** Points can show an emoji in place of their dot. */
  isPoint: boolean;
  /** Undefined takes that part of the style away. */
  onChange: (change: Partial<FeatureStyle>) => void;
}

export interface FeatureActions {
  onEdit: () => void;
  onDelete: () => void;
  style?: StyleActions;
}

/** Distinct on light and dark basemaps alike. Any other is a click on the last swatch away. */
export const COLORS = [
  "#e5484d",
  "#f76b15",
  "#ffc53d",
  "#30a46c",
  "#12a594",
  "#8e4ec6",
  "#d6409f",
  "#1c2024",
  "#ffffff",
] as const;

function actionButton(
  iconHtml: string,
  label: string,
  onClick: () => void,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "popup-action";
  button.title = label;
  button.setAttribute("aria-label", label);
  button.innerHTML = iconHtml;
  button.addEventListener("click", onClick);
  return button;
}

function swatch(
  label: string,
  onClick: () => void,
  className = "",
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `style-swatch ${className}`.trim();
  button.title = label;
  button.setAttribute("aria-label", label);
  button.addEventListener("click", onClick);
  return button;
}

function styleRow(label: string): HTMLDivElement {
  const row = document.createElement("div");
  row.className = "style-row";
  row.setAttribute("role", "group");
  row.setAttribute("aria-label", label);
  return row;
}

/**
 * One row: the default color, the presets, any other color, and for points, an emoji, which
 * opens a picker under the row. A point shows a color or an emoji, never both: picking either
 * clears the other. Each change applies at once, and shows as picked.
 */
export function buildStylePicker({
  current,
  isPoint,
  onChange,
}: StyleActions): HTMLElement {
  const style = { ...current };
  const picker = document.createElement("div");
  picker.className = "style-picker";
  const row = styleRow("Style");

  const setColor = (color: string | undefined) => {
    style.color = color as FeatureStyle["color"];
    style.emoji = undefined;
    onChange({ color: style.color, ...(isPoint && { emoji: undefined }) });
    closeEmojiPicker();
    markPicked();
  };
  const setEmoji = (emoji: string) => {
    style.emoji = emoji;
    style.color = undefined;
    onChange({ emoji, color: undefined });
    markPicked();
  };

  const colorSwatches: [string | undefined, HTMLElement][] = [];
  const defaultSwatch = swatch("Default color", () => setColor(undefined));
  defaultSwatch.style.background = DEFAULT_COLOR;
  colorSwatches.push([undefined, defaultSwatch]);
  row.appendChild(defaultSwatch);
  for (const color of COLORS) {
    const button = swatch(color, () => setColor(color));
    button.style.background = color;
    colorSwatches.push([color, button]);
    row.appendChild(button);
  }
  // Any other color, through the system's own picker.
  const custom = document.createElement("label");
  custom.className = "style-swatch custom";
  custom.title = "Other color";
  const customInput = document.createElement("input");
  customInput.type = "color";
  customInput.setAttribute("aria-label", "Other color");
  customInput.value = current.color ?? DEFAULT_COLOR;
  customInput.addEventListener("input", () => setColor(customInput.value));
  custom.appendChild(customInput);
  row.appendChild(custom);

  let emojiButton: HTMLButtonElement | undefined;
  let emojiPicker: HTMLElement | undefined;
  let loading = false;
  function closeEmojiPicker(): void {
    emojiPicker?.remove();
    emojiPicker = undefined;
    emojiButton?.setAttribute("aria-expanded", "false");
  }
  async function toggleEmojiPicker(): Promise<void> {
    if (emojiPicker) return closeEmojiPicker();
    if (loading) return;
    loading = true;
    try {
      emojiPicker = await createEmojiPicker((emoji) => {
        setEmoji(emoji);
        closeEmojiPicker();
      });
      picker.appendChild(emojiPicker);
      emojiButton!.setAttribute("aria-expanded", "true");
    } finally {
      loading = false;
    }
  }
  if (isPoint) {
    emojiButton = swatch("Emoji", () => void toggleEmojiPicker(), "emoji");
    emojiButton.setAttribute("aria-expanded", "false");
    row.appendChild(emojiButton);
  }
  picker.appendChild(row);

  function markPicked(): void {
    const showsColor = style.emoji === undefined;
    for (const [color, el] of colorSwatches)
      el.setAttribute(
        "aria-pressed",
        String(showsColor && color === style.color),
      );
    const isCustom =
      style.color !== undefined &&
      !colorSwatches.some(([color]) => color === style.color);
    custom.classList.toggle("picked", showsColor && isCustom);
    if (style.color) customInput.value = style.color;
    if (emojiButton) {
      // The emoji picked shows in its button; until then, a smiley says what it's for.
      emojiButton.setAttribute("aria-pressed", String(!showsColor));
      if (style.emoji) emojiButton.textContent = style.emoji;
      else emojiButton.innerHTML = ICONS.smilePlus;
    }
  }
  markPicked();
  return picker;
}

/** Just the actions: what's known about the feature goes in the side panel. */
export function buildPopupContent({
  onEdit,
  onDelete,
  style,
}: FeatureActions): HTMLElement {
  const content = document.createElement("div");

  const actions = document.createElement("div");
  actions.className = "popup-actions";
  if (style) {
    // The picker opens under the actions, only when asked for: most clicks are to look.
    let picker: HTMLElement | undefined;
    const styleButton = actionButton(ICONS.palette, "Style", () => {
      if (picker) {
        picker.remove();
        picker = undefined;
      } else {
        picker = buildStylePicker(style);
        content.appendChild(picker);
      }
      styleButton.setAttribute("aria-expanded", String(Boolean(picker)));
    });
    styleButton.setAttribute("aria-expanded", "false");
    actions.appendChild(styleButton);
  }
  const deleteButton = actionButton(ICONS.trash, "Delete", onDelete);
  deleteButton.classList.add("danger");
  actions.append(actionButton(ICONS.pencil, "Edit", onEdit), deleteButton);
  content.appendChild(actions);
  return content;
}

/** Room left between a popup panned into view and the map's edges, in pixels. */
const VIEW_MARGIN = 12;
/** The same, at the top and bottom, which hold the toolbars. */
const BAR_MARGIN = 72;

export class FeaturePopup {
  private map: MapLibreMap;
  private popup?: Popup;
  private actions?: FeatureActions;
  private resizeObserver?: ResizeObserver;

  constructor(map: MapLibreMap) {
    this.map = map;
  }

  /** offset: how far from lngLat the popup's tip stays, clear of what it points at. */
  show(lngLat: LngLatLike, actions: FeatureActions, offset = 10): void {
    this.actions = actions;
    this.resizeObserver?.disconnect();
    const content = buildPopupContent(actions);
    // A new popup each time: the previous one closes itself on the very click that opens this one.
    const popup = (this.popup = new Popup({
      maxWidth: "320px",
      closeButton: false,
      offset,
      className: "feature-popup",
    })
      .setLngLat(lngLat)
      .setDOMContent(content)
      .addTo(this.map));
    // MapLibre picks the side to open on only as the popup opens or the map moves: the style
    // picker grows it, the emoji picker a lot, so it picks again then, to stay on screen.
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => {
        if (!popup.isOpen()) return;
        popup.setLngLat(popup.getLngLat());
        this.panIntoView(popup);
      });
      this.resizeObserver.observe(content);
    }
  }

  /**
   * Pans the map just enough to bring the whole popup on screen, where it's grown past an
   * edge, clear of the bars along the top and (on phones) the bottom.
   */
  private panIntoView(popup: Popup): void {
    const box = popup.getElement().getBoundingClientRect();
    const view = this.map.getContainer().getBoundingClientRect();
    const overflow = (start: number, end: number, min: number, max: number) =>
      start < min
        ? start - min
        : end > max
          ? Math.min(end - max, start - min)
          : 0;
    const dx = overflow(
      box.left,
      box.right,
      view.left + VIEW_MARGIN,
      view.right - VIEW_MARGIN,
    );
    const dy = overflow(
      box.top,
      box.bottom,
      view.top + BAR_MARGIN,
      view.bottom - BAR_MARGIN,
    );
    if (dx || dy) this.map.panBy([dx, dy]);
  }

  /** Moves the tip, as when a point's dot gives way to a larger emoji. */
  setOffset(offset: number): void {
    this.popup?.setOffset(offset);
  }

  /** The same as pressing the popup's delete button, if there's a popup open. */
  deleteFeature(): void {
    if (this.popup?.isOpen()) this.actions?.onDelete();
  }

  hide(): void {
    this.popup?.remove();
  }
}
