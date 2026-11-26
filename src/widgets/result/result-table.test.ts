// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { observeResultTitles } from './result-table';

let results: HTMLElement;
let titles: HTMLElement[];
let widths: number[];
let maximum: number;
let resize: ResizeObserverCallback;

beforeEach(() => {
  document.head.innerHTML = '<style>.result-title-column { min-width:128px; padding:0 6px }</style>';
  document.body.innerHTML = '<div class="ordered-result"><table class="result-table"><thead><tr><th class="result-title-column">Названия</th></tr></thead><tbody><tr><td><span class="result-primary-title">Короткое</span></td></tr></tbody></table><table class="result-table"><tbody><tr><td><span class="result-secondary-title">Длинное оригинальное название</span></td></tr></tbody></table></div>';
  results = document.querySelector<HTMLElement>('.ordered-result')!;
  titles = Array.from(results.querySelectorAll<HTMLElement>('.result-primary-title, .result-secondary-title'));
  widths = [80, 210];
  maximum = 320;
  vi.spyOn(results.querySelector<HTMLElement>('.result-table')!, 'getBoundingClientRect').mockImplementation(() => new DOMRect(0, 0, maximum + 280, 100));
  vi.spyOn(results.querySelector<HTMLElement>('.result-title-column')!, 'getBoundingClientRect').mockImplementation(() => new DOMRect(0, 0, maximum, 30));
  titles.forEach((title, index) => {
    vi.spyOn(title, 'getBoundingClientRect').mockImplementation(() => new DOMRect(0, 0, widths[index]!, 20));
  });
  vi.stubGlobal('ResizeObserver', class {
    /** Передаёт тесту изменение геометрии, которую happy-dom не рассчитывает. */
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

describe('общая ширина названий результата', () => {
  it('учитывает длинное название из другой таблицы и сокращается при его скрытии', () => {
    const observer = observeResultTitles(results);
    const full = Number.parseFloat(results.style.getPropertyValue('--result-title-width'));
    expect(full).toBeGreaterThanOrEqual(widths[1]!);
    expect(full).toBeLessThan(maximum);
    expect(titles.every(title => title.style.width === '')).toBe(true);
    titles[1]!.remove();
    resize([], observer);
    expect(results.style.getPropertyValue('--result-title-width')).toBe('128px');
  });

  it('сохраняет минимум коротких названий и прежний максимум при изменении доступного места', () => {
    widths = [20, 50];
    const observer = observeResultTitles(results);
    expect(results.style.getPropertyValue('--result-title-width')).toBe('128px');
    widths = [600, 900];
    resize([], observer);
    expect(results.style.getPropertyValue('--result-title-width')).toBe('320px');
    maximum = 240;
    resize([], observer);
    expect(results.style.getPropertyValue('--result-title-width')).toBe('240px');
  });
});
