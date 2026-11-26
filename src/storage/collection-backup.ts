import { createCollection } from '../entities/collection/collection';
import type { Collection, RatingScale, RatingTransition, Score } from '../entities/collection/model';
import { scaleToCutoffs } from '../entities/collection/ratings';
import { PairwiseSorterEngine } from '../entities/sorting/engine';
import { storedSortingSession } from '../entities/sorting/session';
import type { SortingSession } from '../entities/sorting/session';
import { cacheSnapshot, validSnapshot } from './snapshot';
import { BACKUP_SCHEMA_VERSION } from './backup';
import type { BackupFile } from './backup';

/** Сохраняет полную коллекцию с версиями сессий и сетевыми ссылками вместо изображений. */
export function serializeCollectionBackup(collection: Collection): string {
  return JSON.stringify(packCollection(copyCollectionForStorage(collection)), null, 2);
}

/** Проверяет резервную копию целиком; при ошибке не возвращает частично восстановленные данные. */
export function parseCollectionBackup(text: string): Collection {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('Не удалось прочитать JSON резервной копии.');
  }
  return readCollectionBackup(value);
}

/** Проверяет версию и содержимое уже разобранной резервной копии. */
export function readCollectionBackup(value: unknown): Collection {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Неверный формат резервной копии DocchiRank.');
  const data = value as Record<string, unknown>;
  if (data.schemaVersion !== BACKUP_SCHEMA_VERSION) throw new Error('Эта версия резервной копии DocchiRank не поддерживается.');
  return validateCollection(data.collection, true);
}

/** Копирует проверенную коллекцию, исключая встроенные изображения из сохраняемого состояния. */
export function copyCollectionForStorage(collection: Collection): Collection {
  return validateCollection({ ...collection, ...cacheSnapshot(collection) });
}

/** Готовит проверенную коллекцию к записи, опуская порядок, если его можно восстановить. */
export function packCollection(collection: Collection): BackupFile {
  const { session, archivedSessions, orderedIds, ...data } = collection;
  return {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    collection: {
      ...data, session: session ? storedSortingSession(session) : null,
      ...(session ? {} : { orderedIds }),
      ...(archivedSessions ? { archivedSessions: archivedSessions.map(storedSortingSession) } : {}),
    },
  };
}

/** Проверяет модель и выводит порядок из сессии в сокращённой копии. */
function validateCollection(value: unknown, stored = false): Collection {
  if (!validSnapshot(value)) throw new Error('Резервная копия содержит неверные данные списка.');
  const data = value as Collection;
  if (typeof data.id !== 'string' || !data.id.trim() || typeof data.name !== 'string' || !data.name.trim()
    || !Array.isArray(data.selectedIds)) throw new Error('Неверное описание коллекции.');
  const source = cacheSnapshot(data);
  const collection = createCollection(source, data.selectedIds, data.id);
  const listed = new Set(source.entries.map(entry => entry.animeId));
  const session = data.session === null ? null : readSession(data.session, listed, stored);
  const sessionOrder = session?.progress.orderedIds;
  if (stored && session && 'orderedIds' in data) throw new Error('В резервной копии с сессией порядок восстанавливается из журнала.');
  const orderedIds = stored && sessionOrder ? sessionOrder : data.orderedIds;
  if (!Array.isArray(orderedIds) || !validIds(orderedIds, listed)) throw new Error('Установленный порядок содержит повторные или неизвестные ID.');
  if (!stored && sessionOrder && (sessionOrder.length !== orderedIds.length || sessionOrder.some((id, index) => id !== orderedIds[index]))) {
    throw new Error('Порядок коллекции не совпадает с состоянием сравнения.');
  }
  if (data.archivedSessions !== undefined && !Array.isArray(data.archivedSessions)) throw new Error('Неверный архив сессий.');
  const archivedSessions = data.archivedSessions?.map(value => readSession(value, listed, stored));
  const sessionIds = [...(session ? [session] : []), ...(archivedSessions ?? [])].map(value => value.sessionId);
  if (new Set(sessionIds).size !== sessionIds.length) throw new Error('Сессии коллекции содержат повторные идентификаторы.');
  const ratings = readRatings(data.ratings, listed);
  const ratingTransition = data.ratingTransition === undefined ? undefined : readRatingTransition(data.ratingTransition, listed);
  if (!ratingTransition && session && session.progress.pendingIds.length === 0) {
    scaleToCutoffs(session.progress.orderedGroups, ratings);
  }
  return {
    ...collection, name: data.name, orderedIds: [...orderedIds], session, ratings,
    ...(archivedSessions ? { archivedSessions } : {}),
    ...(ratingTransition ? { ratingTransition } : {}),
  };
}

/** Восстанавливает сессию через движок и проверяет наличие всех исходных произведений. */
function readSession(value: unknown, listed: Set<string>, stored: boolean): SortingSession {
  if (stored && value && typeof value === 'object' && 'progress' in value) {
    throw new Error('Развёрнутый снимок сравнения в резервной копии не поддерживается.');
  }
  const session = PairwiseSorterEngine.copyValidatedState(value);
  const ids = [...session.input.known.flat(), ...session.input.pending];
  if (ids.some(id => !listed.has(id))) throw new Error('Сессия ссылается на отсутствующее произведение.');
  return session;
}

/** Проверяет уникальную последовательность ссылок на произведения списка. */
function validIds(value: unknown[], listed: Set<string>): value is string[] {
  return value.every(id => typeof id === 'string' && listed.has(id)) && new Set(value).size === value.length;
}

/** Проверяет сохранённые оценки и опоры независимо от незавершённого повторного размещения. */
function readRatings(value: unknown, listed: Set<string>): RatingScale {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Неверные данные оценок.');
  const scale = value as RatingScale;
  if (!(scale.topScore === null || validScore(scale.topScore)) || !Array.isArray(scale.boundaries)
    || scale.topScore === null && scale.boundaries.length > 0
    || scale.manualStart !== undefined && (scale.manualStart !== true || scale.topScore !== null)) throw new Error('Неверные данные оценок.');
  let previousScore = scale.topScore ?? 10;
  const boundaries = scale.boundaries.map(boundary => {
    if (!boundary || !validScore(boundary.scoreBelow)) throw new Error('Неверная оценка интервала.');
    if (boundary.aboveId !== null && !listed.has(boundary.aboveId)
      || boundary.belowId !== null && !listed.has(boundary.belowId)
      || boundary.aboveId !== null && boundary.aboveId === boundary.belowId
      || boundary.scoreBelow > previousScore) throw new Error('Неверные опоры или оценки интервалов.');
    previousScore = boundary.scoreBelow;
    return { aboveId: boundary.aboveId, belowId: boundary.belowId, scoreBelow: boundary.scoreBelow };
  });
  return { topScore: scale.topScore, boundaries, ...(scale.manualStart ? { manualStart: true } : {}) };
}

/** Проверяет снимок оценок до изменения порядка, не теряя неразрешённый выбор на границе. */
function readRatingTransition(value: unknown, listed: Set<string>): RatingTransition {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Неверные данные переноса оценок.');
  const transition = value as RatingTransition;
  if (!transition.scores || typeof transition.scores !== 'object' || Array.isArray(transition.scores)
    || !Array.isArray(transition.changedIds) || !validIds(transition.changedIds, listed)
    || Object.entries(transition.scores).some(([id, score]) => !listed.has(id) || !validScore(score))) {
    throw new Error('Неверные оценки или ссылки при изменении порядка.');
  }
  if (transition.choices !== undefined && (!transition.choices || typeof transition.choices !== 'object' || Array.isArray(transition.choices)
    || Object.entries(transition.choices).some(([id, score]) => !listed.has(id) || !validScore(score)))) {
    throw new Error('Неверный выбор интервала при изменении порядка.');
  }
  return { scores: { ...transition.scores }, changedIds: [...transition.changedIds],
    ...(transition.choices ? { choices: { ...transition.choices } } : {}),
  };
}

/** Принимает только целочисленные оценки шкалы DocchiRank. */
function validScore(value: unknown): value is Score {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 10;
}
