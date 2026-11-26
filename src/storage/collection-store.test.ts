import { describe, expect, it, vi } from 'vitest';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { createCollection } from '../entities/collection/collection';
import type { Collection } from '../entities/collection/model';
import { PairwiseSorterEngine } from '../entities/sorting/engine';
import type { Item, Strategy } from '../entities/sorting/session';
import { BrowserCollectionStore, MemoryCollectionStore } from './collection-store';
import { parseCollectionBackup, serializeCollectionBackup } from './collection-backup';

it('изолирует коллекции по ID и возвращает отдельные копии', () => {
  const collection = createCollection({
    profile: { id: 'demo', nickname: 'Demo', url: null, source: 'demo' },
    animes: [], entries: [],
  }, [], 'first');
  const store = new MemoryCollectionStore();
  store.set(collection);
  collection.name = 'Changed after saving';
  expect(store.get('first')!.name).not.toBe(collection.name);

  const loaded = store.get('first')!;
  loaded.name = 'Changed after reading';
  store.set({ ...collection, id: 'second' });
  expect(store.get('first')!.name).not.toBe(loaded.name);
  expect(store.get('second')!.name).toBe(collection.name);
  expect(store.get('missing')).toBeNull();
  const listed = store.list();
  listed[0]!.name = 'Changed list copy';
  expect(store.get('first')!.name).not.toBe(listed[0]!.name);
});

describe('постоянные коллекции и резервная копия', () => {
  it('восстанавливает независимые коллекции после перезагрузки и не записывает демонстрацию', async () => {
    const database = new IDBFactory();
    const store = await BrowserCollectionStore.open(database);
    const first = collection('first');
    expect(await store.set(first)).toBe('saved');
    first.name = 'Changed outside';
    expect(await store.set(collection('second'))).toBe('saved');
    const demo = collection('demo');
    demo.profile.source = 'demo';
    demo.animes[0]!.coverUrl = 'data:image/svg+xml;base64,AAAA';
    expect(await store.set(demo)).toBe('saved');
    expect(store.get('demo')!.animes[0]!.coverUrl).toContain('data:image');

    const restored = await BrowserCollectionStore.open(database);
    expect(restored.list().map(value => value.id)).toEqual(['first', 'second']);
    expect(restored.get('first')!.name).toBe('Profile');
    restored.get('first')!.selectedIds.pop();
    expect(restored.get('first')!.selectedIds).toEqual(['1', '2', '3', '4']);
    expect(restored.get('demo')).toBeNull();
  });

  it('при отказе записи сохраняет новое состояние в памяти и прежнюю постоянную копию целиком', async () => {
    const database = new IDBFactory();
    const store = await BrowserCollectionStore.open(database);
    expect(await store.set(collection('first'))).toBe('saved');
    const put = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    const changed = collection('first');
    changed.name = 'Unsaved changes';
    try {
      expect(await store.set(changed)).toBe('failed');
      expect(await store.set(collection('second'))).toBe('failed');
    } finally {
      put.mockRestore();
    }
    expect(store.get('first')!.name).toBe('Unsaved changes');
    expect(store.list()).toHaveLength(2);
    const restored = await BrowserCollectionStore.open(database);
    expect(restored.get('first')!.name).toBe('Profile');
    expect(restored.get('second')).toBeNull();
    expect(await store.set(changed)).toBe('saved');
  });

  it('сохраняет одновременные записи разных коллекций и отклоняет устаревшую версию одной', async () => {
    const database = new IDBFactory();
    const firstTab = await BrowserCollectionStore.open(database);
    const secondTab = await BrowserCollectionStore.open(database);
    expect(await Promise.all([firstTab.set(collection('first')), secondTab.set(collection('second'))])).toEqual(['saved', 'saved']);

    const staleTab = await BrowserCollectionStore.open(database);
    const first = firstTab.get('first')!;
    const stale = staleTab.get('first')!;
    first.name = 'Latest';
    stale.name = 'Unsaved in second tab';
    expect(await Promise.all([firstTab.set(first), staleTab.set(stale)])).toEqual(['saved', 'conflict']);
    const restored = await BrowserCollectionStore.open(database);
    expect(restored.get('first')!.name).toBe('Latest');
    expect(restored.get('second')).not.toBeNull();
    expect(staleTab.get('first')!.name).toBe('Unsaved in second tab');
  });

  it('сохраняет последовательные изменения одной вкладки в порядке вызовов', async () => {
    const database = new IDBFactory();
    const store = await BrowserCollectionStore.open(database);
    const first = collection('first');
    const pending = store.set(first);
    first.name = 'Latest';
    expect(await Promise.all([pending, store.set(first)])).toEqual(['saved', 'saved']);
    expect((await BrowserCollectionStore.open(database)).get('first')!.name).toBe('Latest');
  });

  it.each<Strategy>(['insertion', 'merge'])('экспортирует и продолжает сессию %s с прежней очередью после обновления оценок', strategy => {
    const pending = items();
    pending[1]!.userScore = 4;
    const engine = new PairwiseSorterEngine({ known: [], pending }, { strategy, sessionId: `session-${strategy}` });
    engine.answer('tie');
    const value = collection('first');
    value.session = engine.getState();
    value.orderedIds = value.session.progress.orderedIds;
    value.entries[0]!.originalScore = 2;
    value.animes[0]!.coverUrl = 'data:image/png;base64,AAAA';
    const backup = serializeCollectionBackup(value);
    const saved = JSON.parse(backup).collection;
    expect(saved.orderedIds).toBeUndefined();
    expect(saved.session.progress).toBeUndefined();
    expect(saved.session.input).toEqual({ known: [], pending: ['1', '2', '3', '4'], queue: ['1', '3', '4', '2'] });
    const restored = parseCollectionBackup(backup);
    expect(restored.animes[0]!.coverUrl).toBeNull();
    expect(restored.session).toEqual(engine.getState());
    expect(restored.entries[0]!.originalScore).toBe(2);
    const resumed = PairwiseSorterEngine.restore(restored.session);
    finish(engine);
    finish(resumed);
    expect(resumed.getState()).toEqual(engine.getState());
    value.session = engine.getState();
    value.orderedIds = value.session.progress.orderedIds;
    const next = new PairwiseSorterEngine({ known: [], pending: items() }, { strategy, sessionId: `next-${strategy}` });
    const complete = parseCollectionBackup(serializeCollectionBackup(value));
    expect(complete.session).toEqual(engine.getState());
    value.archivedSessions = [value.session];
    value.session = next.getState();
    value.orderedIds = value.session.progress.orderedIds;
    expect(parseCollectionBackup(serializeCollectionBackup(value)).archivedSessions).toEqual([complete.session]);
  });

  it('отклоняет несовместимые версии, повреждённую сессию и несогласованные ссылки до записи', async () => {
    const valid = collection('first');
    const engine = new PairwiseSorterEngine({ known: [], pending: items() });
    valid.session = engine.getState();
    valid.orderedIds = valid.session.progress.orderedIds;
    const backup = serializeCollectionBackup(valid);
    const unsupported = JSON.parse(backup);
    unsupported.schemaVersion = 1;
    expect(() => parseCollectionBackup(JSON.stringify(unsupported))).toThrow();
    const expanded = JSON.parse(backup);
    expanded.collection.session.progress = valid.session.progress;
    expect(() => parseCollectionBackup(JSON.stringify(expanded))).toThrow(/Развёрнутый снимок/);
    delete expanded.collection.session.progress;
    expanded.collection.orderedIds = valid.orderedIds;
    expect(() => parseCollectionBackup(JSON.stringify(expanded))).toThrow(/из журнала/);
    const broken = JSON.parse(backup);
    broken.collection.session.input.queue[0] = '999';
    expect(() => parseCollectionBackup(JSON.stringify(broken))).toThrow();
    const missing = JSON.parse(backup);
    missing.collection.selectedIds.push('999');
    expect(() => parseCollectionBackup(JSON.stringify(missing))).toThrow();
    const unsafe = JSON.parse(backup);
    unsafe.collection.animes[0].coverUrl = 'javascript:alert(1)';
    expect(() => parseCollectionBackup(JSON.stringify(unsafe))).toThrow();

    const database = new IDBFactory();
    const store = await BrowserCollectionStore.open(database);
    expect(await store.set(valid)).toBe('saved');
    const before = store.get(valid.id);
    valid.orderedIds.push('999');
    expect(await store.set(valid)).toBe('failed');
    expect((await BrowserCollectionStore.open(database)).get(valid.id)).toEqual(before);
  });

  it('сохраняет границы без перерасчёта, пока их опоры заново размещаются в сессии', () => {
    const value = collection('first');
    const engine = new PairwiseSorterEngine({ known: [], pending: items() }, { strategy: 'insertion' });
    value.session = engine.getState();
    value.orderedIds = value.session.progress.orderedIds;
    value.ratings = { topScore: 9, boundaries: [{ aboveId: '2', belowId: '4', scoreBelow: 8 }] };
    expect(value.session.progress.pendingIds).toContain('4');
    expect(parseCollectionBackup(serializeCollectionBackup(value)).ratings).toEqual(value.ratings);
    finish(engine);
    value.session = engine.getState();
    value.orderedIds = value.session.progress.orderedIds;
    expect(parseCollectionBackup(serializeCollectionBackup(value)).ratings).toEqual(value.ratings);
  });

  it('сохраняет незавершённый выбор интервалов и отклоняет неверные ссылки, оценки и границу внутри ничьей', () => {
    const value = collection('first');
    const known = items();
    const engine = new PairwiseSorterEngine({ known: [[known[0]!, known[1]!], [known[2]!], [known[3]!]], pending: [] });
    value.session = engine.getState();
    value.orderedIds = value.session.progress.orderedIds;
    value.ratings = { topScore: 9, boundaries: [{ aboveId: '2', belowId: '3', scoreBelow: 7 }] };
    value.ratingTransition = { scores: { '1': 9, '2': 9, '4': 7 }, changedIds: ['3'], choices: { '3': 9 } };
    const json = serializeCollectionBackup(value);
    expect(parseCollectionBackup(json).ratingTransition).toEqual(value.ratingTransition);
    const invalid = JSON.parse(json);
    invalid.collection.ratingTransition.choices['3'] = '9';
    expect(() => parseCollectionBackup(JSON.stringify(invalid))).toThrow();
    invalid.collection.ratingTransition.choices = { '999': 8 };
    expect(() => parseCollectionBackup(JSON.stringify(invalid))).toThrow();
    delete value.ratingTransition;
    value.ratings.boundaries[0] = { aboveId: '1', belowId: '2', scoreBelow: 7 };
    expect(() => serializeCollectionBackup(value)).toThrow();
  });
});

/** Создаёт полный список с проверяемыми HTTP-ссылками и датами импорта. */
function collection(id: string): Collection {
  return createCollection({
    profile: { id: 'profile', nickname: 'Profile', url: 'https://shikimori.io/Profile', source: 'shikimori' },
    animes: items().map(item => ({ id: item.id, name: item.title, russian: null, coverUrl: null, communityScore: item.communityScore, url: `https://shikimori.io/animes/${item.id}` })),
    entries: items().map(item => ({ id: `rate-${item.id}`, animeId: item.id, status: 'completed', originalScore: 9, importedAt: '2026-11-19T00:00:00Z' })),
  }, ['1', '2', '3', '4'], id);
}

/** Создаёт одни и те же априорные оценки для выявления подмены исходных данных сессии. */
function items(): Item[] {
  return ['1', '2', '3', '4'].map(id => ({ id, title: `Anime ${id}`, userScore: 9, communityScore: 8 }));
}

/** Доводит сессию до согласованного порядка, не меняя уже подтверждённые ничьи. */
function finish(engine: PairwiseSorterEngine): void {
  let questions = 0;
  while (engine.getView().current) {
    if (++questions > 40) throw new Error('Сессия не завершается.');
    const { leftId, rightId } = engine.getView().current!;
    engine.answer(Number(leftId) < Number(rightId) ? 'left' : 'right');
  }
  expect(engine.getView().status).toBe('complete');
}
