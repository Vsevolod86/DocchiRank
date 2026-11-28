import { describe, expect, it } from 'vitest';
import { LIST_STATUSES } from '../../entities/collection/model';
import type { Collection, ListStatus, Score } from '../../entities/collection/model';
import { createDisplayFilters, cycleDisplayFilter, toggleFilterGroup, visibleEntries, withScoreBound } from './filters';

describe('фильтры отображения', () => {
  it('совмещает тип произведения с оценкой, различает неизвестный тип и сбрасывает ограничение последним флагом', () => {
    const collection = fixture();
    collection.animes[0]!.kind = 'tv';
    collection.animes[1]!.kind = 'movie';
    collection.animes[2]!.kind = 'ova';
    const filters = createDisplayFilters();
    cycleDisplayFilter(filters, 'kind', 'movie');
    cycleDisplayFilter(filters, 'kind', 'ova');
    expect(visibleEntries(collection, filters).map(entry => entry.animeId)).toEqual(['2', '3']);
    filters.score = { min: 8, max: 8, unratedOnly: false };
    expect(visibleEntries(collection, filters).map(entry => entry.animeId)).toEqual(['2']);
    filters.score = createDisplayFilters().score;
    cycleDisplayFilter(filters, 'kind', 'movie');
    cycleDisplayFilter(filters, 'kind', 'ova');
    expect(visibleEntries(collection, filters)).toHaveLength(9);
    cycleDisplayFilter(filters, 'kind', 'unknown');
    expect(visibleEntries(collection, filters).map(entry => entry.animeId)).toEqual(['4', '5', '6', '7', '8', '9']);
    toggleFilterGroup(filters, 'kind');
    expect(visibleEntries(collection, filters)).toHaveLength(9);
    toggleFilterGroup(filters, 'kind');
    expect(Object.values(filters.kind).some(Boolean)).toBe(false);
    expect(collection.selectedIds).toEqual(['1', '4', '6', '8']);
  });

  it('по умолчанию показывает всё и не меняет данные или скрытый выбор', () => {
    const collection = fixture();
    const before = structuredClone(collection);
    const filters = createDisplayFilters();
    expect(visibleEntries(collection, filters)).toEqual(collection.entries);
    expect(Object.values(filters.status).every(enabled => !enabled)).toBe(true);
    filters.status.completed = true;
    expect(visibleEntries(collection, filters).map(entry => entry.animeId)).toEqual(['1', '2', '5']);
    expect(collection).toEqual(before);
    expect(createDisplayFilters().status.completed).toBe(false);
  });

  it('показывает только включённые статусы', () => {
    const filters = createDisplayFilters();
    for (const status of LIST_STATUSES) filters.status[status] = status === 'completed' || status === 'watching';
    expect(visibleEntries(fixture(), filters).map(entry => entry.animeId)).toEqual(['1', '2', '3', '5', '6']);
  });

  it('выключенная группа не ограничивает список, а последний снятый флаг возвращает все значения', () => {
    const collection = fixture();
    const filters = createDisplayFilters();
    filters.status.planned = true;
    expect(visibleEntries(collection, filters).map(entry => entry.animeId)).toEqual(['4']);
    filters.status.planned = false;
    expect(visibleEntries(collection, filters)).toEqual(collection.entries);
  });

  it('кнопка группы переключает все флаги и сохраняет другие условия', () => {
    const filters = createDisplayFilters();
    filters.score = { min: 8, max: 8, unratedOnly: false };
    filters.selection = 'exclude';
    expect(toggleFilterGroup(filters, 'status')).toBe(true);
    expect(Object.values(filters.status).every(Boolean)).toBe(true);
    expect(toggleFilterGroup(filters, 'status')).toBe(true);
    expect(Object.values(filters.status).some(Boolean)).toBe(false);
    filters.status.completed = true;
    toggleFilterGroup(filters, 'status');
    expect(Object.values(filters.status).every(Boolean)).toBe(true);
    expect(toggleFilterGroup(filters, 'selection')).toBe(false);
    expect(filters.score).toEqual({ min: 8, max: 8, unratedOnly: false });
    expect(filters.selection).toBe('exclude');
  });

  it('совместно применяет статус, исходную оценку и исключение отмеченных', () => {
    const filters = createDisplayFilters();
    for (const status of LIST_STATUSES) filters.status[status] = status === 'completed';
    filters.score = { min: 8, max: 9, unratedOnly: false };
    filters.selection = 'exclude';
    expect(visibleEntries(fixture(), filters).map(entry => entry.animeId)).toEqual(['2']);
  });

  it.each([
    [null, ['4', '5']], [1, ['6']], [10, ['7']],
  ] as const)('отличает отсутствие оценки и крайние числовые значения: %s', (value, expected) => {
    const filters = createDisplayFilters();
    filters.score = value === null ? { ...filters.score, unratedOnly: true } : { min: value, max: value, unratedOnly: false };
    expect(visibleEntries(fixture(), filters).map(entry => entry.animeId)).toEqual(expected);
  });

  it('пересчитывает отмеченные и неотмеченные после изменения выборки', () => {
    const collection = fixture();
    const filters = createDisplayFilters();
    filters.selection = 'exclude';
    expect(visibleEntries(collection, filters).map(entry => entry.animeId)).toEqual(['2', '3', '5', '7', '9']);
    collection.selectedIds.push('2');
    expect(visibleEntries(collection, filters).map(entry => entry.animeId)).toEqual(['3', '5', '7', '9']);
    filters.selection = 'include';
    expect(visibleEntries(collection, filters).map(entry => entry.animeId)).toEqual(['1', '2', '4', '6', '8']);
  });

  it('переключает статусы только между двумя состояниями', () => {
    const filters = createDisplayFilters();
    for (const expected of [true, false, true, false]) {
      expect(cycleDisplayFilter(filters, 'status', 'completed')).toBe(true);
      expect(filters.status.completed).toBe(expected);
    }
    const before = structuredClone(filters);
    expect(cycleDisplayFilter(filters, '__proto__', 'selected')).toBe(false);
    expect(cycleDisplayFilter(filters, 'status', undefined)).toBe(false);
    expect(filters).toEqual(before);
  });

  it('удерживает бегунки в пределах шкалы и сохраняет диапазон в режиме без оценки', () => {
    const range = { min: 3, max: 7, unratedOnly: false } as const;
    const unrated = { ...range, unratedOnly: true };
    expect(withScoreBound(range, 'min', 9)).toEqual({ min: 7, max: 7, unratedOnly: false });
    expect(withScoreBound(range, 'max', 1)).toEqual({ min: 3, max: 3, unratedOnly: false });
    expect(withScoreBound(range, 'min', 0)).toBe(range);
    expect(withScoreBound(unrated, 'min', 4)).toBe(unrated);
  });

  it('одним тройным флагом выбирает отмеченные, неотмеченные или все произведения', () => {
    const collection = fixture();
    const filters = createDisplayFilters();
    const expected = [collection.selectedIds, ['2', '3', '5', '7', '9'], collection.entries.map(entry => entry.animeId)];
    for (const ids of expected) {
      expect(cycleDisplayFilter(filters, 'selection', 'selected')).toBe(true);
      expect(visibleEntries(collection, filters).map(entry => entry.animeId)).toEqual(ids);
    }
    expect(cycleDisplayFilter(filters, 'selection', 'unselected')).toBe(false);
  });
});

/** Создаёт разные статусы, исходные оценки и отметки без зависимости от DOM или сети. */
function fixture(): Pick<Collection, 'entries' | 'selectedIds' | 'animes'> {
  const values: [ListStatus, Score | null][] = [
    ['completed', 9], ['completed', 8], ['watching', 9], ['planned', null], ['completed', null],
    ['watching', 1], ['on_hold', 10], ['dropped', 7], ['rewatching', 2],
  ];
  return {
    animes: values.map((_, index) => ({ id: String(index + 1), name: `Anime ${index + 1}`, russian: null, coverUrl: null, communityScore: null, url: `https://shikimori.io/animes/${index + 1}` })),
    selectedIds: ['1', '4', '6', '8'],
    entries: values.map(([status, originalScore], index) => ({
      id: `rate-${index + 1}`, animeId: String(index + 1), status, originalScore, importedAt: '2026-11-19T00:00:00Z',
    })),
  };
}
