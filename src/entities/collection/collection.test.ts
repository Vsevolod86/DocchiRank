import { describe, expect, it } from 'vitest';
import { createCollection } from './collection';
import type { SourceSnapshot } from './model';

describe('создание коллекции', () => {
  it('не выводит порядок и новые оценки из одинаковых исходных оценок', () => {
    const collection = createCollection(snapshot(), ['2', '1'], 'collection');
    expect(collection.selectedIds).toEqual(['2', '1']);
    expect(collection.orderedIds).toEqual([]);
    expect(collection.ratings).toEqual({ topScore: null, boundaries: [] });
    expect(collection.session).toBeNull();
  });

  it('отклоняет отсутствующие и повторные произведения в выборке', () => {
    expect(() => createCollection(snapshot(), ['missing'], 'collection')).toThrow();
    expect(() => createCollection(snapshot(), ['1', '1'], 'collection')).toThrow();
    expect(createCollection(snapshot(), [], 'empty').selectedIds).toEqual([]);
  });

  it('отклоняет повторные записи и ссылки на отсутствующие метаданные', () => {
    const duplicate = snapshot();
    duplicate.entries.push({ ...duplicate.entries[0]! });
    expect(() => createCollection(duplicate, ['1'], 'collection')).toThrow();

    const missing = snapshot();
    missing.animes = [];
    expect(() => createCollection(missing, ['1'], 'collection')).toThrow();
  });

  it('не разделяет изменяемые данные с источником и другой коллекцией', () => {
    const source = snapshot();
    const first = createCollection(source, ['1'], 'first');
    const second = createCollection(source, ['1'], 'second');
    first.profile.nickname = 'Changed';
    first.animes[0]!.name = 'Changed';
    first.entries[0]!.originalScore = 1;
    expect(second).toMatchObject({ profile: source.profile, animes: source.animes, entries: source.entries });
    expect(source.entries[0]!.originalScore).toBe(8);
  });
});

/** Создаёт внутренний снимок без зависимости от UI и демонстрационных SVG. */
function snapshot(): SourceSnapshot {
  return {
    profile: { id: 'profile', nickname: 'Profile', url: null, source: 'demo' },
    animes: ['1', '2'].map(id => ({ id, name: `Anime ${id}`, russian: null, coverUrl: null, communityScore: null, url: `https://shikimori.io/animes/${id}` })),
    entries: ['1', '2'].map(id => ({ id: `rate-${id}`, animeId: id, status: 'completed', originalScore: 8, importedAt: '2026-11-19T00:00:00Z' })),
  };
}
