import type { WorkId, Collection, SourceSnapshot } from './model';

/** Создаёт независимую коллекцию, отклоняя повторные ID и несогласованные ссылки. */
export function createCollection(source: SourceSnapshot, selectedIds: readonly WorkId[], id: string): Collection {
  if (!id.trim()) throw new Error('У коллекции должен быть идентификатор.');
  validateSourceSnapshot(source);
  const listedIds = new Set(source.entries.map(entry => entry.animeId));
  if (new Set(selectedIds).size !== selectedIds.length || selectedIds.some(animeId => !listedIds.has(animeId))) {
    throw new Error('Выборка содержит повторное или отсутствующее в списке произведение.');
  }

  return {
    ...structuredClone(source),
    id,
    name: source.profile.source === 'demo' ? 'Демонстрационная коллекция' : source.profile.nickname,
    selectedIds: [...selectedIds],
    orderedIds: [],
    session: null,
    ratings: { topScore: null, boundaries: [] },
  };
}

/** Проверяет уникальность идентификаторов и ссылки записей на метаданные произведений. */
export function validateSourceSnapshot(source: SourceSnapshot): void {
  const animeIds = new Set(source.animes.map(anime => anime.id));
  const entryIds = new Set(source.entries.map(entry => entry.id));
  const listedIds = new Set(source.entries.map(entry => entry.animeId));
  if (animeIds.size !== source.animes.length || entryIds.size !== source.entries.length || listedIds.size !== source.entries.length) {
    throw new Error('Исходный список содержит повторные идентификаторы.');
  }
  if (source.entries.some(entry => !animeIds.has(entry.animeId))) {
    throw new Error('Для записи списка отсутствуют данные произведения.');
  }
}
