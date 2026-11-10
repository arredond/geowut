function icon(paths: string): string {
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

/** GitHub's mark, filled rather than stroked like the rest. */
const GITHUB_MARK =
  '<svg viewBox="0 0 16 16" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"/></svg>';

export const ICONS = {
  github: GITHUB_MARK,
  point: icon('<circle cx="12" cy="12" r="4" fill="currentColor"/>'),
  linestring: icon(
    '<path d="M5 18 10 8l5 8 4-10"/><circle cx="5" cy="18" r="1.5"/><circle cx="19" cy="6" r="1.5"/>',
  ),
  polygon: icon('<path d="m12 4 8 6-3 10H7L4 10z"/>'),
  rectangle: icon('<rect x="4" y="6" width="16" height="12" rx="1"/>'),
  circle: icon('<circle cx="12" cy="12" r="8"/>'),
  freehand: icon(
    '<path d="M4 15c1-6 5-10 8-9s1 5 4 5 4-3 4 1-4 8-8 7-9-1-8-4z"/>',
  ),
  "measure-line": icon(
    '<path d="m3 16 13-13 5 5L8 21z"/><path d="m7 12 2 2M10 9l2 2M13 6l2 2"/>',
  ),
  "measure-area": icon(
    '<path d="M4 4h16v16H4z" stroke-dasharray="3 3"/><path d="M8 16h8M8 16V8"/>',
  ),
  info: icon('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'),
  gear: icon(
    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  ),
  copy: icon(
    '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
  ),
  check: icon('<path d="m5 12 5 5 9-10"/>'),
  plus: icon('<path d="M12 5v14M5 12h14"/>'),
  chevron: icon('<path d="m6 9 6 6 6-6"/>'),
  download: icon('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>'),
  eye: icon(
    '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  ),
  eyeOff: icon(
    '<path d="M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-2.2 3.2M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a10 10 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18"/>',
  ),
  trash: icon('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5"/>'),
  pencil: icon('<path d="M4 20l1-5L16 4l4 4L9 19zM14 6l4 4"/>'),
  undo: icon('<path d="M9 7 4 12l5 5"/><path d="M4 12h11a5 5 0 0 1 0 10h-3"/>'),
  redo: icon('<path d="m15 7 5 5-5 5"/><path d="M20 12H9a5 5 0 0 0 0 10h3"/>'),
  close: icon('<path d="M6 6l12 12M18 6 6 18"/>'),
};
