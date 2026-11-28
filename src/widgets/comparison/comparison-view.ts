import { COMPARISON_KEYS } from '../../config/interface';
import { cover, renderAnimeCard, title } from '../../entities/anime/anime-card';
import type { AnimeDisplayFields } from '../../entities/anime/anime-card';
import type { Collection, ListEntry, Work } from '../../entities/collection/model';
import { listMedia } from '../../entities/collection/model';
import type { EngineView } from '../../entities/sorting/session';
import type { CollectionView } from '../../features/collection/collection-commands';
import { comparisonFeedback, undoComparisonButton } from '../../features/collection/comparison-controls';
import type { GroupDisplay } from '../../features/collection/group-display';
import { escapeHtml } from '../../shared/lib/escape-html';
import { renderButton } from '../../shared/ui/button';
import { renderCard } from '../../shared/ui/card';

const groupCount = new Intl.PluralRules('ru');

/** Сравниваемая пара, состояние пересмотра и настройки карточек сравнения. */
export type ComparisonOptions = Pick<CollectionView, 'sorting' | 'comparisonError' | 'comparisonRevision' | 'comparisonConflict'> & {
    displayFields: Readonly<AnimeDisplayFields>;
    groupDisplay: GroupDisplay;
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
    const groups = revision ? null : view.currentGroups;
    const hasGroup = groups !== null && (groups.left.length > 1 || groups.right.length > 1);
    const disabled = state.comparisonConflict !== null || state.loading;
    const heading = revision ? 'Пересмотр ответа' : complete ? 'Сравнение завершено' : 'Что тебе понравилось больше?';
    const preferred = revision?.previousAnswer === 'left' ? left : right;
    const previousAnswer = revision?.previousAnswer === 'tie' ? 'одинаково' : preferred ? title(preferred) : '—';
    const lead = revision ? `Прежний ответ — ${escapeHtml(previousAnswer)}. Выбери другой ответ для этой пары.`
        : complete ? 'Все тайтлы из сравнения размещены.'
            : hasGroup ? 'Выбери сторону или поставь все эти тайтлы на одно место.'
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
      ${comparisonSide(left, groups?.left, collection, state, 'left', disabled || revision?.previousAnswer === 'left')}
      ${comparisonSide(right, groups?.right, collection, state, 'right', disabled || revision?.previousAnswer === 'right')}
      <div class="comparison-pair-actions">${renderButton({
        label: 'Одинаково', variant: 'secondary', disabled: disabled || revision?.previousAnswer === 'tie',
        attributes: { 'data-action': 'answer', 'data-answer': 'tie', 'aria-keyshortcuts': COMPARISON_KEYS.tie.key },
    })}
      ${revision ? '' : renderButton({
        label: 'Пропустить', variant: 'secondary', disabled: disabled || !view.canSkip,
        attributes: {
            'data-action': 'answer', 'data-answer': 'skip', 'aria-keyshortcuts': COMPARISON_KEYS.skip.key,
            title: view.canSkip ? 'Показать другую неизвестную пару, сохранив оба тайтла в сравнении' : 'Другой неизвестной пары сейчас нет',
        },
    })}</div>
    </div>` : ''}
    ${revision ? (state.comparisonConflict ? '' : `<div class="comparison-actions comparison-bottom-actions">
        ${renderButton({ label: 'Отменить пересмотр', variant: 'secondary', attributes: { 'data-action': 'cancel-revision' } })}</div>`)
            : `<div class="comparison-actions comparison-bottom-actions">${undoComparisonButton(!view.canUndo || disabled, COMPARISON_KEYS.undo.key)}
      ${renderButton({ label: 'Изменить набор', variant: 'text', attributes: { 'data-screen': 'selection' } })}</div>`}
  </section>`;
}

/** Показывает подсказку для текущей пары с учётом режима сравнения. */
export function comparisonShortcuts({ sorting, comparisonRevision, comparisonConflict, loading }: ComparisonOptions): string {
    if (loading || comparisonConflict || !(comparisonRevision || sorting?.current)) return '';
    const { left, right, tie, skip, undo } = COMPARISON_KEYS;
    return `<p class="comparison-shortcuts"><kbd>${escapeHtml(left.label)}</kbd> / <kbd>${escapeHtml(right.label)}</kbd> — выбрать карточку · <kbd>${escapeHtml(tie.label)}</kbd> — одинаково${comparisonRevision ? '' :
        ` · <kbd>${escapeHtml(skip.label)}</kbd> — пропустить пару · <kbd>${escapeHtml(undo.label)}</kbd> — отменить действие`}</p>`;
}

/** Показывает сторону сравнения в выбранном режиме, сохраняя действие для всей группы. */
function comparisonSide(anime: Work, members: string[] | undefined, collection: Collection, { displayFields, groupDisplay }: ComparisonOptions, side: 'left' | 'right', disabled: boolean): string {
    if (!members || members.length < 2 || groupDisplay === 'representative') {
        const entry = collection.entries.find(item => item.animeId === anime.id)!;
        return comparisonCard(anime, entry, collection, displayFields, side, disabled);
    }

    const ids = new Set(members);
    const works = collection.animes.filter(work => ids.has(work.id));
    if (groupDisplay === 'list') return comparisonGroup(anime.id, works, displayFields, side, disabled);

    const entries = new Map(collection.entries.map(entry => [entry.animeId, entry]));
    const slides = [anime, ...works.filter(work => work.id !== anime.id)].map((work, index) =>
        `<div data-carousel-slide ${index === 0 ? '' : 'hidden'}>${comparisonCard(work, entries.get(work.id)!, collection, displayFields, side, disabled, true)}</div>`);
    return renderCard({
        tag: 'article', padded: false, className: 'comparison-carousel',
        attributes: { [`data-comparison-${side}`]: anime.id, 'data-comparison-carousel': '', 'aria-label': groupLabel(slides.length) },
        contentMarkup: `${slides.join('')}
          <div class="comparison-carousel-controls">
            <span class="comparison-carousel-position" aria-hidden="true">1 / ${slides.length}</span>
            ${renderButton({
                label: side === 'left' ? 'Пауза карусели слева' : 'Пауза карусели справа',
                variant: 'icon', className: 'comparison-carousel-pause', attributes: { 'aria-pressed': 'false' },
                iconPaths: '<path class="carousel-pause-icon" d="M9 5v14m6-14v14"/><path class="carousel-resume-icon" d="m8 5 12 7-12 7Z"/>',
            })}
          </div>`,
    });
}

/** Использует обычную карточку и подписывает действие по его области применения. */
function comparisonCard(anime: Work, entry: ListEntry, collection: Collection, fields: Readonly<AnimeDisplayFields>, side: 'left' | 'right', disabled: boolean, carousel = false): string {
    const sideLabel = side === 'left' ? 'слева' : 'справа';
    const label = carousel ? `Выбрать группу ${sideLabel}` : `Предпочитаю ${sideLabel}: ${title(anime)}`;
    return renderAnimeCard(anime, entry, {
        tag: 'article', fields, media: listMedia(collection), comparison: true,
        attributes: carousel ? { 'data-carousel-work': anime.id } : { [`data-comparison-${side}`]: anime.id },
        action: `<button type="button" class="comparison-choice-button" data-action="answer" data-answer="${side}"
          aria-keyshortcuts="${escapeHtml(COMPARISON_KEYS[side].key)}"
          aria-label="${escapeHtml(label)}" ${disabled ? 'disabled' : ''}></button>`,
    });
}

/** Показывает все тайтлы группы и действие для выбора всей стороны. */
function comparisonGroup(id: string, works: Work[], fields: Readonly<AnimeDisplayFields>, side: 'left' | 'right', disabled: boolean): string {
    const label = groupLabel(works.length);
    const titleAttributes = fields.russianTitle || fields.originalTitle ? '' : ' class="visually-hidden"';
    const rows = works.map(work => `<li>
      <div class="comparison-group-cover" aria-hidden="true">${cover(work)}</div>
      <span${titleAttributes}>${escapeHtml(fields.originalTitle && !fields.russianTitle ? work.name : title(work))}</span>
    </li>`).join('');
    return renderCard({
        tag: 'article', padded: false, className: 'comparison-group',
        attributes: { [`data-comparison-${side}`]: id, 'aria-label': label },
        contentMarkup: `<p class="comparison-group-heading">${label}</p>
          <div class="comparison-group-scroll" role="region" aria-label="Состав группы" tabindex="0">
            <ul class="comparison-group-list" role="list">${rows}</ul>
          </div>
          ${renderButton({
            label: 'Выбрать группу', variant: 'secondary', disabled,
            attributes: { 'data-action': 'answer', 'data-answer': side,
                'aria-label': `Выбрать группу ${side === 'left' ? 'слева' : 'справа'}`,
                'aria-keyshortcuts': COMPARISON_KEYS[side].key },
        })}`,
    });
}

/** Подписывает группу количеством тайтлов на одном месте. */
function groupLabel(count: number): string {
    const form = groupCount.select(count);
    const noun = form === 'one' ? 'тайтл' : form === 'few' ? 'тайтла' : 'тайтлов';
    return `${count} ${noun} на одном месте`;
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
