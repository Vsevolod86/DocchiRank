import { cardLink, renderAnimeCard, statusLabels, title } from '../../entities/anime/anime-card';
import type { AnimeDisplayFields } from '../../entities/anime/anime-card';
import type { Collection, ListEntry, ListMedia, Work } from '../../entities/collection/model';
import { listMedia } from '../../entities/collection/model';
import { COMPARISON_SCENARIOS } from '../../features/collection/comparison-scenarios';
import type { ComparisonScenario } from '../../features/collection/comparison-scenarios';
import { collectionSummary, importError } from '../../features/import-list/import-feedback';
import type { ImportStatus } from '../../features/import-list/list-import';
import type { DisplayFilters } from '../../features/selection/filters';
import { sortEntries } from '../../features/selection/list-order';
import type { ListSort } from '../../features/selection/list-order';
import { selectionDetails } from '../../features/selection/selection';
import { escapeHtml } from '../../shared/lib/escape-html';
import { renderButton } from '../../shared/ui/button';
import { renderCard } from '../../shared/ui/card';
import { renderInput } from '../../shared/ui/input';

/** Настройки выборки и состояние, которое показывает виджет набора. */
export interface SelectionViewOptions {
    cardLayout: 'compact' | 'large' | 'list';
    displayFields: Readonly<AnimeDisplayFields>;
    filters: DisplayFilters;
    listSort: ListSort;
    scenario: ComparisonScenario;
    import: Readonly<ImportStatus>;
    comparisonError: string | null;
    comparisonComplete: boolean;
}

/** Показывает доступные произведения с независимыми флажками выбора. */
export function selectionView(collection: Collection, state: SelectionViewOptions, canCompare: boolean): string {
    const media = listMedia(collection);
    const details = selectionDetails(collection, state.filters);
    const entries = sortEntries(collection, details.entries, state.listSort);
    const animes = new Map(collection.animes.map(anime => [anime.id, anime]));
    const refresh = collection.profile.source === 'shikimori' ? renderButton({
        label: 'Обновить список', variant: 'icon', disabled: state.import.loading,
        attributes: { 'data-action': 'refresh', title: 'Обновить список' },
        iconPaths: '<path d="M20 10a8 8 0 0 0-14-5L3 8m0-5v5h5m-4 6a8 8 0 0 0 14 5l3-3m0 5v-5h-5"/>',
    }) : '';
    return `<section>
    <header class="selection-heading">
      ${collectionSummary(collection.profile.nickname, state.import, 'Набор загружен.', refresh)}
      ${importError(state.import)}
      <h1 tabindex="-1">Что будем сравнивать?</h1><p class="lead">Выбери ${media === 'manga' ? 'мангу и ранобэ' : 'аниме'} для своего рейтинга.</p>
    </header>
    ${scenarioCards(collection, state, canCompare)}
    ${state.comparisonError ? `<p class="import-error" role="alert">${escapeHtml(state.comparisonError)}</p>` : ''}
    <div class="selection-content">
    <div class="selection-toolbar"><div><span id="selection-count" role="status">${details.countLabel}</span><span class="filter-count" role="status">Показано: ${entries.length} из ${collection.entries.length}</span></div>
      <div class="selection-controls"><div class="text-actions"><button data-action="select-all" title="Переключить выбор всех показанных тайтлов" ${state.import.loading || entries.length === 0 ? 'disabled' : ''}>${details.actionLabel}</button></div>
      ${layoutControls(state)}</div></div>
    ${entries.length === 0 ? `<p class="empty-state">${collection.entries.length === 0 ? 'Список пока пуст.' : 'Нет произведений по заданным фильтрам.'}</p>` : ''}
    ${state.cardLayout === 'list' ? selectionTable(collection, entries, state) : `<div id="anime-cards" class="anime-grid ${state.cardLayout}">${entries.map(entry => {
        const anime = animes.get(entry.animeId)!;
        return selectionCard(anime, entry, {
            fields: state.displayFields, media,
            selected: details.selected.has(anime.id), disabled: state.import.loading,
        });
    }).join('')}</div>`}
    </div>
  </section>`;
}

/** Добавляет к карточке произведения флажок выбора. */
export function selectionCard(anime: Work, entry: ListEntry, { fields, media = 'anime', selected, disabled }: {
    fields: Readonly<AnimeDisplayFields>; media?: ListMedia; selected: boolean; disabled: boolean;
}): string {
    return renderAnimeCard(anime, entry, {
        tag: 'label', fields, media, selected, attributes: { 'data-anime': anime.id },
        coverControl: animeSelectionInput(anime, selected, disabled),
    });
}

/** Объясняет три сценария и размещает переход внутри выбранной карточки. */
function scenarioCards(collection: Collection, state: SelectionViewOptions, canCompare: boolean): string {
    return `<section class="comparison-scenarios" aria-labelledby="scenario-heading">
    <h2 id="scenario-heading">Что хочешь сделать с рейтингом?</h2>
    <div class="scenario-grid">${COMPARISON_SCENARIOS.map(scenario => {
        const active = state.scenario === scenario.key;
        const available = scenario.available && (scenario.key === 'new' || collection.orderedIds.length > 0);
        return renderCard({ tag: 'article', padded: false, className: `scenario-card ${active ? 'active' : ''} ${available ? '' : 'unavailable'}`, contentMarkup: `
        <label class="scenario-option">${renderInput({
            type: 'radio', name: 'comparison-scenario', value: scenario.key, checked: active, disabled: !available || state.import.loading,
        })}
          <span><strong class="card-title">${scenario.title}</strong><span class="scenario-description">${scenario.description}</span></span></label>
        ${!available ? '<p class="scenario-requirement">Сначала построй порядок.</p>' : ''}
        ${active ? `<div class="scenario-action">${renderButton({
            label: 'Перейти к сравнению', variant: 'primary', disabled: !canCompare || state.import.loading, attributes: { 'data-action': 'start-comparison' },
        })}
          <p id="selection-hint" class="muted small" ${canCompare ? 'hidden' : ''}>${collection.selectedIds.length === 0 ? 'Выбери хотя бы один тайтл.' : state.scenario === 'add' ? 'Выбери новые тайтлы, которых ещё нет в порядке.' : 'Сначала построй порядок.'}</p></div>` : ''}
        ` });
    }).join('')}</div>
    ${collection.session ? renderButton({
        label: state.comparisonComplete ? 'Посмотреть текущий результат' : 'Продолжить текущее сравнение',
        variant: 'text', attributes: { 'data-action': 'resume-comparison' },
    }) : ''}
  </section>`;
}

/** Показывает три сегмента со значками и доступными названиями форматов. */
function layoutControls(state: SelectionViewOptions): string {
    const layouts: { key: SelectionViewOptions['cardLayout']; label: string; icon: string }[] = [
        { key: 'large', label: 'Крупные карточки', icon: '<rect x="3" y="3" width="7" height="8" rx="1"/><rect x="14" y="3" width="7" height="8" rx="1"/><rect x="3" y="15" width="7" height="6" rx="1"/><rect x="14" y="15" width="7" height="6" rx="1"/>' },
        { key: 'compact', label: 'Средние карточки', icon: '<rect x="3" y="4" width="5" height="6" rx="1"/><path d="M11 5h10m-10 4h7"/><rect x="3" y="14" width="5" height="6" rx="1"/><path d="M11 15h10m-10 4h7"/>' },
        { key: 'list', label: 'Список', icon: '<path d="M8 5h13M8 12h13M8 19h13M3 5h.01M3 12h.01M3 19h.01"/>' },
    ];
    return `<div class="view-switch" role="group" aria-label="Формат отображения">${layouts.map(layout =>
        `<button type="button" data-action="set-card-layout" data-layout="${layout.key}" aria-label="${layout.label}" title="${layout.label}" aria-pressed="${state.cardLayout === layout.key}" aria-controls="anime-cards" ${state.import.loading ? 'disabled' : ''}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${layout.icon}</svg>
    </button>`).join('')}</div>`;
}

/** Формирует один и тот же флажок выбора произведения для карточки и таблицы. */
function animeSelectionInput(anime: Work, checked: boolean, disabled: boolean, id?: string): string {
    return renderInput({
        type: 'checkbox', name: 'anime', value: anime.id, checked, disabled,
        attributes: { id, 'aria-label': `Выбрать: ${title(anime)}` },
    });
}

/** Показывает выбор произведений в таблице без обложек. */
function selectionTable(collection: Collection, entries: ListEntry[], state: SelectionViewOptions): string {
    const statuses = statusLabels(listMedia(collection));
    const animes = new Map(collection.animes.map(anime => [anime.id, anime]));
    const selected = new Set(collection.selectedIds);
    const fields = state.displayFields;
    return `<div id="anime-cards" class="anime-table-wrap" role="region" aria-label="Список тайтлов" tabindex="0">
    <table class="anime-table" aria-label="Набор тайтлов">
      <colgroup><col class="table-selection"><col>${fields.status ? '<col class="table-status">' : ''}${fields.userScore ? '<col class="table-score">' : ''}${fields.communityScore ? '<col class="table-community-score">' : ''}</colgroup>
      <thead><tr><th scope="col" aria-label="Выбор"></th>${sortColumn('alphabet', 'Название', state)}${fields.status ? sortColumn('status', 'Статус', state) : ''}${fields.userScore ? sortColumn('my-score', 'Моя оценка', state) : ''}${fields.communityScore ? sortColumn('community-score', 'Оценка Shikimori', state) : ''}</tr></thead>
      <tbody>${entries.map(entry => {
        const anime = animes.get(entry.animeId)!;
        return `<tr class="anime-row ${selected.has(anime.id) ? 'selected' : ''}" data-anime="${escapeHtml(anime.id)}" title="${escapeHtml(title(anime))}">
          <td>${animeSelectionInput(anime, selected.has(anime.id), state.import.loading, `list-anime-${anime.id}`)}</td>
          <th scope="row"><div class="table-title"><label for="list-anime-${escapeHtml(anime.id)}">${fields.russianTitle ? `<span data-card-field="russianTitle">${escapeHtml(title(anime))}</span>` : ''}${fields.originalTitle && (!fields.russianTitle || anime.name !== title(anime)) ? `<span class="table-original-title" data-card-field="originalTitle" lang="en">${escapeHtml(anime.name)}</span>` : ''}</label>${fields.shikimoriLink ? cardLink(anime) : ''}</div></th>
          ${fields.status ? `<td data-card-field="status">${entry.status === null ? '—' : statuses[entry.status]}</td>` : ''}${fields.userScore ? `<td class="source-score" data-card-field="userScore">${entry.originalScore ?? '—'}</td>` : ''}${fields.communityScore ? `<td class="source-score" data-card-field="communityScore">${anime.communityScore ?? '—'}</td>` : ''}
        </tr>`;
    }).join('')}</tbody>
    </table>
  </div>`;
}

/** Отмечает общий ключ и фактическое направление сортировки в заголовке колонки. */
function sortColumn(key: ListSort['key'], caption: string, state: SelectionViewOptions): string {
    const active = state.listSort.key === key;
    const score = key === 'my-score' || key === 'community-score';
    const ascending = state.listSort.reversed ? score : !score;
    const arrow = !active ? 'M8 2v12m-3-9 3-3 3 3m-6 6 3 3 3-3'
        : ascending ? 'M8 14V2m-3 3 3-3 3 3' : 'M8 2v12m-3-3 3 3 3-3';
    return `<th scope="col" class="sortable-column" ${active ? `aria-sort="${ascending ? 'ascending' : 'descending'}"` : ''}>
    <button type="button" class="column-sort" data-action="sort-by-column" data-sort-key="${key}" title="${active ? 'Изменить направление сортировки' : `Сортировать: ${caption}`}" ${state.import.loading ? 'disabled' : ''}>
      <span>${caption}</span><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${arrow}"/></svg>
    </button>
  </th>`;
}
