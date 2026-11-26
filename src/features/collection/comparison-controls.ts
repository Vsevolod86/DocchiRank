import { animeTitle } from '../../entities/anime/anime-card';
import type { Collection } from '../../entities/collection/model';
import { escapeHtml } from '../../shared/lib/escape-html';
import { renderButton } from '../../shared/ui/button';
import type { CollectionView } from './collection-commands';

/** Объясняет отказ или просит явно пересмотреть связанные конфликтующие решения. */
export function comparisonFeedback(collection: Collection, state: Pick<CollectionView, 'comparisonError' | 'comparisonConflict'>): string {
    const conflict = state.comparisonConflict;
    return `${state.comparisonError && !conflict ? `<p class="import-error" role="alert">${escapeHtml(state.comparisonError)}</p>` : ''}
    ${conflict ? `<section class="comparison-conflict" role="alert" aria-labelledby="conflict-heading"><h2 id="conflict-heading" tabindex="-1">Решения противоречат друг другу</h2><p>${escapeHtml(conflict.message)}</p>
      <p>Для нового ответа нужно пересмотреть связанные решения (${conflict.eventIds.length}). Исходные записи останутся в журнале.</p>
      <ul>${conflict.eventIds.map(id => { const event = collection.session?.history.find(item => item.id === id); return `<li>${event ? `№ ${event.sequence}: ${escapeHtml(animeTitle(collection, event.leftId))} / ${escapeHtml(animeTitle(collection, event.rightId))}` : escapeHtml(id)}</li>`; }).join('')}</ul>
      <div class="comparison-actions">
        ${renderButton({ label: 'Пересмотреть связанные решения', variant: 'primary', attributes: { 'data-action': 'confirm-revision' } })}
        ${renderButton({ label: 'Оставить прежнее', variant: 'secondary', attributes: { 'data-action': 'cancel-revision' } })}
      </div></section>` : ''}`;
}

/** Показывает общее действие отмены на экранах сравнения и результата. */
export function undoComparisonButton(disabled: boolean, shortcut?: string): string {
    return renderButton({
        label: 'Отменить последнее действие', variant: 'secondary', disabled,
        attributes: { 'data-action': 'undo-comparison', 'aria-keyshortcuts': shortcut },
    });
}
