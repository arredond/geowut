import { vi } from 'vitest';

/** Node's own localStorage shadows jsdom's, and needs a file to work, so tests get an in-memory one. */
function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, String(value)),
    removeItem: (key) => void items.delete(key),
    key: (index) => [...items.keys()][index] ?? null,
  };
}
vi.stubGlobal('localStorage', memoryStorage());
