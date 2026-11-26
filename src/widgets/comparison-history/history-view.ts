import type { Work, Collection } from '../../entities/collection/model';
import { escapeHtml } from '../../shared/lib/escape-html';
import { renderButton } from '../../shared/ui/button';
import { activeActions, effectiveAnswers, isRelation } from '../../entities/sorting/journal';
import type { SortingEvent } from '../../entities/sorting/session';
import { cover, title } from '../../entities/anime/anime-card';
import { exportCollectionButton } from '../../features/backup/export-button';
import { panelGroupToggle } from '../panel-group-toggle';

/** Параметры истории, подготовленные для её отдельного участка. */
export interface HistoryPanelOptions {
    collapsed: boolean;
    answers: readonly SortingEvent[];
    revisionOpen: boolean;
}

/** Сохраняет одинаковые заголовок, сворачивание и содержимое истории на двух этапах. */
export function historyPanel(collection: Collection, { collapsed, answers, revisionOpen }: HistoryPanelOptions): string {
    return `<section class="panel-section comparison-panel-history ${collapsed ? 'is-collapsed' : ''}" aria-labelledby="comparison-history-heading">
    <div class="panel-section-heading">
      <h2 id="comparison-history-heading">${panelGroupToggle('history', 'История сравнений', collapsed)}</h2>
      ${exportCollectionButton()}
    </div>
    <div id="panel-history-options" class="panel-section-content" ${collapsed ? 'hidden' : ''}>
    ${collapsed ? '' : comparisonHistory(collection, answers, revisionOpen)}
    </div></section>`;
}

/** Показывает действующие решения всех сессий коллекции от новых к старым. */
function comparisonHistory(collection: Collection, answers: readonly SortingEvent[], revisionOpen: boolean): string {
    const archived = (collection.archivedSessions ?? []).map(session => [...effectiveAnswers(activeActions(session.history)).values()]);
    const sessions = [answers, ...archived.reverse()];
    const animes = new Map(collection.animes.map(anime => [anime.id, anime]));
    return sessions.map((answers, index) => {
        const current = index === 0;
        const events = answers.filter(event => isRelation(event.answer)).reverse();
        if (!current && events.length === 0) return '';
        const heading = sessions.length > 1 ? `<h3 class="small muted">Сессия ${sessions.length - index}${current ? ' · текущая' : ''}</h3>` : '';
        const list = events.length === 0 ? '<p class="small muted">Ответов пока нет.</p>'
            : `<ol class="comparison-history-list">${events.map(event => historyEntry(event, animes, current, revisionOpen)).join('')}</ol>`;
        return `<section class="comparison-history-session">${heading}${list}</section>`;
    }).join('');
}

/** Оформляет пару и добавляет редактирование только для ответа текущей сессии. */
function historyEntry(event: SortingEvent, animes: ReadonlyMap<string, Work>, current: boolean, revisionOpen: boolean): string {
    const left = animes.get(event.leftId ?? '');
    const right = animes.get(event.rightId ?? '');
    const leftTitle = left ? title(left) : event.leftId ? `Тайтл #${event.leftId}` : '—';
    const rightTitle = right ? title(right) : event.rightId ? `Тайтл #${event.rightId}` : '—';
    const pair = `<span class="history-sequence">${event.sequence}</span><span class="history-pair">${historyPoster(left, leftTitle, event.answer === 'right')}<span class="history-relation" aria-label="${event.answer === 'tie' ? 'Одинаково' : 'Принятое предпочтение'}">${event.answer === 'tie' ? '=' : '/'}</span>${historyPoster(right, rightTitle, event.answer === 'left')}</span>`;
    if (current) return `<li class="comparison-history-item"><div class="history-row">${pair}
      ${renderButton({
        label: `Пересмотреть ответ № ${event.sequence}: ${leftTitle} / ${rightTitle}`,
        variant: 'icon', className: 'history-revise-button', disabled: revisionOpen,
        attributes: { 'data-action': 'revise-pair', 'data-event-id': event.id, title: 'Пересмотреть ответ' },
        iconPaths: '<path d="m14 6 4 4M5 19l4-.8L20 7l-4-4L5 14z"/>',
      })}
    </div></li>`;

    return `<li><details class="comparison-history-item" data-history-event="${escapeHtml(event.id)}"><summary class="history-row" title="Решение № ${event.sequence}">${pair}
      <span class="history-edit" aria-hidden="true">⋯</span></summary>
      <p class="small muted">${escapeHtml(leftTitle)} / ${escapeHtml(rightTitle)}<br>${event.answer === 'tie' ? 'Одинаково' : event.answer === 'left' ? 'Предпочитаю слева' : 'Предпочитаю справа'}</p>
    </details></li>`;
}

/** Подписывает миниатюру и отмечает проигравшую сторону независимо от обложки. */
function historyPoster(anime: Work | undefined, caption: string, loser: boolean): string {
    return `<span class="history-poster ${loser ? 'history-loser' : ''}" title="${escapeHtml(caption)}" ${loser ? `aria-label="Проигравший тайтл: ${escapeHtml(caption)}"` : ''}>${anime ? cover(anime) : '<span class="cover-placeholder">Нет обложки</span>'}</span>`;
}
