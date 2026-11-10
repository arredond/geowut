/** Saves text as a file, through a link the browser downloads from. */
export function downloadText(
  filename: string,
  text: string,
  type = "text/plain",
): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  // After the click has had its chance to start the download.
  setTimeout(() => URL.revokeObjectURL(url));
}

/** eg. geowut-2026-11-10.geojson */
export function datedFilename(extension: string, date = new Date()): string {
  const day = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
  return `geowut-${day}.${extension}`;
}
