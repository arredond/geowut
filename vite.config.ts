import { defineConfig } from 'vite';

export default defineConfig({
  // maplibre-gl locates its worker script as a sibling file next to its own
  // module URL at runtime. Vite's dev-time dependency pre-bundling moves it
  // into node_modules/.vite/deps without that sibling, breaking the lookup -
  // excluding it keeps it served straight from node_modules instead.
  optimizeDeps: {
    exclude: ['maplibre-gl'],
  },
  worker: {
    format: 'es',
  },
});
