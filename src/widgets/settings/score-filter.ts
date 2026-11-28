import type { ScoreRange } from '../../features/selection/filters';
import { renderInput } from '../../shared/ui/input';
import { panelGroupToggle } from '../panel-group-toggle';

/** Показывает диапазон оценки или один бегунок для выбранного балла. */
export function scoreFilter(range: ScoreRange, collapsed: boolean, disabled: boolean): string {
    const merged = range.min === range.max;
    const inactive = disabled || range.unratedOnly;
    const handles = merged ? [{ name: 'merged', value: range.min, label: 'Выбранная оценка' }] : [
        { name: 'min', value: range.min, label: 'Минимальная оценка' },
        { name: 'max', value: range.max, label: 'Максимальная оценка' },
    ];
    return `<section class="filter-group score-filter" aria-labelledby="filter-score-label">
    <div class="panel-section-heading">
      <h4 id="filter-score-label">${panelGroupToggle('score', 'Моя оценка', collapsed)}</h4>
      <output id="score-range-label" for="${handles.map(({ name }) => 'score-' + name).join(' ')}" data-filtered="${isFiltered(range)}">${rangeLabel(range)}</output>
    </div>
    <div id="panel-score-options" class="filter-options" ${collapsed ? 'hidden' : ''}>
      <label class="filter-option binary">
        ${renderInput({ type: 'checkbox', name: 'score-unrated', checked: range.unratedOnly, disabled })}
        <span>Только без оценки</span>
      </label>
      <div class="score-controls" aria-disabled="${inactive}">
        <div class="score-slider" ${inactive ? '' : 'data-action="score-track"'} data-merged="${merged}" data-equal="${merged}"
          style="--score-start: ${position(range.min)}%; --score-end: ${position(range.max)}%; --score-origin: ${position(range.min)}%">
          <span class="score-track" aria-hidden="true"></span>
          ${handles.map(({ name, value, label }) => `<input type="range" id="score-${name}" name="score-${name}"
            min="1" max="10" step="1" value="${value}" aria-label="${label}" ${inactive ? 'disabled' : ''}>`).join('')}
        </div>
        <div class="score-ticks" aria-hidden="true">${Array.from({ length: 10 }, (_, index) => {
            const value = index + 1;
            const label = value === 1 || value === 10 ? value : '';
            return `<span style="--tick-position: ${position(value)}%">${label}</span>`;
        }).join('')}</div>
      </div>
    </div>
  </section>`;
}

/** Для общего бегунка выбирает изменяемую границу по направлению движения. */
export function scoreInputBound(input: HTMLInputElement, range: ScoreRange): 'min' | 'max' | null {
    if (input.disabled) return null;
    if (input.name === 'score-min') return 'min';
    if (input.name === 'score-max') return 'max';
    if (input.name === 'score-merged' && range.min === range.max) return input.valueAsNumber < range.min ? 'min' : 'max';
    return null;
}

/** Обновляет диапазон во время перетаскивания, сохраняя нативный захват бегунка. */
export function previewScoreRange(input: HTMLInputElement, range: ScoreRange, bound: 'min' | 'max'): void {
    input.value = String(range[bound]);
    const slider = input.closest<HTMLElement>('.score-slider')!;
    slider.style.setProperty('--score-start', `${position(range.min)}%`);
    slider.style.setProperty('--score-end', `${position(range.max)}%`);
    slider.dataset.equal = String(range.min === range.max);
    const output = slider.closest('.score-filter')!.querySelector('output')!;
    output.textContent = rangeLabel(range);
    output.dataset.filtered = String(isFiltered(range));
}

/** Определяет ближайшую целую оценку по позиции указателя на шкале. */
export function scoreAtPosition(slider: HTMLElement, clientX: number): number | null {
    const track = slider.querySelector('.score-track')?.getBoundingClientRect();
    if (!track || track.width <= 0) return null;
    const fraction = Math.max(0, Math.min(1, (clientX - track.left) / track.width));
    return 1 + Math.round(fraction * 9);
}

/** Показывает, что диапазон или режим просмотра исключает часть списка. */
function isFiltered({ min, max, unratedOnly }: ScoreRange): boolean {
    return unratedOnly || min !== 1 || max !== 10;
}

/** Подписывает диапазон с учётом режима тайтлов без оценок. */
function rangeLabel({ min, max, unratedOnly }: ScoreRange): string {
    if (unratedOnly) return 'Без оценки';
    if (min === 1 && max === 10) return 'Все оценки';
    return min === max ? String(min) : `${min}–${max}`;
}

/** Переводит границу 1–10 в позицию на шкале. */
function position(value: number): number {
    return (value - 1) / 9 * 100;
}
