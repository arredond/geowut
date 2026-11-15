import type { EmojiClickEvent } from "emoji-picker-element/shared";

/**
 * Every emoji, searchable, in emoji-picker-element. It and its data load on first use only, the
 * data from GeoWut itself rather than a CDN: the picker keeps it in IndexedDB after that.
 */
export async function createEmojiPicker(
  onPick: (emoji: string) => void,
): Promise<HTMLElement> {
  const [{ Picker }, { default: dataSource }] = await Promise.all([
    import("emoji-picker-element"),
    import("emoji-picker-element-data/en/emojibase/data.json?url"),
  ]);
  const picker = new Picker({ dataSource });
  picker.classList.add("emoji-picker");
  // The app's theme when it's set; left alone, the picker follows the system, as the app does.
  const theme = document.documentElement.dataset.theme;
  if (theme) picker.classList.add(theme);
  picker.addEventListener("emoji-click", (event: EmojiClickEvent) => {
    if (event.detail.unicode) onPick(event.detail.unicode);
  });
  return picker;
}
