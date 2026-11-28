import { statusLabels } from '../../entities/anime/anime-card';
import type { AnimeDisplayFields } from '../../entities/anime/anime-card';
import { LIST_STATUSES } from '../../entities/collection/model';
import type { ListMedia } from '../../entities/collection/model';
import { kindFilters } from '../../features/selection/filters';
import type { BinaryFilterGroup, DisplayFilters, FilterMode, KindFilter } from '../../features/selection/filters';
import { LIST_SORTS } from '../../features/selection/list-order';
import type { ListSort } from '../../features/selection/list-order';
import { renderButton } from '../../shared/ui/button';
import { renderInput } from '../../shared/ui/input';
import { panelGroupToggle } from '../panel-group-toggle';
import type { PanelGroup } from '../panel-group-toggle';
import { scoreFilter } from './score-filter';
import { selectionFilterToggle } from './selection-filter';

const KIND_LABELS: Record<KindFilter, string> = {
    tv: 'Сериал', movie: 'Фильм', ova: 'OVA', ona: 'ONA', special: 'Спецвыпуск',
    tv_special: 'ТВ-спецвыпуск', music: 'Клип', pv: 'Проморолик', cm: 'Реклама', unknown: 'Неизвестно',
    manga: 'Манга', manhwa: 'Манхва', manhua: 'Маньхуа', one_shot: 'Ваншот',
    doujin: 'Додзинси', light_novel: 'Ранобэ', novel: 'Роман', 'unknown-manga': 'Неизвестно',
};

/** Настройки боковой панели, включая тройной фильтр отметки выбора. */
export interface SettingsOptions {
    collapsedGroups: Readonly<Record<PanelGroup, boolean>>;
    displayFields: Readonly<AnimeDisplayFields>;
    filters: DisplayFilters;
    listSort: ListSort;
    loading: boolean;
}

/** Объединяет подразделы настроек под одним сворачиваемым заголовком. */
export function settingsPanel(state: SettingsOptions, selection: boolean, media: ListMedia = 'anime'): string {
    return `<section class="panel-section panel-settings ${state.collapsedGroups.settings ? 'is-collapsed' : ''}" aria-labelledby="settings-heading">
    <div class="panel-section-heading"><h2 id="settings-heading">${panelGroupToggle('settings', 'Настройки', state.collapsedGroups.settings, selection ? undefined : 'display')}</h2></div>
    <div id="panel-settings-options" class="panel-section-content settings-subgroups" ${state.collapsedGroups.settings ? 'hidden' : ''}>
    ${displaySettings(state)}
    ${selection ? `${listSortControls(state)}${filterControls(state, media)}` : ''}
    </div></section>`;
}

/** Показывает одинаковые настройки содержимого карточек на двух этапах. */
function displaySettings(state: SettingsOptions): string {
    const fields: [keyof SettingsOptions['displayFields'], string][] = [
        ['russianTitle', 'Название (RU)'], ['originalTitle', 'Название (ориг.)'],
        ['status', 'Статус'], ['userScore', 'Моя оценка'], ['communityScore', 'Оценка сообщества'], ['shikimoriLink', 'Ссылка на Shikimori'],
    ];
    return `<section class="settings-subgroup display-settings ${state.collapsedGroups.display ? 'is-collapsed' : ''}" aria-labelledby="display-settings-heading">
    <div class="panel-section-heading"><h3 id="display-settings-heading">${panelGroupToggle('display', 'Отображение', state.collapsedGroups.display)}</h3></div>
    <div id="panel-display-options" class="panel-section-content" ${state.collapsedGroups.display ? 'hidden' : ''}>
    ${fields.map(([key, caption]) => `<label>${renderInput({
        type: 'checkbox', name: 'display-field', value: key, checked: state.displayFields[key], disabled: state.loading,
    })}${caption}</label>`).join('')}</div></section>`;
}

/** Сохраняет группы условий внутри общего подраздела фильтров. */
function filterControls(state: SettingsOptions, media: ListMedia): string {
    const statuses = statusLabels(media);
    return `<section class="settings-subgroup filter-section ${state.collapsedGroups.filters ? 'is-collapsed' : ''}" aria-labelledby="filter-panel-heading">
    <div class="panel-section-heading"><h3 id="filter-panel-heading">${panelGroupToggle('filters', 'Фильтры', state.collapsedGroups.filters)}</h3>
      ${renderButton({ label: 'Сбросить', variant: 'text', disabled: state.loading, attributes: { 'data-action': 'reset-filters' } })}</div>
    <div id="panel-filters-options" class="panel-section-content filter-section-content" ${state.collapsedGroups.filters ? 'hidden' : ''}>
    <div class="selection-filter">${selectionFilterToggle(state.filters.selection, state.loading)}</div>
    ${filterGroup('status', 'Статус', LIST_STATUSES.map(value => [value, statuses[value]]), state)}
    ${filterGroup('kind', 'Тип произведения', kindFilters(media).map(value => [value, KIND_LABELS[value]]), state)}
    ${scoreFilter(state.filters.score, state.collapsedGroups.score, state.loading)}
    </div></section>`;
}

/** Показывает один ключ сортировки и независимый переключатель обратного направления. */
function listSortControls(state: SettingsOptions): string {
    const arrow = state.listSort.reversed ? 'M6 20V4m-3 3 3-3 3 3' : 'M6 4v16m-3-3 3 3 3-3';
    return `<section class="settings-subgroup sort-group ${state.collapsedGroups.sort ? 'is-collapsed' : ''}" aria-labelledby="list-sort-label">
    <div class="panel-section-heading"><h3 id="list-sort-label">${panelGroupToggle('sort', 'Сортировка', state.collapsedGroups.sort)}</h3>
      <button type="button" class="sort-direction" data-action="reverse-list-sort" aria-label="Обратный порядок сортировки" aria-pressed="${state.listSort.reversed}" title="${state.listSort.reversed ? 'Вернуть обычное направление' : 'Изменить направление на обратное'}" ${state.loading ? 'disabled' : ''}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${arrow}M13 6h8M13 12h6M13 18h4"/></svg>
      </button></div>
    <div id="panel-sort-options" class="sort-options" role="radiogroup" aria-labelledby="list-sort-label" ${state.collapsedGroups.sort ? 'hidden' : ''}>${LIST_SORTS.map(option => `<label>${renderInput({
        type: 'radio', name: 'title-sort', value: option.key, checked: state.listSort.key === option.key, disabled: state.loading,
    })}${option.label}</label>`).join('')}</div>
  </section>`;
}

/** Показывает сворачиваемую группу бинарных условий, сохраняя их значения. */
function filterGroup(group: BinaryFilterGroup, label: string, options: [string, string][], state: SettingsOptions): string {
    const conditions: Record<string, boolean> = state.filters[group];
    const active = options.some(([value]) => conditions[value]);
    const allActive = options.every(([value]) => conditions[value]);
    const actionLabel = allActive ? 'Убрать всё' : 'Выбрать всё';
    return `<section class="filter-group" aria-labelledby="filter-${group}-label">
    <div class="panel-section-heading"><h4 id="filter-${group}-label">${panelGroupToggle(group, label, state.collapsedGroups[group])}</h4>
      ${renderButton({
        label: actionLabel, variant: 'text', disabled: state.loading,
        attributes: {
            'data-action': 'select-filter-group', 'data-filter-group': group, 'aria-label': `${actionLabel}: ${label}`,
            title: allActive ? 'Выключить все флаги группы' : 'Включить все флаги группы',
        },
      })}</div>
    <div id="panel-${group}-options" class="filter-options" ${state.collapsedGroups[group] ? 'hidden' : ''}>${options.map(([value, caption]) =>
        filterOption(group, value, caption, `${label}: ${caption}`, !active ? 'neutral' : conditions[value] ? 'include' : 'exclude', state.loading)).join('')}</div>
  </section>`;
}

/** Различает выключенную группу и активные бинарные условия. */
function filterOption(group: BinaryFilterGroup, value: string, caption: string, label: string, mode: FilterMode, disabled: boolean): string {
    const current = mode === 'include' ? 'включено' : mode === 'exclude' ? 'не выбрано' : 'группа без ограничения';
    const next = mode === 'include' ? 'выключить' : 'включить';
    const description = `${label} — ${current}. Нажми, чтобы ${next}.`;
    return `<label class="filter-option binary ${disabled ? 'disabled' : ''}" title="${description}">
    ${renderInput({
        type: 'checkbox', checked: mode === 'include', disabled,
        attributes: { 'data-action': 'cycle-filter', 'data-filter-group': group, 'data-filter-value': value, 'aria-label': description },
    })}<span>${caption}</span></label>`;
}
