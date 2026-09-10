import type { StorageShape } from './types';

export type StorageKey = keyof StorageShape;
export type StoragePatch = Partial<StorageShape>;
export type StorageListener = (changes: StoragePatch) => void;

/** Repository boundary so every module can be tested against an in-memory fake. */
export interface StorageRepository {
  get<K extends StorageKey>(keys: readonly K[]): Promise<Partial<Pick<StorageShape, K>>>;
  set(patch: StoragePatch): Promise<void>;
  clear(): Promise<void>;
  onChanged(listener: StorageListener): void;
}

export class InMemoryStorage implements StorageRepository {
  private data: StoragePatch;
  private readonly listeners: StorageListener[] = [];

  constructor(initial: StoragePatch = {}) {
    this.data = { ...initial };
  }

  async get<K extends StorageKey>(keys: readonly K[]): Promise<Partial<Pick<StorageShape, K>>> {
    const picked = keys
      .filter((key) => key in this.data)
      .map((key) => [key, this.data[key]] as const);
    return Object.fromEntries(picked) as Partial<Pick<StorageShape, K>>;
  }

  async set(patch: StoragePatch): Promise<void> {
    this.data = { ...this.data, ...patch };
    this.listeners.forEach((listener) => listener(patch));
  }

  async clear(): Promise<void> {
    this.data = {};
  }

  onChanged(listener: StorageListener): void {
    this.listeners.push(listener);
  }
}

export function createExtensionStorage(api: typeof chrome): StorageRepository {
  return {
    async get(keys) {
      return (await api.storage.local.get([...keys])) as Awaited<ReturnType<StorageRepository['get']>>;
    },
    async set(patch) {
      await api.storage.local.set(patch);
    },
    async clear() {
      await api.storage.local.clear();
    },
    onChanged(listener) {
      api.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        const patch = Object.fromEntries(Object.entries(changes).map(([key, change]) => [key, change.newValue]));
        listener(patch as StoragePatch);
      });
    },
  };
}
