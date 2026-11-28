// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LIST_FIXTURE } from './list-fixture';
import { ShikimoriSource } from '../integrations/shikimori';
import { MemoryCollectionStore } from '../storage/collection-store';
import { mountApp } from './mount-app';

let root: HTMLElement;
let store: MemoryCollectionStore;

beforeEach(async () => {
  document.body.innerHTML = '<div id="app"></div>';
  root = document.querySelector<HTMLElement>('#app')!;
  store = new MemoryCollectionStore();
  mountApp(root, { demo: { load: async () => structuredClone(LIST_FIXTURE) }, shikimori: new ShikimoriSource() }, store);
  button('[data-action="load-demo"]').click();
  await vi.waitFor(() => { expect(cardIds()).toHaveLength(5); });
  button('[data-action="reset-filters"]').click();
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('выбор групп и карточек', () => {
  it('открывает набор с заданными фильтрами и сохраняет сворачивание после обновления экрана', async () => {
    button('[data-screen="import"]').click();
    button('[data-action="load-demo"]').click();
    await vi.waitFor(() => { expect(cardIds()).toHaveLength(5); });
    expect(cardIds()).not.toContain('32281');
    expect(Array.from(root.querySelectorAll<HTMLInputElement>('[data-filter-group="status"]:checked'), input => input.dataset.filterValue))
      .toEqual(['rewatching', 'completed']);
    expect(Array.from(root.querySelectorAll<HTMLInputElement>('[data-filter-group="kind"]:checked'), input => input.dataset.filterValue))
      .toEqual(['tv', 'movie', 'ona']);
    expect(root.querySelector('.filter-panel h2')!.textContent!.trim()).toBe('Настройки');
    expect(Array.from(root.querySelectorAll('#panel-settings-options h3'), heading => heading.textContent!.trim()))
      .toEqual(['Отображение', 'Сортировка', 'Фильтры']);
    expect(Array.from(root.querySelectorAll('#panel-filters-options h4'), heading => heading.textContent!.trim()))
      .toEqual(['Статус', 'Тип произведения', 'Моя оценка']);
    expect(root.querySelector<HTMLElement>('#panel-settings-options')!.hidden).toBe(false);
    expect(root.querySelector<HTMLElement>('#panel-filters-options')!.hidden).toBe(false);
    expect(root.querySelector<HTMLElement>('#panel-display-options')!.hidden).toBe(true);
    expect(root.querySelector<HTMLElement>('#panel-kind-options')!.hidden).toBe(true);
    expect(root.querySelector<HTMLElement>('#panel-score-options')!.hidden).toBe(true);
    button('[data-panel-group="score"]').click();
    setScoreRange(8, 8);
    button('[data-panel-group="filters"]').click();
    expect(root.querySelector<HTMLElement>('#panel-display-options')!.hidden).toBe(true);
    expect(root.querySelector<HTMLElement>('#panel-filters-options')!.hidden).toBe(true);
    button('[data-panel-group="settings"]').click();
    button('[data-layout="list"]').click();
    expect(root.querySelector<HTMLElement>('#panel-display-options')!.hidden).toBe(true);
    expect(root.querySelector<HTMLElement>('#panel-filters-options')!.hidden).toBe(true);
    expect(root.querySelector<HTMLElement>('#panel-settings-options')!.hidden).toBe(true);
    expect(tableIds()).toHaveLength(2);
    button('[data-panel-group="settings"]').click();
    expect(root.querySelector<HTMLElement>('#panel-display-options')!.hidden).toBe(true);
    button('[data-panel-group="display"]').click();
    expect(root.querySelectorAll('[data-card-field="status"]')).toHaveLength(0);
    root.querySelector<HTMLInputElement>('[name="display-field"][value="status"]')!.click();
    expect(root.querySelectorAll('[data-card-field="status"]')).toHaveLength(2);
    expect(root.querySelectorAll('.anime-table thead th')).toHaveLength(5);
  });

  it('переносит те же настройки в модальное окно и использует их для отбора', () => {
    const panel = root.querySelector('.filter-panel')!;
    const dialog = root.querySelector<HTMLDialogElement>('.settings-dialog')!;
    button('[data-action="open-settings"]').click();
    expect(dialog.open).toBe(true);
    expect(dialog.querySelector('.filter-panel')).toBe(panel);
    button('[data-panel-group="score"]').click();
    setScoreRange(8, 8);
    expect(cardIds()).toHaveLength(2);
    root.querySelector<HTMLInputElement>('[name="score-unrated"]')!.click();
    expect(cardIds()).toEqual(['33352', '32281']);
    expect(root.querySelector<HTMLInputElement>('#score-merged')!.disabled).toBe(true);
    expect(dialog.querySelector('[data-action="score-track"]')).toBeNull();
    root.querySelector<HTMLInputElement>('[name="score-unrated"]')!.click();
    expect(root.querySelector<HTMLInputElement>('#score-merged')!.disabled).toBe(false);
    expect(root.querySelector<HTMLInputElement>('#score-merged')!.value).toBe('8');
    expect(cardIds()).toHaveLength(2);
    button('[data-close-settings]').click();
    expect(dialog.open).toBe(false);
    expect(cardIds()).toHaveLength(2);
  });

  it('раздвигает общий бегунок в обе стороны от выбранной оценки', () => {
    setScoreRange(8, 8);
    expect(root.querySelectorAll('.score-slider input')).toHaveLength(1);
    changeScore(root.querySelector<HTMLInputElement>('#score-merged')!, 7);
    expect(root.querySelector('#score-range-label')!.textContent).toBe('7–8');

    setScoreRange(8, 8);
    changeScore(root.querySelector<HTMLInputElement>('#score-merged')!, 9);
    expect(root.querySelector('#score-range-label')!.textContent).toBe('8–9');
    expect(root.querySelectorAll('.score-slider input')).toHaveLength(2);
  });

  it('сохраняет прокрутку правой панели и фокус при изменении фильтров и сортировки', () => {
    root.querySelector<HTMLElement>('.filter-panel')!.scrollTop = 420;
    setScoreRange(8, 8);
    expect(root.querySelector<HTMLElement>('.filter-panel')!.scrollTop).toBe(420);
    expect(document.activeElement).toBe(root.querySelector('#score-merged'));
    expect(cardIds()).toHaveLength(2);

    root.querySelector<HTMLInputElement>('input[name="title-sort"][value="my-score"]')!.click();
    expect(root.querySelector<HTMLElement>('.filter-panel')!.scrollTop).toBe(420);
    expect(document.activeElement).toBe(root.querySelector('input[name="title-sort"][value="my-score"]'));
    setScoreRange(1, 10);
    expect(root.querySelector<HTMLElement>('.filter-panel')!.scrollTop).toBe(420);
    expect(cardIds()).toHaveLength(6);
  });

  it('сворачивает группы, сохраняя фильтры и синхронизацию сортировки при обновлении интерфейса', () => {
    const selected = store.get('demo')!.selectedIds;
    button('[data-panel-group="sort"]').click();
    button('[data-panel-group="kind"]').click();
    button('[data-filter-group="kind"][data-filter-value="movie"]').click();
    button('[data-panel-group="kind"]').click();
    expect(root.querySelector<HTMLElement>('#panel-sort-options')!.hidden).toBe(true);
    expect(root.querySelector<HTMLElement>('#panel-kind-options')!.hidden).toBe(true);
    expect(button('[data-panel-group="kind"]').getAttribute('aria-expanded')).toBe('false');

    button('[data-layout="list"]').click();
    button('[data-sort-key="community-score"]').click();
    expect(root.querySelector<HTMLElement>('#panel-kind-options')!.hidden).toBe(true);
    expect(root.querySelector<HTMLElement>('#panel-sort-options')!.hidden).toBe(true);
    expect(tableIds()).toHaveLength(2);
    expect(store.get('demo')!.selectedIds).toEqual(selected);

    button('[data-panel-group="kind"]').click();
    button('[data-panel-group="sort"]').click();
    expect(root.querySelector<HTMLElement>('#panel-kind-options')!.hidden).toBe(false);
    expect(root.querySelector<HTMLElement>('#panel-sort-options')!.hidden).toBe(false);
    expect(root.querySelector<HTMLInputElement>('[data-filter-group="kind"][data-filter-value="movie"]')!.checked).toBe(true);
    expect(root.querySelector<HTMLInputElement>('input[name="title-sort"][value="community-score"]')!.checked).toBe(true);
  });

  it('фильтрует фильмы и сериалы совместно с оценками без изменения выборки', () => {
    const selected = store.get('demo')!.selectedIds;
    button('[data-filter-group="kind"][data-filter-value="movie"]').click();
    expect(cardIds()).toEqual(['32281', '199']);
    setScoreRange(9, 9);
    expect(cardIds()).toEqual(['199']);
    button('[data-action="reset-filters"]').click();
    expect(cardIds()).toHaveLength(6);
    expect(store.get('demo')!.selectedIds).toEqual(selected);
  });

  it('показывает три сценария и открывает дополнение и пересмотр только при готовом порядке', async () => {
    expect(root.querySelectorAll('.scenario-card')).toHaveLength(3);
    expect(root.querySelector<HTMLInputElement>('input[name="comparison-scenario"][value="add"]')!.disabled).toBe(true);
    const collection = store.get('demo')!;
    collection.orderedIds = ['5114', '1'];
    store.set(collection);
    button('[data-screen="import"]').click();
    button('[data-action="load-demo"]').click();
    await vi.waitFor(() => {
      expect(root.querySelector<HTMLInputElement>('input[name="comparison-scenario"][value="review"]')!.disabled).toBe(false);
      expect(root.querySelectorAll('.anime-choice')).toHaveLength(5);
    });
    root.querySelector<HTMLInputElement>('input[name="comparison-scenario"][value="review"]')!.click();
    expect(root.querySelector('.scenario-card.active input')!.getAttribute('value')).toBe('review');
    expect(root.querySelectorAll('.scenario-card [data-action="start-comparison"]')).toHaveLength(1);
    expect(root.querySelector('.scenario-card.active [data-action="start-comparison"]')).not.toBeNull();
    expect(store.get('demo')).toEqual(collection);
  });

  it('переключает три формата без изменения выборки, фильтров и сортировки, а список не содержит обложек', () => {
    expect(Array.from(root.querySelectorAll('.view-switch button'), item => item.getAttribute('aria-label'))).toEqual(['Крупные карточки', 'Средние карточки', 'Список']);
    expect(button('[data-layout="compact"]').getAttribute('aria-pressed')).toBe('true');
    setScoreRange(8, 8);
    root.querySelector<HTMLInputElement>('input[name="title-sort"][value="my-score"]')!.click();
    button('[data-action="reverse-list-sort"]').click();
    const collection = store.get('demo');

    button('[data-layout="large"]').click();
    expect(root.querySelectorAll('.anime-grid.large .anime-choice')).toHaveLength(2);
    expect(button('[data-layout="large"]').getAttribute('aria-pressed')).toBe('true');
    button('[data-layout="list"]').click();
    expect(root.querySelectorAll('.view-switch [aria-pressed="true"]')).toHaveLength(1);
    expect(root.querySelectorAll('.anime-table thead th')).toHaveLength(4);
    expect(tableIds()).toEqual(['9253', '1']);
    expect(root.querySelectorAll('#anime-cards img, #anime-cards .cover-placeholder')).toHaveLength(0);
    expect(root.querySelectorAll('input[name="anime"]:checked')).toHaveLength(2);
    expect(store.get('demo')).toEqual(collection);

    button('[data-screen="import"]').click();
    button('[data-screen="selection"]').click();
    expect(root.querySelector('.anime-table')).not.toBeNull();
    expect(button('[data-layout="list"]').getAttribute('aria-pressed')).toBe('true');
    button('[data-layout="compact"]').click();
    expect(cardIds()).toEqual(['9253', '1']);
    expect(store.get('demo')).toEqual(collection);
  });

  it('синхронизирует ключ, направление и индикацию сортировки между колонками и правой панелью', () => {
    const collection = store.get('demo');
    button('[data-layout="list"]').click();
    expect(button('[data-sort-key="alphabet"]').closest('th')!.getAttribute('aria-sort')).toBe('ascending');

    button('[data-sort-key="my-score"]').click();
    expect(root.querySelector<HTMLInputElement>('input[name="title-sort"][value="my-score"]')!.checked).toBe(true);
    expect(button('[data-sort-key="my-score"]').closest('th')!.getAttribute('aria-sort')).toBe('descending');
    expect(root.querySelectorAll('th[aria-sort]')).toHaveLength(1);
    expect(tableIds()).toEqual(['5114', '199', '9253', '1', '33352', '32281']);

    button('[data-sort-key="my-score"]').click();
    expect(button('[data-action="reverse-list-sort"]').getAttribute('aria-pressed')).toBe('true');
    expect(button('[data-sort-key="my-score"]').closest('th')!.getAttribute('aria-sort')).toBe('ascending');
    expect(document.activeElement).toBe(button('[data-sort-key="my-score"]'));
    expect(tableIds()).toEqual(['9253', '1', '5114', '199', '33352', '32281']);

    button('[data-action="reverse-list-sort"]').click();
    expect(button('[data-sort-key="my-score"]').closest('th')!.getAttribute('aria-sort')).toBe('descending');
    button('[data-panel-group="display"]').click();
    root.querySelector<HTMLInputElement>('[name="display-field"][value="status"]')!.click();
    root.querySelector<HTMLInputElement>('input[name="title-sort"][value="status"]')!.click();
    expect(button('[data-sort-key="status"]').closest('th')!.getAttribute('aria-sort')).toBe('ascending');
    expect(button('[data-sort-key="my-score"]').closest('th')!.hasAttribute('aria-sort')).toBe(false);
    expect(tableIds()).toEqual(['32281', '33352', '9253', '1', '5114', '199']);

    button('[data-sort-key="community-score"]').click();
    expect(root.querySelector<HTMLInputElement>('input[name="title-sort"][value="community-score"]')!.checked).toBe(true);
    expect(button('[data-sort-key="community-score"]').closest('th')!.getAttribute('aria-sort')).toBe('descending');
    button('[data-action="reverse-list-sort"]').click();
    expect(button('[data-sort-key="community-score"]').closest('th')!.getAttribute('aria-sort')).toBe('ascending');
    button('[data-sort-key="alphabet"]').click();
    expect(root.querySelector<HTMLInputElement>('input[name="title-sort"][value="alphabet"]')!.checked).toBe(true);
    expect(button('[data-sort-key="alphabet"]').closest('th')!.getAttribute('aria-sort')).toBe('descending');
    expect(tableIds()).toEqual(['199', '32281', '5114', '1', '9253', '33352']);
    expect(store.get('demo')).toEqual(collection);
  });

  it('выбирает строки таблицы и пересчитывает массовое действие и фильтр отмеченных', () => {
    button('[data-layout="list"]').click();
    root.querySelector<HTMLLabelElement>('label[for="list-anime-5114"]')!.click();
    expect(store.get('demo')!.selectedIds).not.toContain('5114');
    expect(root.querySelector('[data-anime="5114"]')!.classList.contains('selected')).toBe(false);
    expect(button('[data-action="select-all"]').textContent).toBe('Отметить видимые');
    button('[data-action="select-all"]').click();
    expect(root.querySelectorAll('.anime-row.selected')).toHaveLength(6);
    expect(button('[data-action="select-all"]').textContent).toBe('Снять видимые отметки');

    button('[data-filter-group="selection"]').click();
    root.querySelector<HTMLInputElement>('input[name="anime"][value="5114"]')!.click();
    expect(root.querySelectorAll('.anime-row')).toHaveLength(5);
    expect(root.querySelector('[data-anime="5114"]')).toBeNull();
    button('[data-action="select-all"]').click();
    expect(root.querySelectorAll('.anime-row')).toHaveLength(0);
    expect(button('[data-action="select-all"]').disabled).toBe(true);
  });

  it('сортирует карточки и сохраняет выбор, фильтры и направление при переходах', () => {
    const collection = store.get('demo');
    expect(cardIds()).toEqual(['33352', '9253', '1', '5114', '32281', '199']);
    root.querySelector<HTMLInputElement>('input[name="title-sort"][value="my-score"]')!.click();
    expect(cardIds()).toEqual(['5114', '199', '9253', '1', '33352', '32281']);
    button('[data-action="reverse-list-sort"]').click();
    expect(cardIds()).toEqual(['9253', '1', '5114', '199', '33352', '32281']);
    setScoreRange(8, 8);
    expect(cardIds()).toEqual(['9253', '1']);
    button('[data-screen="import"]').click();
    button('[data-screen="selection"]').click();
    expect(cardIds()).toEqual(['9253', '1']);
    expect(button('[data-action="reverse-list-sort"]').getAttribute('aria-pressed')).toBe('true');
    expect(root.querySelector<HTMLInputElement>('input[name="title-sort"][value="my-score"]')!.checked).toBe(true);
    expect(store.get('demo')).toEqual(collection);
  });

  it('одна кнопка выбирает все показанные тайтлы при частичном выборе и снимает полный выбор', () => {
    expect(root.querySelectorAll('.text-actions button')).toHaveLength(1);
    expect(button('[data-action="select-all"]').textContent).toBe('Снять видимые отметки');
    button('[data-action="select-all"]').click();
    expect(store.get('demo')!.selectedIds).toHaveLength(0);
    expect(button('[data-action="select-all"]').textContent).toBe('Отметить видимые');
    button('[data-action="select-all"]').click();
    expect(store.get('demo')!.selectedIds).toHaveLength(6);
    expect(button('[data-action="select-all"]').textContent).toBe('Снять видимые отметки');
    root.querySelector<HTMLElement>('[data-anime="5114"]')!.click();
    expect(store.get('demo')!.selectedIds).toHaveLength(5);
    expect(button('[data-action="select-all"]').textContent).toBe('Отметить видимые');
    root.querySelector<HTMLElement>('[data-anime="5114"]')!.click();
    expect(button('[data-action="select-all"]').textContent).toBe('Снять видимые отметки');
    root.querySelector<HTMLElement>('[data-anime="5114"]')!.click();
    button('[data-action="select-all"]').click();
    expect(store.get('demo')!.selectedIds).toHaveLength(6);
    expect(button('[data-action="select-all"]').textContent).toBe('Снять видимые отметки');
  });

  it('переключает только показанные тайтлы, сохраняя скрытые отметки', () => {
    root.querySelector<HTMLElement>('[data-anime="5114"]')!.click();
    setScoreRange(8, 8);
    expect(root.querySelectorAll('.anime-choice')).toHaveLength(2);
    expect(button('[data-action="select-all"]').textContent).toBe('Снять видимые отметки');
    button('[data-action="select-all"]').click();
    expect(store.get('demo')!.selectedIds).toEqual(['199', '33352', '32281']);
    expect(root.querySelectorAll('input[name="anime"]:checked')).toHaveLength(0);
    expect(button('[data-action="select-all"]').textContent).toBe('Отметить видимые');
    button('[data-action="select-all"]').click();
    expect(store.get('demo')!.selectedIds).toHaveLength(5);
    expect(root.querySelectorAll('input[name="anime"]:checked')).toHaveLength(2);
    expect(button('[data-action="select-all"]').textContent).toBe('Снять видимые отметки');
  });

  it('пересчитывает фильтр отмеченных после массового действия и отключает кнопку для пустого списка', () => {
    button('[data-filter-group="selection"]').click();
    button('[data-action="select-all"]').click();
    expect(root.querySelectorAll('.anime-choice')).toHaveLength(0);
    expect(store.get('demo')!.selectedIds).toHaveLength(0);
    expect(button('[data-action="select-all"]').disabled).toBe(true);
    expect(button('[data-action="select-all"]').textContent).toBe('Отметить видимые');
    button('[data-action="select-all"]').click();
    expect(store.get('demo')!.selectedIds).toHaveLength(0);
  });

  it('переключает обычные флажки и снимает ограничение после выключения последнего', () => {
    expect(root.querySelectorAll('input[data-action="cycle-filter"]:checked')).toHaveLength(0);
    button('[data-filter-value="completed"]').click();
    expect(root.querySelector<HTMLInputElement>('[data-filter-value="completed"]')!.type).toBe('checkbox');
    expect(root.querySelectorAll('input[data-action="cycle-filter"]:checked')).toHaveLength(1);
    button('[data-filter-value="completed"]').click();
    expect(root.querySelectorAll('input[data-action="cycle-filter"]:checked')).toHaveLength(0);
    expect(root.querySelectorAll('.anime-choice')).toHaveLength(6);
  });

  it('выбирает всю группу, сохраняя ограничения другой группы и отметки карточек', () => {
    expect(button('[data-action="select-filter-group"][data-filter-group="status"]').textContent).toBe('Выбрать всё');
    button('[data-filter-value="completed"]').click();
    setScoreRange(8, 8);
    expect(root.querySelectorAll('.anime-choice')).toHaveLength(2);
    button('[data-action="select-filter-group"][data-filter-group="status"]').click();
    expect(button('[data-action="select-filter-group"][data-filter-group="status"]').textContent).toBe('Убрать всё');
    expect(button('[data-action="select-filter-group"][data-filter-group="status"]').getAttribute('aria-label')).toBe('Убрать всё: Статус');
    expect(root.querySelectorAll('.anime-choice')).toHaveLength(2);
    expect(root.querySelector<HTMLInputElement>('#score-merged')!.value).toBe('8');
    button('[data-action="select-filter-group"][data-filter-group="status"]').click();
    expect(button('[data-action="select-filter-group"][data-filter-group="status"]').textContent).toBe('Выбрать всё');
    expect(root.querySelectorAll('.anime-choice')).toHaveLength(2);
    expect(root.querySelectorAll('[data-filter-group="status"]:checked')).toHaveLength(0);
    setScoreRange(1, 10);
    expect(root.querySelectorAll('.anime-choice')).toHaveLength(6);
    expect(root.querySelectorAll('input[name="anime"]:checked')).toHaveLength(6);
  });

  it('ПКМ и движение не меняют выбор и не блокируют меню, обычный клик отмечает карточку', () => {
    button('[data-action="select-all"]').click();
    for (const target of [button('[data-filter-value="completed"]'), root.querySelector<HTMLElement>('[data-anime="5114"]')!]) {
      target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 2, buttons: 2, pointerId: 1 }));
      target.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, buttons: 2, pointerId: 1 }));
      target.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 2, pointerId: 1 }));
      const menu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 });
      target.dispatchEvent(menu);
      expect(menu.defaultPrevented).toBe(false);
    }
    expect(root.querySelector<HTMLInputElement>('[data-filter-value="completed"]')!.checked).toBe(false);
    expect(root.querySelectorAll('input[name="anime"]:checked')).toHaveLength(0);
    root.querySelector<HTMLElement>('[data-anime="5114"]')!.click();
    expect(store.get('demo')!.selectedIds).toEqual(['5114']);
  });
});

/** Применяет обе границы через нативное событие изменения диапазона. */
function setScoreRange(min: number, max: number): void {
  const currentMax = root.querySelector<HTMLInputElement>('#score-max, #score-merged')!.valueAsNumber;
  const bounds = [['min', min], ['max', max]] as const;
  for (const [bound, score] of min > currentMax ? [...bounds].reverse() : bounds) {
    const input = root.querySelector<HTMLInputElement>(`#score-${bound}, #score-merged`)!;
    if (input.valueAsNumber !== score) changeScore(input, score);
  }
}

/** Имитирует изменение одного бегунка, включая общий бегунок точной оценки. */
function changeScore(input: HTMLInputElement, score: number): void {
  input.value = String(score);
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

/** Находит текущую кнопку после возможного обновления панели фильтров. */
function button(selector: string): HTMLButtonElement {
  return root.querySelector<HTMLButtonElement>(selector)!;
}

/** Читает порядок карточек из DOM независимо от порядка записей коллекции. */
function cardIds(): string[] {
  return Array.from(root.querySelectorAll<HTMLElement>('.anime-choice'), card => card.dataset.anime!);
}

/** Читает порядок строк таблицы после управления сортировкой. */
function tableIds(): string[] {
  return Array.from(root.querySelectorAll<HTMLElement>('.anime-row'), row => row.dataset.anime!);
}

