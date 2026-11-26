import type { Collection } from '../../entities/collection/model';
import type { CollectionView } from '../../features/collection/collection-commands';
import { comparisonFeedback, undoComparisonButton } from '../../features/collection/comparison-controls';
import { renderButton } from '../../shared/ui/button';

/** Показывает компактные таблицы рейтинга, сгруппированные по новой оценке. */
export function resultView(collection: Collection, state: Pick<CollectionView, 'sorting' | 'comparisonError' | 'comparisonConflict'>,
    complete: boolean): string {
    const showShikimoriExport = collection.profile.source !== 'demo';
    return `<section><div class="section-heading"><div><h1 tabindex="-1">${complete ? 'Твой личный рейтинг' : 'Промежуточный рейтинг'}</h1>
    <p class="lead">${complete ? 'Оценки можно менять. Места в рейтинге сохранятся.' : 'Некоторые тайтлы ещё предстоит сравнить.'}</p></div></div>
    ${showShikimoriExport ? '<div id="result-shikimori-export"></div>' : ''}
    ${comparisonFeedback(collection, state)}
    <div id="result-table-section"></div>
    <div class="comparison-actions result-actions">${renderButton({ label: 'Изменить набор', variant: 'secondary', attributes: { 'data-screen': 'selection' } })}
      ${!complete ? renderButton({ label: 'Вернуться к сравнению', variant: 'secondary', attributes: { 'data-action': 'resume-comparison' } }) : ''}
      ${undoComparisonButton(!state.sorting?.canUndo || state.comparisonConflict !== null)}</div>
  </section>`;
}

/** Показывает отдельную загрузку JSON для импорта оценок в Shikimori. */
export function shikimoriExportButton(enabled: boolean): string {
    return renderButton({
        label: 'Скачать оценки в Shikimori', variant: 'secondary', disabled: !enabled,
        attributes: { 'data-action': 'export-shikimori-json', title: enabled ? undefined : 'Заверши сравнение и назначь оценки' },
    });
}
