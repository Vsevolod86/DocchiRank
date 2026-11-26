import { renderAnimeCard, title } from '../../entities/anime/anime-card';
import type { AnimeDisplayFields } from '../../entities/anime/anime-card';
import type { Collection, Work } from '../../entities/collection/model';
import { listMedia } from '../../entities/collection/model';
import type { EngineView } from '../../entities/sorting/session';
import type { CollectionView } from '../../features/collection/collection-commands';
import { comparisonFeedback, undoComparisonButton } from '../../features/collection/comparison-controls';
import { escapeHtml } from '../../shared/lib/escape-html';
import { renderButton } from '../../shared/ui/button';

/** Сравниваемая пара, состояние пересмотра и настройки карточек сравнения. */
export type ComparisonOptions = Pick<CollectionView, 'sorting' | 'comparisonError' | 'comparisonRevision' | 'comparisonConflict'> & {
    displayFields: Readonly<AnimeDisplayFields>;
    loading: boolean;
};

/** Показывает текущую пару или состояние завершённого сравнения. */
export function comparisonView(collection: Collection, state: ComparisonOptions): string {
    const view = state.sorting;
    if (!view) return `<section><h1 tabindex="-1">Начать сравнение</h1><p class="lead">Выбери сценарий и набор тайтлов.</p>
      ${renderButton({ label: 'К набору', variant: 'primary', attributes: { 'data-screen': 'selection' } })}</section>`;
    const revision = state.comparisonRevision;
    const complete = !revision && view.status === 'complete';
    const current = revision ?? (complete ? null : view.current);
    const left = current && collection.animes.find(anime => anime.id === current.leftId);
    const right = current && collection.animes.find(anime => anime.id === current.rightId);
    const disabled = state.comparisonConflict !== null || state.loading;
    const heading = revision ? 'Пересмотр ответа' : complete ? 'Сравнение завершено' : 'Что тебе понравилось больше?';
    const preferred = revision?.previousAnswer === 'left' ? left : right;
    const previousAnswer = revision?.previousAnswer === 'tie' ? 'одинаково' : preferred ? title(preferred) : '—';
    const lead = revision ? `Прежний ответ — ${escapeHtml(previousAnswer)}. Выбери другой ответ для этой пары.`
        : complete ? 'Все тайтлы из сравнения размещены.'
            : 'Выбери карточку или поставь оба тайтла на одно место.';
    return `<section class="comparison-section">
    <div class="comparison-heading"><div><h1 tabindex="-1">${heading}</h1><p class="lead">${lead}</p></div>
      ${!revision && (complete || view.orderedGroups.length > 0) ? `<div class="comparison-tools">${renderButton({
        label: complete ? 'К результатам' : 'Посмотреть размещённые', variant: complete ? 'primary' : 'secondary',
        attributes: { 'data-screen': 'result' },
    })}</div>` : ''}</div>
    ${revision ? '' : comparisonProgress(view)}
    ${comparisonFeedback(collection, state)}
    ${left && right ? `<div class="comparison-pair large">${comparisonCard(left, collection, state.displayFields, 'left', disabled || revision?.previousAnswer === 'left')}
      <div class="comparison-between">${renderButton({
        label: 'Одинаково', variant: 'secondary', disabled: disabled || revision?.previousAnswer === 'tie',
        attributes: { 'data-action': 'answer', 'data-answer': 'tie', 'aria-keyshortcuts': 'Space' },
    })}
      ${revision ? '' : renderButton({
        label: 'Пропустить', variant: 'secondary', disabled: disabled || !view.canSkip,
        attributes: {
            'data-action': 'answer', 'data-answer': 'skip', 'aria-keyshortcuts': 'Tab',
            title: view.canSkip ? 'Показать другую неизвестную пару, сохранив оба тайтла в сравнении' : 'Другой неизвестной пары сейчас нет',
        },
    })}</div>
      ${comparisonCard(right, collection, state.displayFields, 'right', disabled || revision?.previousAnswer === 'right')}</div>` : ''}
    ${revision ? (state.comparisonConflict ? '' : `<div class="comparison-actions comparison-bottom-actions">
        ${renderButton({ label: 'Отменить пересмотр', variant: 'secondary', attributes: { 'data-action': 'cancel-revision' } })}</div>`)
            : `<div class="comparison-actions comparison-bottom-actions">${undoComparisonButton(!view.canUndo || disabled, 'Control+Z')}
      ${renderButton({ label: 'Изменить набор', variant: 'text', attributes: { 'data-screen': 'selection' } })}</div>`}
  </section>`;
}

/** Показывает подсказку для текущей пары с учётом режима сравнения. */
export function comparisonShortcuts({ sorting, comparisonRevision, comparisonConflict, loading }: ComparisonOptions): string {
    if (loading || comparisonConflict || !(comparisonRevision || sorting?.current)) return '';
    return `<p><kbd>←</kbd> / <kbd>→</kbd> — выбрать карточку · <kbd>Пробел</kbd> — одинаково${comparisonRevision ? '' :
        ' · <kbd>Tab</kbd> — пропустить пару · <kbd>Ctrl+Z</kbd> — отменить действие'}</p>`;
}

/** Добавляет действие предпочтения к обычной карточке произведения. */
function comparisonCard(anime: Work, collection: Collection, fields: Readonly<AnimeDisplayFields>, side: 'left' | 'right', disabled: boolean): string {
    const entry = collection.entries.find(item => item.animeId === anime.id)!;
    const sideLabel = side === 'left' ? 'слева' : 'справа';
    return renderAnimeCard(anime, entry, {
        tag: 'article', fields, media: listMedia(collection), comparison: true,
        attributes: { [`data-comparison-${side}`]: anime.id },
        action: `<button type="button" class="comparison-choice-button" data-action="answer" data-answer="${side}"
          aria-keyshortcuts="${side === 'left' ? 'ArrowLeft' : 'ArrowRight'}"
          aria-label="Предпочитаю ${sideLabel}: ${escapeHtml(title(anime))}" ${disabled ? 'disabled' : ''}></button>`,
    });
}

/** Разделяет известные пары на прямые ответы и выводы относительно фиксированного числа всех пар. */
function comparisonProgress(view: EngineView): string {
    const upper = view.comparisonTotal;
    const madeWidth = upper > 0 ? Math.min(100, 100 * view.directComparisonCount / upper) : 0;
    const inferredWidth = upper > 0 ? Math.min(100 - madeWidth, 100 * view.inferredComparisonCount / upper) : 0;
    const counters = [
        ['manual', view.directComparisonCount, 'Выполненных сравнений'],
        ['inferred', view.inferredComparisonCount, 'Определено по другим парам'],
        ['maximum', upper, 'Общее число пар в этом раунде'],
    ] as const;
    return `<div class="comparison-progress" aria-label="Известные отношения между тайтлами">
      <div class="comparison-progress-track" role="progressbar" aria-label="Прямые и транзитивные сравнения" aria-valuemin="0" aria-valuemax="${Math.max(1, upper)}" aria-valuenow="${Math.min(upper, view.directComparisonCount + view.inferredComparisonCount)}" aria-valuetext="Прямые: ${view.directComparisonCount}; транзитивно: ${view.inferredComparisonCount}; всего пар: ${upper}">
        <span class="comparison-progress-manual" style="width:${madeWidth}%" title="Прямые сравнения: ${view.directComparisonCount}"></span><span class="comparison-progress-inferred" style="width:${inferredWidth}%" title="Транзитивные сравнения: ${view.inferredComparisonCount}"></span>
      </div>
      <div class="comparison-counters">${counters.map(([key, count, description]) => `<span data-comparison-counter="${key}" tabindex="0" title="${description}" aria-label="${description} Значение: ${count}">${count}</span>`).join('<span class="counter-separator" aria-hidden="true">/</span>')}</div>
    </div>`;
}
