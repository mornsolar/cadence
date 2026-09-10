import { describe, expect, test, vi } from 'vitest';
import { InMemoryStorage, createExtensionStorage } from '../../src/shared/storage';
import { DEFAULT_SETTINGS } from '../../src/shared/constants';

describe('InMemoryStorage', () => {
  test('get returns undefined for missing keys and stored values otherwise', async () => {
    const store = new InMemoryStorage();
    expect(await store.get(['settings'])).toEqual({});
    await store.set({ settings: DEFAULT_SETTINGS });
    expect(await store.get(['settings'])).toEqual({ settings: DEFAULT_SETTINGS });
  });

  test('set notifies listeners with the changed keys', async () => {
    const store = new InMemoryStorage();
    const listener = vi.fn();
    store.onChanged(listener);
    await store.set({ session: null });
    expect(listener).toHaveBeenCalledWith({ session: null });
  });

  test('clear empties everything', async () => {
    const store = new InMemoryStorage({ schemaVersion: 1 });
    await store.clear();
    expect(await store.get(['schemaVersion'])).toEqual({});
  });
});

describe('createExtensionStorage', () => {
  test('delegates to storage.local and maps onChanged to new values', async () => {
    const listeners: Array<(changes: Record<string, { newValue?: unknown }>, area: string) => void> = [];
    const local = { get: vi.fn().mockResolvedValue({ schemaVersion: 1 }), set: vi.fn().mockResolvedValue(undefined), clear: vi.fn().mockResolvedValue(undefined) };
    const api = { storage: { local, onChanged: { addListener: (cb: (typeof listeners)[number]) => listeners.push(cb) } } } as unknown as typeof chrome;
    const store = createExtensionStorage(api);

    expect(await store.get(['schemaVersion'])).toEqual({ schemaVersion: 1 });
    await store.set({ session: null });
    expect(local.set).toHaveBeenCalledWith({ session: null });

    const listener = vi.fn();
    store.onChanged(listener);
    listeners[0]!({ events: { newValue: [] } }, 'local');
    listeners[0]!({ events: { newValue: [1] } }, 'sync');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ events: [] });
  });
});
