import { createStore, del, get, set, type UseStore } from 'idb-keyval';

/**
 * Minimal async key-value abstraction. Production uses IndexedDB (idb-keyval); tests and
 * environments without IndexedDB use the in-memory implementation. Everything that must survive
 * a reload (device id, E2EE key material, sessions, outbox) goes through this interface.
 */
export interface KeyValueStore {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  del(key: string): Promise<void>;
}

export function memoryStore(): KeyValueStore {
  const map = new Map<string, unknown>();
  return {
    async get<T>(key: string) {
      return map.get(key) as T | undefined;
    },
    async set<T>(key: string, value: T) {
      // Structured clone to mimic IndexedDB semantics (no shared references).
      map.set(key, structuredClone(value));
    },
    async del(key: string) {
      map.delete(key);
    },
  };
}

export function indexedDbStore(name = 'chatverse'): KeyValueStore {
  let store: UseStore | null = null;
  const use = () => (store ??= createStore(name, 'kv'));
  return {
    get: <T>(key: string) => get<T>(key, use()),
    set: <T>(key: string, value: T) => set(key, value, use()),
    del: (key: string) => del(key, use()),
  };
}

function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined';
}

/** The application-wide store. Falls back to memory when IndexedDB is unavailable. */
export const kv: KeyValueStore = hasIndexedDb() ? indexedDbStore() : memoryStore();
