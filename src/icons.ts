function icon(paths: string): string {
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

export const ICONS = {
  point: icon('<circle cx="12" cy="12" r="4" fill="currentColor"/>'),
  linestring: icon('<path d="M5 18 10 8l5 8 4-10"/><circle cx="5" cy="18" r="1.5"/><circle cx="19" cy="6" r="1.5"/>'),
  polygon: icon('<path d="m12 4 8 6-3 10H7L4 10z"/>'),
  rectangle: icon('<rect x="4" y="6" width="16" height="12" rx="1"/>'),
  circle: icon('<circle cx="12" cy="12" r="8"/>'),
  freehand: icon('<path d="M4 15c1-6 5-10 8-9s1 5 4 5 4-3 4 1-4 8-8 7-9-1-8-4z"/>'),
  trash: icon('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5"/>'),
  pencil: icon('<path d="M4 20l1-5L16 4l4 4L9 19zM14 6l4 4"/>'),
  undo: icon('<path d="M9 7 4 12l5 5"/><path d="M4 12h11a5 5 0 0 1 0 10h-3"/>'),
  redo: icon('<path d="m15 7 5 5-5 5"/><path d="M20 12H9a5 5 0 0 0 0 10h3"/>'),
  close: icon('<path d="M6 6l12 12M18 6 6 18"/>'),
};
