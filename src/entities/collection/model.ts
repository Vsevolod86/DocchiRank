import type { SortingSession } from '../sorting/session';

export type WorkId = string;
export type Score = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
export const LIST_STATUSES = ['planned', 'watching', 'rewatching', 'completed', 'on_hold', 'dropped'] as const;
export type ListStatus = typeof LIST_STATUSES[number];
export const LIST_KINDS = {
  anime: ['tv', 'movie', 'ova', 'ona', 'special', 'tv_special', 'music', 'pv', 'cm'],
  manga: ['manga', 'manhwa', 'manhua', 'one_shot', 'doujin', 'light_novel', 'novel'],
} as const;
export type ListMedia = keyof typeof LIST_KINDS;
export type WorkKind = typeof LIST_KINDS[ListMedia][number];

export const LIST_MEDIA_LABELS: Record<ListMedia, string> = { anime: 'Аниме', manga: 'Манга и ранобэ' };

/** Читает категорию списка, сохраняя значение по умолчанию для сохранённых коллекций аниме. */
export function listMedia(source: Pick<SourceSnapshot, 'media'>): ListMedia {
  return source.media ?? 'anime';
}

/** Сверяет тип произведения с каталогом списка Shikimori. */
export function isWorkKind(value: unknown, media: ListMedia): value is WorkKind {
  return LIST_KINDS[media].some(kind => kind === value);
}

/** Источник списка: профиль, JSON-выгрузка, восстановленная демонстрация или демоданные. */
export interface Profile {
  id: string;
  nickname: string;
  url: string | null;
  source: 'shikimori' | 'shikimori-json' | 'saved-selection' | 'demo';
}

/** Метаданные произведения с ID в пределах каталога Shikimori. */
export interface Work {
  id: WorkId;
  name: string;
  russian: string | null;
  coverUrl: string | null;
  communityScore: number | null;
  kind?: WorkKind | null;
  url: string;
}

/** Запись исходного списка. Статус и личная оценка могут отсутствовать. */
export interface ListEntry {
  id: string;
  animeId: WorkId;
  status: ListStatus | null;
  originalScore: Score | null;
  importedAt: string;
}

/** Снимок одного исходного списка до выбора произведений для коллекции. */
export interface SourceSnapshot {
  /** При отсутствии поля список относится к каталогу аниме. */
  media?: ListMedia;
  profile: Profile;
  animes: Work[];
  entries: ListEntry[];
}

/** Ссылка на коллекцию для быстрого продолжения. */
export interface SavedSelection {
  collectionId: string;
}

/** Разделитель с соседними произведениями и оценкой интервала ниже него. */
export interface RatingBoundary {
  aboveId: WorkId | null;
  belowId: WorkId | null;
  scoreBelow: Score;
}

/** Оценка верхнего интервала и разделители; null означает ненастроенное оценивание. */
export interface RatingScale {
  topScore: Score | null;
  boundaries: RatingBoundary[];
  manualStart?: true;
}

/** Оценки до изменения порядка и произведения, которым заново определяется интервал. */
export interface RatingTransition {
  scores: Record<WorkId, Score>;
  changedIds: WorkId[];
  choices?: Record<WorkId, Score>;
}

/** Независимая коллекция одного профиля с выборкой, порядком и состоянием сортировки. */
export interface Collection extends SourceSnapshot {
  id: string;
  name: string;
  selectedIds: WorkId[];
  orderedIds: WorkId[];
  session: SortingSession | null;
  archivedSessions?: SortingSession[];
  ratings: RatingScale;
  ratingTransition?: RatingTransition;
}
