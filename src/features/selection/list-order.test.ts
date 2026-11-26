import { describe, expect, it } from 'vitest';
import type { ListStatus, Score, SourceSnapshot } from '../../entities/collection/model';
import { sortEntries } from './list-order';
import type { ListSort } from './list-order';

describe('порядок отображения тайтлов', () => {
  it.each<{ sort: ListSort; expected: string[] }>([
    { sort: { key: 'alphabet', reversed: false }, expected: ['2', '3', '4', '5', '7', '6', '1'] },
    { sort: { key: 'alphabet', reversed: true }, expected: ['1', '6', '7', '5', '4', '3', '2'] },
    { sort: { key: 'my-score', reversed: false }, expected: ['3', '2', '1', '7', '6', '4', '5'] },
    { sort: { key: 'my-score', reversed: true }, expected: ['7', '6', '2', '1', '3', '4', '5'] },
    { sort: { key: 'community-score', reversed: false }, expected: ['3', '6', '2', '5', '1', '4', '7'] },
    { sort: { key: 'community-score', reversed: true }, expected: ['2', '5', '1', '3', '6', '4', '7'] },
    { sort: { key: 'status', reversed: false }, expected: ['1', '4', '5', '2', '3', '7', '6'] },
    { sort: { key: 'status', reversed: true }, expected: ['6', '7', '2', '3', '5', '4', '1'] },
  ])('сортирует по $sort, оставляя алфавит внутри равных ключей и отсутствие оценки в конце', ({ sort, expected }) => {
    const source = fixture();
    const before = structuredClone(source);
    expect(sortEntries(source, source.entries, sort).map(entry => entry.animeId)).toEqual(expected);
    expect(source).toEqual(before);
  });

  it('работает с пустым и отфильтрованным списком, не возвращая скрытые записи', () => {
    const source = fixture();
    expect(sortEntries(source, [], { key: 'my-score', reversed: false })).toEqual([]);
    expect(sortEntries(source, source.entries.slice(0, 2), { key: 'alphabet', reversed: false }).map(entry => entry.animeId)).toEqual(['2', '1']);
  });
});

/** Создаёт равные оценки, разные статусы, пропуски и названия с числовыми частями. */
function fixture(): SourceSnapshot {
  const rows: [string, string | null, Score | null, number | null, ListStatus][] = [
    ['Яблоко', null, 8, 7.5, 'planned'],
    ['Альфа', null, 8, 7.5, 'completed'],
    ['Бета', null, 9, 9.1, 'completed'],
    ['Гамма', null, null, null, 'watching'],
    ['Omega', 'Дельта', null, 7.5, 'rewatching'],
    ['Сезон 10', null, 1, 9.1, 'dropped'],
    ['Сезон 2', null, 1, null, 'on_hold'],
  ];
  return {
    profile: { id: 'demo', nickname: 'Demo', source: 'demo', url: null },
    animes: rows.map(([name, russian, , communityScore], index) => ({ id: String(index + 1), name, russian, communityScore, coverUrl: null, url: `https://shikimori.io/animes/${index + 1}` })),
    entries: rows.map(([, , originalScore, , status], index) => ({ id: `rate-${index + 1}`, animeId: String(index + 1), originalScore, status, importedAt: 'time' })),
  };
}
