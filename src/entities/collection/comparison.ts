import type { Collection, ComparisonMode } from './model';
import { ratingAssignments } from './ratings';
import { PairwiseSorterEngine } from '../sorting/engine';
import type { Item } from '../sorting/session';

/** Проверяет наличие выбранных произведений и готовой базы для выбранного сценария. */
export function canStartComparison(collection: Collection, scenario: ComparisonMode): boolean {
  if (collection.selectedIds.length === 0) return false;
  if (scenario === 'new') return true;
  if (collection.orderedIds.length === 0) return false;
  return scenario === 'review' || collection.selectedIds.some(id => !collection.orderedIds.includes(id));
}

/** Начинает новый цикл, сохраняя прежнюю сессию и взаимный порядок оставшейся базы. */
export function beginComparison(collection: Collection, scenario: ComparisonMode, chosenIds = collection.selectedIds): Collection {
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
  const item = comparisonItemLookup(collection);
  const engine = new PairwiseSorterEngine({ known: knownIds.map(group => group.map(item)), pending: pendingIds.map(item) });
  const ratingTransition = collection.ratingTransition
    ? { ...structuredClone(collection.ratingTransition), changedIds: [...new Set([...collection.ratingTransition.changedIds, ...pendingIds])] }
    : collection.ratings.topScore !== null && previousGroups.length > 0
      ? { scores: ratingAssignments(previousGroups, collection.ratings), changedIds: [...pendingIds] }
      : null;
  return {
    ...structuredClone(collection),
    session: engine.getState(), orderedIds: engine.getView().orderedGroups.flat(),
    comparisonSelection: { ids: [...collection.selectedIds], scenario },
    archivedSessions: [...structuredClone(collection.archivedSessions ?? []), ...(collection.session ? [structuredClone(collection.session)] : [])],
    ...(ratingTransition ? { ratingTransition } : {}),
  };
}

/** Возвращает отметки, соответствующие текущей сессии, включая сохранения без этого поля. */
export function comparisonSelection(collection: Collection): NonNullable<Collection['comparisonSelection']> {
  return collection.comparisonSelection ?? (collection.session?.input.known.length === 0
    ? { ids: collection.session.input.pending, scenario: 'new' }
    : { ids: collection.selectedIds });
}

/** Применяет изменения отметок к незавершённому сравнению, сохраняя готовую базу. */
export function updateComparisonSelection(collection: Collection): Collection {
  const session = collection.session;
  if (!session?.progress.current) return collection;

  const previousSelection = comparisonSelection(collection);
  const before = new Set(previousSelection.ids);
  const selected = new Set(collection.selectedIds);
  if (before.size === selected.size && [...before].every(id => selected.has(id))) return collection;

  const known = new Set(session.input.known.flat());
  const pending = new Set(session.input.pending.filter(id => !before.has(id) || selected.has(id)));
  for (const id of selected) if (!before.has(id) && !known.has(id)) pending.add(id);
  if (known.size + pending.size === 0) throw new Error('Выбери хотя бы один тайтл.');

  const updated = structuredClone(collection);
  updated.comparisonSelection = { ...previousSelection, ids: [...selected] };
  if (pending.size === session.input.pending.length && session.input.pending.every(id => pending.has(id))) return updated;

  const item = comparisonItemLookup(collection);
  const engine = PairwiseSorterEngine.restore(session).withPending([...pending].map(item));
  updated.session = engine.getState();
  updated.orderedIds = updated.session.progress.orderedIds;
  if (updated.ratingTransition) {
    const { changedIds, choices } = updated.ratingTransition;
    updated.ratingTransition.changedIds = [...new Set([...changedIds.filter(id => known.has(id) || pending.has(id)), ...pending])];
    if (choices) updated.ratingTransition.choices = Object.fromEntries(
      Object.entries(choices).filter(([id]) => known.has(id) || pending.has(id)));
  }
  return updated;
}

/** Готовит неизменяемый снимок тайтла для движка по данным текущей коллекции. */
function comparisonItemLookup(collection: Collection): (id: string) => Item {
  const items = new Map(collection.animes.map(anime => [anime.id, anime]));
  const entries = new Map(collection.entries.map(entry => [entry.animeId, entry]));
  return id => {
    const anime = items.get(id);
    const entry = entries.get(id);
    if (!anime || !entry) throw new Error('В коллекции отсутствуют данные произведения.');
    return { id, title: anime.russian || anime.name, userScore: entry.originalScore, communityScore: anime.communityScore };
  };
}
