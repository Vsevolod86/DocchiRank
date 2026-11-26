import { cover, statusLabels, title } from '../../entities/anime/anime-card';
import { listMedia } from '../../entities/collection/model';
import type { AnimeDisplayFields } from '../../entities/anime/anime-card';
import type { Collection, Score } from '../../entities/collection/model';
import type { ResultViewData } from '../../features/collection/result-view-data';
import { escapeHtml } from '../../shared/lib/escape-html';
import { renderSelect } from '../../shared/ui/select';

const ratingOptions = Array.from({ length: 10 }, (_, index) => {
    const value = String(index + 1);
    return { value, label: value };
});

/** Объединяет соседние одинаковые оценки и нумерует классы равных по порядку. */
export function resultTables(collection: Collection, fields: Readonly<AnimeDisplayFields>, { groups, complete, editable, grades }: ResultViewData): string {
    const buckets: { score: Score | null; groups: { ids: string[]; rank: number }[] }[] = [];
    for (const [index, ids] of groups.entries()) {
        const score = grades[ids[0]!] ?? null;
        if (buckets.at(-1)?.score !== score) buckets.push({ score, groups: [] });
        buckets.at(-1)!.groups.push({ ids, rank: index + 1 });
    }
    const showTitles = fields.russianTitle || fields.originalTitle || fields.status;
    const statuses = statusLabels(listMedia(collection));
    const animes = new Map(collection.animes.map(anime => [anime.id, anime]));
    const entries = new Map(collection.entries.map(entry => [entry.animeId, entry]));
    return `<div class="ordered-result">${buckets.map(bucket => `<div class="result-rating-group" data-result-score="${bucket.score ?? 'unrated'}"><div class="result-table-wrap" tabindex="0" role="region" aria-label="Тайтлы с оценкой ${bucket.score ?? 'не назначена'}"><table class="result-table">
      <caption><strong>${bucket.score === null ? 'Без оценки' : `${bucket.score} / 10`}</strong><span>Тайтлов: ${bucket.groups.reduce((count, group) => count + group.ids.length, 0)}</span></caption>
      <thead><tr><th scope="col" class="result-number-column">№</th><th scope="col" class="result-cover-column"><span class="visually-hidden">Обложка</span></th>${showTitles ? '<th scope="col" class="result-title-column">Названия</th>' : ''}${fields.communityScore ? '<th scope="col" class="result-score-column">Shikimori</th>' : ''}${fields.userScore ? '<th scope="col" class="result-score-column">Старая</th>' : ''}<th scope="col" class="result-new-score-column">Новая</th><th scope="col" class="result-review-column"><span class="visually-hidden">Пересмотреть место</span></th></tr></thead>
      ${bucket.groups.map(({ ids, rank }) => `<tbody>${ids.map((id, index) => {
        const anime = animes.get(id)!;
        const entry = entries.get(id)!;
        const grade = grades[id];
        const russian = escapeHtml(title(anime));
        const hasRussian = fields.russianTitle && Boolean(anime.russian);
        const primary = hasRussian ? russian : fields.originalTitle || fields.russianTitle ? escapeHtml(anime.name) : null;
        const heading = primary === null ? '' : fields.shikimoriLink ? `<a href="${escapeHtml(anime.url)}" target="_blank" rel="noopener noreferrer">${primary}</a>` : `<span>${primary}</span>`;
        return `<tr data-ordered-id="${escapeHtml(id)}" title="${russian}">${index === 0 ? `<th scope="rowgroup" rowspan="${ids.length}" class="result-rank">${rank}</th>` : ''}
          <td class="result-cover">${cover(anime)}</td>
          ${showTitles ? `<td class="result-names">${primary === null ? '' : `<span class="result-primary-title" data-card-field="${hasRussian ? 'russianTitle' : 'originalTitle'}" ${hasRussian ? '' : 'lang="en"'}>${heading}</span>`}${hasRussian && fields.originalTitle && anime.name !== anime.russian ? `<span class="result-secondary-title" lang="en" data-card-field="originalTitle">${escapeHtml(anime.name)}</span>` : ''}${fields.status ? `<small data-card-field="status">${entry.status ? statuses[entry.status] : 'Статус неизвестен'}</small>` : ''}</td>` : ''}
          ${fields.communityScore ? `<td class="result-numeric" data-card-field="communityScore">${anime.communityScore ?? '—'}</td>` : ''}
          ${fields.userScore ? `<td class="result-numeric" data-card-field="userScore">${entry.originalScore ?? '—'}</td>` : ''}
          <td>${renderSelect({
            name: 'rating-score', disabled: !editable, value: String(grade ?? ''),
            attributes: { 'data-rating-id': id, 'aria-label': `Новая оценка: ${title(anime)}`,
                title: editable ? undefined : 'Сначала заверши сравнение или настройку оценок' },
            options: grade === undefined ? [{ value: '', label: '—' }, ...ratingOptions] : ratingOptions,
          })}</td>
          <td>${complete ? `<button class="result-review-button" data-action="reposition" data-review-id="${escapeHtml(id)}" title="Пересмотреть место" aria-label="Пересмотреть место: ${russian}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 20V4m-3 3 3-3 3 3M16 4v16m-3-3 3 3 3-3"/></svg></button>` : ''}</td></tr>`;
      }).join('')}</tbody>`).join('')}
    </table></div></div>`).join('')}</div>`;
}

/** Однократно подсвечивает ссылки в таблице после включения их отображения. */
export function highlightResultLinks(container: ParentNode): void {
    container.querySelector('.ordered-result')?.classList.add('highlight-result-links');
}

/** Заменяет таблицы и восстанавливает прокрутку каждой сохранившейся группы оценок. */
export function replaceResultTables(slot: HTMLElement, markup: string): void {
    const previousScroll = new Map(Array.from(slot.querySelectorAll<HTMLElement>('.result-table-wrap'),
        table => [table.parentElement?.dataset.resultScore, table.scrollLeft]));
    slot.innerHTML = markup;
    for (const table of slot.querySelectorAll<HTMLElement>('.result-table-wrap')) {
        table.scrollLeft = previousScroll.get(table.parentElement?.dataset.resultScore) ?? 0;
    }
}

/** Подбирает общую ширину названий при изменении размеров; вызывающий отключает наблюдатель перед заменой DOM. */
export function observeResultTitles(results: HTMLElement): ResizeObserver {
  const observer = new ResizeObserver(() => fitTitleColumn(results));
  fitTitleColumn(results);
  observer.observe(results);
  return observer;
}

/** Подбирает минимальную ширину по названиям, сохраняя прежний верхний предел текста. */
function fitTitleColumn(results: HTMLElement): void {
  results.classList.remove('has-sized-titles');
  results.style.removeProperty('--result-title-width');
  results.style.removeProperty('--result-table-width');
  const table = results.querySelector<HTMLElement>('.result-table');
  const column = table?.querySelector<HTMLElement>('.result-title-column');
  if (!table || !column) return;

  const tableWidth = table.getBoundingClientRect().width;
  const maximum = column.getBoundingClientRect().width;
  if (maximum <= 0) return;
  const columnStyle = getComputedStyle(column);
  const minimum = Number.parseFloat(columnStyle.minWidth);
  const padding = Number.parseFloat(columnStyle.paddingLeft) + Number.parseFloat(columnStyle.paddingRight);
  const titles = Array.from(results.querySelectorAll<HTMLElement>('.result-primary-title, .result-secondary-title'));
  const previousWidths = titles.map(title => title.style.width);
  titles.forEach(title => { title.style.width = 'max-content'; });
  const longest = Math.max(0, ...titles.map(title => title.getBoundingClientRect().width));
  titles.forEach((title, index) => { title.style.width = previousWidths[index]!; });

  const width = Math.max(minimum, Math.min(maximum, Math.ceil(longest + padding)));
  const naturalWidth = tableWidth - maximum + width;
  results.style.setProperty('--result-title-width', `${width}px`);
  results.style.setProperty('--result-table-width', `${naturalWidth}px`);
  results.classList.add('has-sized-titles');
}
