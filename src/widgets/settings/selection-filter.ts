import type { FilterMode } from '../../features/selection/filters';

const states = {
    neutral: { current: 'все произведения', next: 'показать только отмеченные', checked: 'false', path: '' },
    include: { current: 'только отмеченные', next: 'показать только неотмеченные', checked: 'true', path: 'm4 10 4 4 8-8' },
    exclude: { current: 'только неотмеченные', next: 'показать все', checked: 'mixed', path: 'm5 5 10 10M15 5 5 15' },
};

/** Показывает текущее условие выборки и действие следующего нажатия. */
export function selectionFilterToggle(mode: FilterMode, disabled = false): string {
    const { current, next, checked, path } = states[mode];
    const description = `Отмеченные — ${current}. Нажми, чтобы ${next}.`;
    const mark = path
        ? `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.7" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"/></svg>`
        : '';
    return `<button type="button" class="filter-option ternary ${mode}" data-action="cycle-filter" data-filter-group="selection" data-filter-value="selected"
    role="checkbox" aria-checked="${checked}" aria-label="${description}" title="${description}" ${disabled ? 'disabled' : ''}>
    <span class="filter-flag" aria-hidden="true">${mark}</span><span>Отмеченные</span>
  </button>`;
}
