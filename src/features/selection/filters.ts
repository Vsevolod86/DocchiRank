import { LIST_KINDS, LIST_STATUSES, listMedia } from '../../entities/collection/model';
import type { Collection, ListEntry, ListMedia, ListStatus, Score, WorkKind } from '../../entities/collection/model';

export type FilterMode = 'neutral' | 'include' | 'exclude';
export type ScoreFilter = `${Score}` | 'unrated';
export const SCORE_FILTERS: readonly ScoreFilter[] = ['10', '9', '8', '7', '6', '5', '4', '3', '2', '1', 'unrated'];
export type KindFilter = WorkKind | 'unknown' | 'unknown-manga';
const allKindFilters = [...kindFilters('anime'), ...kindFilters('manga')];

/** Возвращает варианты фильтра по типу для каталога текущего списка. */
export function kindFilters(media: ListMedia): KindFilter[] {
  return [...LIST_KINDS[media], unknownKind(media)];
}

/** Бинарные условия статуса и оценки и отдельный тройной флаг отметки выбора. */
export interface DisplayFilters {
  status: Record<ListStatus, boolean>;
  score: Record<ScoreFilter, boolean>;
  kind: Record<KindFilter, boolean>;
  selection: FilterMode;
}

export type FilterGroup = keyof DisplayFilters;

/** Оставляет все группы без ограничений с выключенными флагами. */
export function createDisplayFilters(): DisplayFilters {
  return {
    status: Object.fromEntries(LIST_STATUSES.map(status => [status, false])) as Record<ListStatus, boolean>,
    score: Object.fromEntries(SCORE_FILTERS.map(score => [score, false])) as Record<ScoreFilter, boolean>,
    kind: Object.fromEntries(allKindFilters.map(kind => [kind, false])) as Record<KindFilter, boolean>,
    selection: 'neutral',
  };
}

/** Проверяет условие из DOM и переключает бинарное значение либо тройной флаг отметки. */
export function cycleDisplayFilter(filters: DisplayFilters, group: string | undefined, value: string | undefined): boolean {
  if (group === 'status' && LIST_STATUSES.some(status => status === value)) {
    const status = value as ListStatus;
    filters.status[status] = !filters.status[status];
    return true;
  }
  if (group === 'score' && SCORE_FILTERS.some(score => score === value)) {
    const score = value as ScoreFilter;
    filters.score[score] = !filters.score[score];
    return true;
  }
  if (group === 'selection' && value === 'selected') {
    filters.selection = filters.selection === 'neutral' ? 'include' : filters.selection === 'include' ? 'exclude' : 'neutral';
    return true;
  }
  if (group === 'kind' && allKindFilters.some(kind => kind === value)) {
    const kind = value as KindFilter;
    filters.kind[kind] = !filters.kind[kind];
    return true;
  }
  return false;
}

/** Включает всю группу, а при полностью включённой группе очищает её. */
export function toggleFilterGroup(filters: DisplayFilters, group: string | undefined, media: ListMedia = 'anime'): boolean {
  if (group !== 'status' && group !== 'score' && group !== 'kind') return false;
  const conditions: Record<string, boolean> = filters[group];
  const values = group === 'kind' ? kindFilters(media) : Object.keys(conditions);
  const enabled = !values.every(value => conditions[value]);
  for (const value of values) conditions[value] = enabled;
  return true;
}

/** Не ограничивает пустые группы; активные группы пересекаются, значения внутри объединяются. */
export function visibleEntries(collection: Pick<Collection, 'entries' | 'selectedIds' | 'animes' | 'media'>, filters: DisplayFilters): ListEntry[] {
  const selected = new Set(collection.selectedIds);
  const statusesActive = Object.values(filters.status).some(Boolean);
  const scoresActive = Object.values(filters.score).some(Boolean);
  const media = listMedia(collection);
  const kindsActive = kindFilters(media).some(kind => filters.kind[kind]);
  const unknown = unknownKind(media);
  const kinds = new Map(collection.animes.map(work => [work.id, work.kind ?? unknown]));
  return collection.entries.filter(entry => (!statusesActive || entry.status !== null && filters.status[entry.status])
    && (!scoresActive || filters.score[entry.originalScore === null ? 'unrated' : String(entry.originalScore) as ScoreFilter])
    && (!kindsActive || filters.kind[kinds.get(entry.animeId) ?? unknown])
    && (filters.selection === 'neutral' || selected.has(entry.animeId) === (filters.selection === 'include')));
}

/** Хранит фильтр неизвестного типа отдельно для каждого каталога. */
function unknownKind(media: ListMedia): 'unknown' | 'unknown-manga' {
  return media === 'manga' ? 'unknown-manga' : 'unknown';
}
