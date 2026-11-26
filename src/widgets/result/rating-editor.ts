import type { Collection } from '../../entities/collection/model';
import { escapeHtml } from '../../shared/lib/escape-html';
import { renderButton } from '../../shared/ui/button';
import { renderSelect } from '../../shared/ui/select';
import type { ResultViewData } from '../../features/collection/result-view-data';
import type { CollectionView } from '../../features/collection/collection-commands';
import { ratingChart } from './rating-chart';
import { animeTitle } from '../../entities/anime/anime-card';
import { panelGroupToggle } from '../panel-group-toggle';

/** Показывает конфликт переноса и способы его разрешить над таблицей результата. */
export function ratingConflict(message: string, hasChoices: boolean): string {
    return `<div class="import-error rating-conflict">
      <p role="alert">${escapeHtml(message)}</p>
      <div class="rating-placement-actions">
        ${hasChoices ? renderButton({
        label: 'Изменить выбор на границах', variant: 'secondary', attributes: { 'data-action': 'rating-placement-clear' },
    }) : ''}
        ${renderButton({ label: 'Выставить оценки заново', variant: 'primary', attributes: { 'data-action': 'reset-ratings' } })}
      </div>
    </div>`;
}

/** Показывает способы распределения, диаграмму и неразрешённые вставки в общей сворачиваемой группе. */
export function ratingEditor(collection: Collection, { grades, transition }: Pick<ResultViewData, 'grades' | 'transition'>,
    editor: CollectionView['ratingEditor'], collapsed: boolean): string {
    if (transition?.pending.length) {
        return ratingPanel(`
          <p class="small muted">Выбери одну из соседних оценок для этих тайтлов. Оценки остальных сохранятся.</p>${transition.pending.map(pending => `<label class="rating-placement"><span>${escapeHtml(pending.ids.map(id => animeTitle(collection, id)).join(', '))}</span>
            ${renderSelect({
            name: 'rating-placement', attributes: { 'data-placement-id': pending.ids[0]! }, options: [
                { value: '', label: 'Выбери оценку' },
                { value: String(pending.above), label: `${pending.above} / 10` },
                { value: String(pending.below), label: `${pending.below} / 10` },
            ]
        })}</label>`).join('')}
          ${editor.error ? `<p class="import-error" role="alert">${escapeHtml(editor.error)}</p>` : ''}`, collapsed);
    }
    return ratingPanel(`<div class="rating-methods">
        ${renderSelect({
        name: 'rating-method', attributes: { 'aria-label': 'Способ распределения оценок' }, value: editor.method, options: [
            { value: 'manual', label: 'Вручную' }, { value: 'uniform', label: 'Равномерно' }, { value: 'bell', label: 'Колоколообразно' },
        ]
    })}
        ${editor.method === 'bell' ? `<label class="rating-center">Центр${renderSelect({
        name: 'rating-center', attributes: { 'aria-label': 'Центр распределения' }, value: String(editor.center),
        options: Array.from({ length: 19 }, (_, i) => {
            const value = String(1 + i / 2);
            return { value, label: value.replace('.', ',') };
        }),
    })}</label>` : ''}</div>
      ${ratingChart(grades)}
      ${Object.keys(grades).length ? '' : '<p class="small muted">Оценки ещё не назначены.</p>'}
      ${editor.error ? `<p class="import-error" role="alert">${escapeHtml(editor.error)}</p>` : ''}
    `, collapsed);
}

/** Оформляет распределение тем же сворачиваемым заголовком, что настройки и история. */
function ratingPanel(content: string, collapsed: boolean): string {
    return `<section class="panel-section rating-editor ${collapsed ? 'is-collapsed' : ''}" aria-labelledby="rating-editor-heading">
      <div class="panel-section-heading"><h2 id="rating-editor-heading">${panelGroupToggle('distribution', 'Распределение оценок', collapsed)}</h2></div>
      <div id="panel-distribution-options" class="panel-section-content" ${collapsed ? 'hidden' : ''}>${content}</div>
    </section>`;
}

/** Согласует текущие значения элементов ввода с выбранным способом и центром. */
export function syncRatingEditor(panel: HTMLElement, editor: Pick<CollectionView['ratingEditor'], 'method' | 'center'>): void {
    const method = panel.querySelector<HTMLSelectElement>('[name="rating-method"]');
    if (method && method.value !== editor.method) method.value = editor.method;
    const center = panel.querySelector<HTMLSelectElement>('[name="rating-center"]');
    const value = String(editor.center);
    if (center && center.value !== value) center.value = value;
}
