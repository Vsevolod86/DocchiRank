import { expect, it } from 'vitest';
import { createCollection } from './collection';
import { mergeImportedList } from './reimport';
import type { SourceSnapshot } from './model';
import { PairwiseSorterEngine } from '../sorting/engine';

it('обновляет метаданные и исходные оценки, сохраняя порядок, выбор, ответы и исчезнувшие записи', () => {
  const existing = createCollection(snapshot(['1', '2']), ['1', '2'], 'collection');
  existing.orderedIds = ['2', '1'];
  existing.session = new PairwiseSorterEngine({ known: ['2', '1'].map(id => [{ id, title: id, userScore: null, communityScore: null }]), pending: [] }).getState();
  existing.ratings = { topScore: 9, boundaries: [{ aboveId: '2', belowId: '1', scoreBelow: 8 }] };
  const before = structuredClone(existing);
  const incoming = snapshot(['1', '3']);
  incoming.animes[0]!.name = 'Updated';
  incoming.animes[0]!.communityScore = 8.76;
  incoming.entries[0]!.originalScore = null;
  const result = mergeImportedList(existing, incoming);
  expect(result.animes.map(anime => anime.id)).toEqual(['1', '2', '3']);
  expect(result.animes[0]!.name).toBe('Updated');
  expect(result.animes[0]!.communityScore).toBe(8.76);
  expect(result.entries[0]!.originalScore).toBeNull();
  expect(result).toMatchObject({ selectedIds: before.selectedIds, orderedIds: before.orderedIds, session: before.session, ratings: before.ratings });
  expect(existing).toEqual(before);
  incoming.animes[0]!.name = 'Changed after merge';
  expect(result.animes[0]!.name).toBe('Updated');
});

it('отклоняет другой профиль и конфликт ID записей, не меняя существующую коллекцию', () => {
  const existing = createCollection(snapshot(['1', '2']), ['1'], 'collection');
  const before = structuredClone(existing);
  const another = snapshot(['3']);
  another.profile.id = 'another';
  expect(() => mergeImportedList(existing, another)).toThrow();
  const conflict = snapshot(['3']);
  conflict.entries[0]!.id = 'rate-2';
  expect(() => mergeImportedList(existing, conflict)).toThrow();
  expect(existing).toEqual(before);
});

/** Создаёт снимок одного профиля для проверки обновлений его списка. */
function snapshot(ids: string[]): SourceSnapshot {
  return {
    profile: { id: '1', nickname: 'Profile', url: 'https://shikimori.io/Profile', source: 'shikimori' },
    animes: ids.map(id => ({ id, name: `Anime ${id}`, russian: null, coverUrl: null, communityScore: null, url: `https://shikimori.io/animes/${id}` })),
    entries: ids.map(id => ({ id: `rate-${id}`, animeId: id, status: 'completed', originalScore: 8, importedAt: 'time' })),
  };
}
