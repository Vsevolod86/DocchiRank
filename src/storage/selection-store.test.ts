import { describe, expect, it } from 'vitest';
import { BrowserSelectionStore } from './selection-store';

describe('указатель на последнюю коллекцию', () => {
  it('сохраняет только ID коллекции и возвращает независимую копию указателя', () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    const store = new BrowserSelectionStore(storage);
    const selection = { collectionId: 'collection-1', filters: { status: 'completed' } };
    expect(store.set(selection)).toBe(true);
    expect(JSON.parse([...values.values()][0]!)).toEqual({ collectionId: 'collection-1' });
    selection.collectionId = 'changed-input';
    const read = store.get()!;
    read.collectionId = 'changed-output';
    expect(store.get()).toEqual({ collectionId: 'collection-1' });
  });

  it.each(['{', '[]', '{"selectedIds":["1"],"nickname":null}', '{"collectionId":42}', '{"collectionId":" "}'])('отклоняет некорректный указатель %s', raw => {
    const store = new BrowserSelectionStore({ getItem: () => raw, setItem: () => {} });
    expect(store.get()).toBeNull();
  });

  it('сообщает об отказе при недоступном хранилище', () => {
    const store = new BrowserSelectionStore({ getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('quota'); } });
    expect(store.get()).toBeNull();
    expect(store.set({ collectionId: 'collection-1' })).toBe(false);
  });
});
