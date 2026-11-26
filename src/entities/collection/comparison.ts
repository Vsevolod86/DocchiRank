import type { Collection } from './model';
import { ratingAssignments } from './ratings';
import { PairwiseSorterEngine } from '../sorting/engine';
import type { Item } from '../sorting/session';

/** Проверяет наличие выбранных произведений и готовой базы для выбранного сценария. */
export function canStartComparison(collection: Collection, scenario: 'new' | 'add' | 'review'): boolean {
  if (collection.selectedIds.length === 0) return false;
  if (scenario === 'new') return true;
  if (collection.orderedIds.length === 0) return false;
  return scenario === 'review' || collection.selectedIds.some(id => !collection.orderedIds.includes(id));
}

/** Начинает новый цикл, сохраняя прежнюю сессию и взаимный порядок оставшейся базы. */
export function beginComparison(collection: Collection, scenario: 'new' | 'add' | 'review', chosenIds = collection.selectedIds): Collection {
  const listed = new Set(collection.entries.map(entry => entry.animeId));
  if (chosenIds.length === 0 || new Set(chosenIds).size !== chosenIds.length || chosenIds.some(id => !listed.has(id))) {
    throw new Error('Выбери хотя бы одно произведение из списка.');
  }
  const previousGroups = collection.session
    ? PairwiseSorterEngine.restore(collection.session).getView().orderedGroups
    : collection.orderedIds.map(id => [id]);
  if (scenario !== 'new' && previousGroups.length === 0) throw new Error('Сначала построй исходный порядок.');
  const chosen = new Set(chosenIds);
  const knownIds = scenario === 'new' ? [] : previousGroups.map(group => scenario === 'review' ? group.filter(id => !chosen.has(id)) : group).filter(group => group.length > 0);
  const known = new Set(knownIds.flat());
  const pendingIds = chosenIds.filter(id => !known.has(id));
  if (pendingIds.length === 0) throw new Error('В выбранном наборе нет новых произведений для вставки.');
  const items = new Map(collection.animes.map(anime => [anime.id, anime]));
  const entries = new Map(collection.entries.map(entry => [entry.animeId, entry]));
  const item = (id: string): Item => {
    const anime = items.get(id);
    const entry = entries.get(id);
    if (!anime || !entry) throw new Error('В коллекции отсутствуют данные произведения.');
    return { id, title: anime.russian || anime.name, userScore: entry.originalScore, communityScore: anime.communityScore };
  };
  const engine = new PairwiseSorterEngine({ known: knownIds.map(group => group.map(item)), pending: pendingIds.map(item) });
  const ratingTransition = collection.ratingTransition
    ? { ...structuredClone(collection.ratingTransition), changedIds: [...new Set([...collection.ratingTransition.changedIds, ...pendingIds])] }
    : collection.ratings.topScore !== null && previousGroups.length > 0
      ? { scores: ratingAssignments(previousGroups, collection.ratings), changedIds: [...pendingIds] }
      : null;
  return {
    ...structuredClone(collection),
    session: engine.getState(), orderedIds: engine.getView().orderedGroups.flat(),
    archivedSessions: [...structuredClone(collection.archivedSessions ?? []), ...(collection.session ? [structuredClone(collection.session)] : [])],
    ...(ratingTransition ? { ratingTransition } : {}),
  };
}
