import type { Collection, ListEntry, ListMedia, ListStatus, Score, Work } from '../collection/model';
import { escapeHtml } from '../../shared/lib/escape-html';
import { renderCard } from '../../shared/ui/card';
import type { ElementAttributes } from '../../shared/ui/attributes';

const ANIME_STATUS_LABELS: Record<ListStatus, string> = {
    planned: 'Запланировано', watching: 'Смотрю', rewatching: 'Пересматриваю',
    completed: 'Просмотрено', on_hold: 'Отложено', dropped: 'Брошено',
};

const MANGA_STATUS_LABELS: Record<ListStatus, string> = {
    ...ANIME_STATUS_LABELS, watching: 'Читаю', rewatching: 'Перечитываю', completed: 'Прочитано',
};

/** Возвращает подписи статусов просмотра или чтения. */
export function statusLabels(media: ListMedia): Readonly<Record<ListStatus, string>> {
    return media === 'manga' ? MANGA_STATUS_LABELS : ANIME_STATUS_LABELS;
}

/** Находит отображаемое название по постоянному ID, включая записи журнала. */
export function animeTitle(collection: Collection, id: string | null): string {
    const anime = collection.animes.find(item => item.id === id);
    return anime ? title(anime) : id ? `Тайтл #${id}` : '—';
}

/** Формирует обложку с локальной заглушкой для отсутствующего изображения. */
export function cover(anime: Work): string {
    return anime.coverUrl ? `<img src="${escapeHtml(anime.coverUrl)}" alt="Обложка: ${escapeHtml(title(anime))}" loading="lazy" referrerpolicy="no-referrer" draggable="false">`
        : '<div class="cover-placeholder" role="img" aria-label="Нет обложки">Нет обложки</div>';
}

/** Выбирает русское название либо исходное при отсутствии перевода. */
export function title(anime: Work): string {
    return anime.russian || anime.name;
}

/** Даёт ссылке собственную область нажатия, не смешивая её с выбором тайтла. */
export function cardLink(anime: Work): string {
    return `<a class="card-link" data-card-field="shikimoriLink" href="${escapeHtml(anime.url)}" target="_blank" rel="noopener noreferrer" title="Страница на Shikimori" aria-label="Страница на Shikimori: ${escapeHtml(title(anime))}"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 3h6v6m0-6-8 8M8 4H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-4"/></svg></a>`;
}

/** Поля произведения, которые пользователь может включать в интерфейсе. */
export interface AnimeDisplayFields {
    russianTitle: boolean;
    originalTitle: boolean;
    status: boolean;
    userScore: boolean;
    communityScore: boolean;
    shikimoriLink: boolean;
}

/** Оформление карточки и готовые элементы управления от вызывающего виджета. */
interface AnimeCardOptions {
    tag: 'label' | 'article';
    fields: Readonly<AnimeDisplayFields>;
    media?: ListMedia;
    selected?: boolean;
    comparison?: boolean;
    attributes: ElementAttributes;
    coverControl?: string;
    action?: string;
}

/** Собирает карточку из обложки, данных произведения и элементов вызывающего виджета. */
export function renderAnimeCard(anime: Work, entry: ListEntry, options: AnimeCardOptions): string {
    const { tag, fields, media = 'anime', selected, comparison, attributes, coverControl = '', action = '' } = options;
    const className = ['anime-choice', selected ? 'selected' : '', comparison ? 'comparison-choice' : ''].filter(Boolean).join(' ');
    return renderCard({
        tag, padded: false, className,
        attributes,
        contentMarkup: `
          <div class="cover-wrap">${cover(anime)}${coverControl}</div>
          ${action}
          <div class="choice-description">${cardTitles(anime, fields)}<div class="card-meta">
            ${fields.status ? `<span class="card-status" data-card-field="status">${entry.status === null ? 'Статус неизвестен' : statusLabels(media)[entry.status]}</span>` : ''}
            ${fields.userScore ? `<span class="source-score" data-card-field="userScore" title="Моя оценка: ${scoreLabel(entry.originalScore)}">Моя: ${entry.originalScore ?? '—'}</span>` : ''}
            ${fields.communityScore ? `<span class="source-score" data-card-field="communityScore" title="Оценка сообщества Shikimori">Shiki: ${anime.communityScore ?? '—'}</span>` : ''}
            ${fields.shikimoriLink ? cardLink(anime) : ''}
          </div></div>`,
    });
}

/** Показывает выбранные варианты названия без повторения одного и того же текста. */
function cardTitles(anime: Work, fields: Readonly<AnimeDisplayFields>): string {
    const russian = fields.russianTitle ? anime.russian || (!fields.originalTitle ? anime.name : null) : null;
    const original = fields.originalTitle ? anime.name : null;
    const primary = russian ?? original;
    const both = russian && original && russian !== original;
    return `<div class="choice-titles">${primary ? `<h2 class="card-title" data-card-field="${russian ? 'russianTitle' : 'originalTitle'}" ${russian ? '' : 'lang="en"'}>${escapeHtml(primary)}</h2>` : ''}
    ${both ? `<p class="original-title card-title" data-card-field="originalTitle" lang="en">${escapeHtml(original)}</p>` : ''}</div>`;
}

/** Отображает отсутствие исходной оценки отдельно от числовых оценок. */
function scoreLabel(score: Score | null): string {
    return score === null ? 'Без оценки' : `${score} / 10`;
}
