import type { Score } from '../../entities/collection/model';

/** Рисует компактную диаграмму фактического числа тайтлов, включая пустые оценки. */
export function ratingChart(grades: Record<string, Score>): string {
    const counts = Array.from({ length: 10 }, (_, i) => ({ score: i + 1, count: Object.values(grades).filter(score => score === i + 1).length }));
    const maximum = Math.max(1, ...counts.map(item => item.count));
    return `<figure class="rating-distribution" role="img" aria-label="Распределение оценок: ${counts.map(item => `${item.score}: ${item.count}`).join('; ')}">
      ${counts.map(({ score, count }) => `<div class="rating-distribution-item ${count === 0 ? 'is-empty' : ''}" data-distribution-score="${score}" title="${score} / 10: ${count} тайтлов"><div class="rating-bar-track"><span class="rating-bar" style="height:${100 * count / maximum}%">${count > 0 ? `<span class="rating-bar-count" aria-hidden="true">${count}</span>` : ''}</span></div><span class="rating-bar-label">${score}</span></div>`).join('')}
    </figure>`;
}

/** Подгоняет подписи при изменении размеров диаграммы; вызывающий отключает наблюдатель перед заменой DOM. */
export function observeRatingChart(chart: HTMLElement): ResizeObserver {
  const observer = new ResizeObserver(() => fitLabels(chart));
  fitLabels(chart);
  observer.observe(chart);
  return observer;
}

/** Уменьшает шрифт по ширине и показывает число, только когда оно целиком помещается по высоте. */
function fitLabels(chart: HTMLElement): void {
  chart.querySelectorAll<HTMLElement>('.rating-bar').forEach(bar => {
    const label = bar.querySelector<HTMLElement>('.rating-bar-count');
    if (!label) return;
    label.style.visibility = 'hidden';
    label.style.fontSize = '';

    const baseSize = Number.parseFloat(getComputedStyle(label).fontSize);
    const naturalWidth = label.getBoundingClientRect().width;
    const bounds = bar.getBoundingClientRect();
    const width = Math.max(0, bounds.width - 2);
    const height = Math.max(0, bounds.height - 4);
    if (!(baseSize > 0 && naturalWidth > 0 && width > 0)) return;

    const size = Math.floor(baseSize * Math.min(1, width / naturalWidth) * 10) / 10;
    if (size <= 0) return;
    label.style.fontSize = `${size}px`;
    const text = label.getBoundingClientRect();
    if (text.width <= width && text.height <= height) label.style.visibility = 'visible';
  });
}
