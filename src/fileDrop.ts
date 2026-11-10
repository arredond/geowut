const hasFiles = (e: DragEvent) =>
  Boolean(e.dataTransfer?.types.includes("Files"));

/**
 * Lets files be dropped anywhere on the page, showing where while they're dragged over it.
 * Dragging text or links, as from the page itself, is left alone.
 */
export function enableFileDrop(
  container: HTMLElement,
  onDrop: (files: File[]) => void,
): void {
  const overlay = document.createElement("div");
  overlay.className = "drop-overlay";
  overlay.hidden = true;
  const label = document.createElement("p");
  label.textContent = "Drop files to add them to the map";
  overlay.appendChild(label);
  container.appendChild(overlay);

  // dragenter and dragleave fire for every element crossed: count them to know when it's gone.
  let depth = 0;
  const reset = () => {
    depth = 0;
    overlay.hidden = true;
  };
  window.addEventListener("dragenter", (e) => {
    if (!hasFiles(e)) return;
    depth++;
    overlay.hidden = false;
  });
  window.addEventListener("dragleave", (e) => {
    if (!hasFiles(e)) return;
    if (--depth <= 0) reset();
  });
  window.addEventListener("dragover", (e) => {
    if (!hasFiles(e)) return;
    // Without this, the browser would open the file instead.
    e.preventDefault();
    e.dataTransfer!.dropEffect = "copy";
  });
  window.addEventListener("drop", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    reset();
    const files = [...(e.dataTransfer?.files ?? [])];
    if (files.length > 0) onDrop(files);
  });
}
