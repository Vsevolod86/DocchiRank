// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { observeRatingChart } from './rating-chart';

let chart: HTMLElement;
let bar: HTMLElement;
let label: HTMLElement;
let bounds: { width: number; height: number };
let resize: ResizeObserverCallback;

beforeEach(() => {
  document.head.innerHTML = '<style>.rating-bar-count { font-size: 10px; }</style>';
  document.body.innerHTML = '<figure><span class="rating-bar"><span class="rating-bar-count">99</span></span></figure>';
  chart = document.querySelector('figure')!;
  bar = chart.querySelector<HTMLElement>('.rating-bar')!;
  label = chart.querySelector<HTMLElement>('.rating-bar-count')!;
  bounds = { width: 16, height: 24 };
  vi.spyOn(bar, 'getBoundingClientRect').mockImplementation(() => new DOMRect(0, 0, bounds.width, bounds.height));
  vi.spyOn(label, 'getBoundingClientRect').mockImplementation(() => {
    const size = Number.parseFloat(getComputedStyle(label).fontSize);
    return new DOMRect(0, 0, label.textContent!.length * size * .6, size * 1.2);
  });
  vi.stubGlobal('ResizeObserver', class {
    /** Передаёт тесту событие реального изменения размеров без автоматической раскладки happy-dom. */
    constructor(callback: ResizeObserverCallback) { resize = callback; }
    observe = vi.fn();
    disconnect = vi.fn();
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

describe('подписи внутри столбцов', () => {
  it('помещает две цифры без уменьшения, а длинное число уменьшает только по ширине', () => {
    const observer = observeRatingChart(chart);
    expect(label.style.fontSize).toBe('10px');
    expect(label.style.visibility).toBe('visible');
    label.textContent = '1234';
    resize([], observer);
    expect(Number.parseFloat(label.style.fontSize)).toBeLessThan(10);
    expect(label.getBoundingClientRect().width).toBeLessThanOrEqual(bounds.width - 2);
    expect(label.style.visibility).toBe('visible');
  });

  it('скрывает подпись в низком столбце и показывает её при достаточной высоте', () => {
    bounds.height = 15;
    const observer = observeRatingChart(chart);
    expect(label.style.visibility).toBe('hidden');
    bounds.height = 16;
    resize([], observer);
    expect(label.style.visibility).toBe('visible');
  });

  it('восстанавливает исходный шрифт после расширения, а в узком столбце снова уменьшает', () => {
    label.textContent = '1234';
    const observer = observeRatingChart(chart);
    const narrowSize = label.style.fontSize;
    bounds.width = 30;
    resize([], observer);
    expect(label.style.fontSize).toBe('10px');
    bounds.width = 16;
    resize([], observer);
    expect(label.style.fontSize).toBe(narrowSize);
  });
});
