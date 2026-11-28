import { comparisonSelection } from '../../entities/collection/comparison';
import type { Collection } from '../../entities/collection/model';
import { visibleEntries } from './filters';
import type { DisplayFilters } from './filters';

/** Готовит видимые записи и состояние выборки для счётчика и массового действия. */
export function selectionDetails(collection: Collection, filters: DisplayFilters) {
  const entries = visibleEntries(collection, filters);
  const selected = new Set(collection.selectedIds);
  const visibleSelected = entries.filter(entry => selected.has(entry.animeId)).length;
  const hidden = selected.size - visibleSelected;
  const allSelected = entries.length > 0 && visibleSelected === entries.length;
  return {
    entries, selected, allSelected,
    countLabel: `Выбрано: ${selected.size}${hidden ? ` (вне фильтра: ${hidden})` : ''}`,
    actionLabel: allSelected ? 'Снять видимые отметки' : 'Отметить видимые',
  };
}

/** Меняет отметку произведения из исходного списка активной коллекции. */
export function selectAnime(collection: Collection, id: string, checked: boolean): boolean {
  if (!collection.entries.some(entry => entry.animeId === id)) return false;
  const selected = new Set(collection.selectedIds);
  if (checked) selected.add(id);
  else selected.delete(id);
  setSelection(collection, selected);
  return true;
}

/** Переключает видимые отметки, сохраняя выбор скрытых произведений. */
export function toggleVisibleSelection(collection: Collection, filters: DisplayFilters): boolean {
  const { entries, selected, allSelected } = selectionDetails(collection, filters);
  if (entries.length === 0) return false;
  for (const { animeId } of entries) {
    if (allSelected) selected.delete(animeId);
    else selected.add(animeId);
  }
  setSelection(collection, selected);
  return true;
}

/** Запоминает исходные отметки незавершённого сравнения, пока пользователь редактирует набор. */
function setSelection(collection: Collection, selected: Set<string>): void {
  if (collection.session?.progress.current && !collection.comparisonSelection) {
    const snapshot = comparisonSelection(collection);
    collection.comparisonSelection = { ...snapshot, ids: [...snapshot.ids] };
  }
  collection.selectedIds = [...selected];
}
