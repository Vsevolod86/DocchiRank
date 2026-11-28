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
    <div class="comparison-heading">
      <h1 tabindex="-1">${heading}</h1>
      ${!revision && (complete || view.orderedGroups.length > 0) ? `<div class="comparison-tools">${renderButton({
        label: complete ? 'К результатам' : 'Посмотреть размещённые', variant: complete ? 'primary' : 'secondary',
        attributes: { 'data-screen': 'result' },
    })}</div>` : ''}
      <p class="lead">${lead}</p>
    </div>
    ${revision ? '' : comparisonProgress(view)}
    ${comparisonFeedback(collection, state)}
    ${left && right ? `<div class="comparison-pair large">
      ${comparisonCard(left, collection, state.displayFields, 'left', disabled || revision?.previousAnswer === 'left')}
      ${comparisonCard(right, collection, state.displayFields, 'right', disabled || revision?.previousAnswer === 'right')}
      <div class="comparison-pair-actions">${renderButton({
        label: 'Одинаково', variant: 'secondary', disabled: disabled || revision?.previousAnswer === 'tie',
        attributes: { 'data-action': 'answer', 'data-answer': 'tie', 'aria-keyshortcuts': 'ArrowDown' },
    })}
      ${revision ? '' : renderButton({
        label: 'Пропустить', variant: 'secondary', disabled: disabled || !view.canSkip,
        attributes: {
            'data-action': 'answer', 'data-answer': 'skip', 'aria-keyshortcuts': 'Space',
            title: view.canSkip ? 'Показать другую неизвестную пару, сохранив оба тайтла в сравнении' : 'Другой неизвестной пары сейчас нет',
        },
    })}</div>
    </div>` : ''}
    ${revision ? (state.comparisonConflict ? '' : `<div class="comparison-actions comparison-bottom-actions">
        ${renderButton({ label: 'Отменить пересмотр', variant: 'secondary', attributes: { 'data-action': 'cancel-revision' } })}</div>`)
            : `<div class="comparison-actions comparison-bottom-actions">${undoComparisonButton(!view.canUndo || disabled, 'Control+Z')}
      ${renderButton({ label: 'Изменить набор', variant: 'text', attributes: { 'data-screen': 'selection' } })}</div>`}
  </section>`;
}

/** Показывает подсказку для текущей пары с учётом режима сравнения. */
export function comparisonShortcuts({ sorting, comparisonRevision, comparisonConflict, loading }: ComparisonOptions): string {
    if (loading || comparisonConflict || !(comparisonRevision || sorting?.current)) return '';
    return `<p class="comparison-shortcuts"><kbd>←</kbd> / <kbd>→</kbd> — выбрать карточку · <kbd>↓</kbd> — одинаково${comparisonRevision ? '' :
        ' · <kbd>Пробел</kbd> — пропустить пару · <kbd>Ctrl+Z</kbd> — отменить действие'}</p>`;
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

/** Показывает, сколько прямых ответов дано и сколько их ориентировочно понадобится. */
function comparisonProgress(view: EngineView): string {
    const answered = view.directComparisonCount;
    const total = answered + view.remainingEstimate;
    const complete = view.status === 'complete';
    const label = complete ? `${answered} из ${total} сравнений` : `${answered} из примерно ${total} сравнений`;
    const displayedTotal = complete ? total : `~${total}`;
    const width = complete ? 100 : 100 * answered / total;
    const percent = `${view.progressPercent}%`;
    return `<div class="comparison-progress">
      <div class="comparison-progress-track" role="progressbar" aria-label="Прогресс сравнения"
        aria-valuemin="0" aria-valuemax="${Math.max(1, total)}" aria-valuenow="${total === 0 ? 1 : answered}"
        aria-valuetext="${label}, ${percent}" data-progress-percent="${percent}">
        <span class="comparison-progress-line" style="--comparison-fill:${width}%"></span>
      </div>
      <p class="comparison-progress-label" aria-hidden="true"><strong>${answered}</strong> из ${displayedTotal}</p>
    </div>`;
}
