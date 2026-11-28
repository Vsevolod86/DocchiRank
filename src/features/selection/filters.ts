import { SELECTION_DEFAULTS } from '../../config/selection';
import { LIST_KINDS, LIST_STATUSES, listMedia } from '../../entities/collection/model';
import type { Collection, ListEntry, ListMedia, ListStatus, Score, WorkKind } from '../../entities/collection/model';

export type FilterMode = 'neutral' | 'include' | 'exclude';
/** Границы личной оценки и независимый режим просмотра тайтлов без оценок. */
export interface ScoreRange {
  min: Score;
  max: Score;
  unratedOnly: boolean;
}
export type KindFilter = WorkKind | 'unknown' | 'unknown-manga';
const allKindFilters = [...kindFilters('anime'), ...kindFilters('manga')];

/** Возвращает варианты фильтра по типу для каталога текущего списка. */
export function kindFilters(media: ListMedia): KindFilter[] {
  return [...LIST_KINDS[media], unknownKind(media)];
}

/** Условия статуса, типа, оценки и отметки выбора. */
export interface DisplayFilters {
  status: Record<ListStatus, boolean>;
  score: ScoreRange;
  kind: Record<KindFilter, boolean>;
  selection: FilterMode;
}

export type BinaryFilterGroup = 'status' | 'kind';

/** Оставляет все группы без ограничений с выключенными флагами. */
export function createDisplayFilters(): DisplayFilters {
  return {
    status: Object.fromEntries(LIST_STATUSES.map(status => [status, false])) as Record<ListStatus, boolean>,
    score: { min: 1, max: 10, unratedOnly: false },
    kind: Object.fromEntries(allKindFilters.map(kind => [kind, false])) as Record<KindFilter, boolean>,
    selection: 'neutral',
  };
}

/** Готовит начальный отбор просмотренных или прочитанных произведений. */
export function initialDisplayFilters(media: ListMedia): DisplayFilters {
  const filters = createDisplayFilters();
  for (const status of SELECTION_DEFAULTS.statuses) filters.status[status] = true;
  for (const kind of SELECTION_DEFAULTS.kinds[media]) filters.kind[kind] = true;
  filters.score = { ...SELECTION_DEFAULTS.score };
  filters.selection = SELECTION_DEFAULTS.selection;
  return filters;
}

/** Проверяет условие из DOM и переключает бинарное значение либо тройной флаг отметки. */
export function cycleDisplayFilter(filters: DisplayFilters, group: string | undefined, value: string | undefined): boolean {
  if (group === 'status' && LIST_STATUSES.some(status => status === value)) {
    const status = value as ListStatus;
    filters.status[status] = !filters.status[status];
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
  if (group !== 'status' && group !== 'kind') return false;
  const conditions: Record<string, boolean> = filters[group];
  const values = group === 'kind' ? kindFilters(media) : Object.keys(conditions);
  const enabled = !values.every(value => conditions[value]);
  for (const value of values) conditions[value] = enabled;
  return true;
}

/** Меняет границу оценки, сохраняя корректный диапазон при встрече бегунков. */
export function withScoreBound(range: ScoreRange, bound: 'min' | 'max', value: number): ScoreRange {
  if (range.unratedOnly || !Number.isInteger(value) || value < 1 || value > 10) return range;
  const score = value as Score;
  return {
    min: bound === 'min' ? (score <= range.max ? score : range.max) : range.min,
    max: bound === 'max' ? (score >= range.min ? score : range.min) : range.max,
    unratedOnly: false,
  };
}

/** Не ограничивает пустые группы; активные группы пересекаются. */
export function visibleEntries(collection: Pick<Collection, 'entries' | 'selectedIds' | 'animes' | 'media'>, filters: DisplayFilters): ListEntry[] {
  const selected = new Set(collection.selectedIds);
  const statusesActive = Object.values(filters.status).some(Boolean);
  const { min, max, unratedOnly } = filters.score;
  const media = listMedia(collection);
  const kindsActive = kindFilters(media).some(kind => filters.kind[kind]);
  const unknown = unknownKind(media);
  const kinds = new Map(collection.animes.map(work => [work.id, work.kind ?? unknown]));
  return collection.entries.filter(entry => (!statusesActive || entry.status !== null && filters.status[entry.status])
    && (entry.originalScore === null ? unratedOnly || min === 1 && max === 10
      : !unratedOnly && entry.originalScore >= min && entry.originalScore <= max)
    && (!kindsActive || filters.kind[kinds.get(entry.animeId) ?? unknown])
    && (filters.selection === 'neutral' || selected.has(entry.animeId) === (filters.selection === 'include')));
}

/** Хранит фильтр неизвестного типа отдельно для каждого каталога. */
function unknownKind(media: ListMedia): 'unknown' | 'unknown-manga' {
  return media === 'manga' ? 'unknown-manga' : 'unknown';
}
