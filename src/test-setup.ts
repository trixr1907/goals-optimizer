/**
 * Global test setup — runs before any test module is imported.
 *
 * Provides a minimal in-memory localStorage stub so Zustand's persist
 * middleware can read/write without printing
 * "[zustand persist middleware] Unable to update item …" warnings.
 *
 * Only affects the test environment. No production code is changed.
 */

const _storage = new Map<string, string>();

const localStorageMock: Storage = {
  getItem: (key: string) => _storage.get(key) ?? null,
  setItem: (key: string, value: string) => { _storage.set(key, value); },
  removeItem: (key: string) => { _storage.delete(key); },
  clear: () => { _storage.clear(); },
  get length() { return _storage.size; },
  key: (index: number) => Array.from(_storage.keys())[index] ?? null,
};

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
});
