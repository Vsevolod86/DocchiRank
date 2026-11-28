import '../config/interface.css';
import '../app/layout.css';
import '../styles.css';
import '../entities/anime/anime-card.css';
import '../widgets/anime-card-layout.css';
import '../widgets/comparison-history/history-view.css';
import '../widgets/result/rating-editor.css';
import '../widgets/result/result-table.css';
import '../widgets/settings/filter-controls.css';
import './style.css';
import { restoreTheme } from '../app/theme';
import { DEMO_SNAPSHOT } from '../demo/data';
import { createDisplayFilters, cycleDisplayFilter, visibleEntries } from '../features/selection/filters';
import { escapeHtml } from '../shared/lib/escape-html';
import { renderButton } from '../shared/ui/button';
import { preventLabelActivationOnCardTitle, renderCard } from '../shared/ui/card';
import { renderInput } from '../shared/ui/input';
import { renderSelect } from '../shared/ui/select';
import { observeAnimeCardTitles } from '../widgets/anime-card-layout';
import { observeRatingChart, ratingChart } from '../widgets/result/rating-chart';
import { selectionCard } from '../widgets/selection/selection-view';
import { selectionFilterToggle } from '../widgets/settings/selection-filter';
import { openApplicationSample } from './application-sample';

const exampleFilters = createDisplayFilters();
restoreTheme(document);
const exampleSelection = { ...DEMO_SNAPSHOT, selectedIds: DEMO_SNAPSHOT.entries.slice(0, 2).map(entry => entry.animeId) };

const layers = [
  {
    title: 'Ядро', path: 'shared',
    sections: [
      { id: 'buttons', title: 'Кнопки', source: 'shared/ui/button.ts', markup: buttonSamples() },
      { id: 'inputs', title: 'Поля ввода', source: 'shared/ui/input.ts', markup: inputSamples() },
      { id: 'select', title: 'Раскрывающийся список', source: 'shared/ui/select.ts', markup: selectSample() },
      { id: 'cards', title: 'Карточки', source: 'shared/ui/card.ts', markup: cardSample() },
      { id: 'tokens', title: 'Токены оформления', source: 'shared/ui/tokens.css', markup: tokenSamples() },
    ],
  },
  {
    title: 'Виджеты', path: 'widgets',
    sections: [
      { id: 'anime-cards', title: 'Карточка произведения', source: 'widgets/selection', markup: animeCardSamples() },
      { id: 'selection-filter', title: 'Тройной флажок', source: 'widgets/settings', markup: `<div class="catalog-surface" id="filter-sample">${filterSample()}</div>` },
      { id: 'rating-chart', title: 'Диаграмма оценок', source: 'widgets/result/rating-chart.ts', markup: `<div class="catalog-surface">${ratingChart({ '1': 4, '2': 5, '3': 6, '4': 6, '5': 6, '6': 7, '7': 7, '8': 8 })}</div>` },
      { id: 'composite-widgets', title: 'Составные виджеты', source: 'widgets', markup: `<div class="catalog-surface">
        <p>Проверь импорт, выборку и настройки, сравнение, историю и распределение оценок на демонстрационном наборе.</p>
        ${renderButton({ label: 'Открыть демонстрацию', variant: 'primary', attributes: { id: 'open-application-sample' } })}
      </div>` },
    ],
  },
];

document.querySelector('#catalog-nav')!.innerHTML = layers
  .map(({ title, path, sections }) => `<div class="catalog-layer">
    <h2>${title}</h2><code>${path}</code>
    <div class="catalog-links">${sections.map(section => `<a href="#${section.id}">${section.title}</a>`).join('')}</div>
  </div>`).join('');
document.querySelector('#catalog-sections')!.innerHTML = layers.flatMap(layer => layer.sections)
  .map(({ id, title, source, markup }) => `<section class="catalog-section" id="${id}">
    <header class="catalog-section-heading">
      <h2>${title}</h2>
      <code>${source}</code>
    </header>
    ${markup}
  </section>`).join('');

const sampleStatus = document.querySelector<HTMLOutputElement>('#button-status')!;
document.querySelector('#buttons')!.addEventListener('click', event => {
  if (!(event.target instanceof Element)) return;
  const button = event.target.closest<HTMLButtonElement>('button[data-sample]');
  if (button) sampleStatus.value = `Нажата кнопка «${button.dataset.sample}».`;
});
const animeCards = document.querySelector<HTMLElement>('#anime-cards')!;
observeAnimeCardTitles(animeCards);
animeCards.addEventListener('click', preventLabelActivationOnCardTitle);
animeCards.addEventListener('change', event => {
  const input = event.target;
  if (input instanceof HTMLInputElement && input.name === 'anime') {
    input.closest('label')?.classList.toggle('selected', input.checked);
  }
});
const sampleFilter = document.querySelector<HTMLElement>('#filter-sample')!;
sampleFilter.addEventListener('click', event => {
  if (!(event.target instanceof Element) || !event.target.closest('button[data-action="cycle-filter"]')) return;
  cycleDisplayFilter(exampleFilters, 'selection', 'selected');
  sampleFilter.innerHTML = filterSample();
  sampleFilter.querySelector('button')?.focus({ preventScroll: true });
});
observeRatingChart(document.querySelector<HTMLElement>('#rating-chart .rating-distribution')!);
document.querySelector('#open-application-sample')!.addEventListener('click', openApplicationSample);

/** Показывает доступные и заблокированные кнопки каждого варианта. */
function buttonSamples(): string {
  const variants: { title: string; button: Parameters<typeof renderButton>[0] }[] = [
    { title: 'Основная', button: { variant: 'primary', label: 'Сохранить' } },
    { title: 'Вторичная', button: { variant: 'secondary', label: 'Отменить' } },
    { title: 'Текстовая', button: { variant: 'text', label: 'Подробнее' } },
    { title: 'С иконкой', button: { variant: 'icon', label: 'Обновить', iconPaths: '<path d="M20 10a8 8 0 0 0-14-5L3 8m0-5v5h5m-4 6a8 8 0 0 0 14 5l3-3m0 5v-5h-5"/>' } },
  ];
  return `<div class="catalog-surface">
    <ul class="variant-grid">${variants.map(({ title, button }) => `<li>
      <div class="variant-heading"><strong>${title}</strong><code>${button.variant}</code></div>
      <div class="button-preview">
        ${renderButton({ ...button, attributes: { 'data-sample': button.label } })}
        ${renderButton({ ...button, label: button.variant === 'icon' ? 'Обновить (заблокирована)' : 'Недоступна', disabled: true })}
      </div>
    </li>`).join('')}</ul>
    <output id="button-status">Выбери доступную кнопку, чтобы проверить действие.</output>
  </div>`;
}

/** Показывает текстовые и файловые поля, флажки и переключатели. */
function inputSamples(): string {
  return `<div class="catalog-surface field-grid">
    <label class="sample-field">
      <span>Текстовое поле</span>
      ${renderInput({ type: 'text', value: '', appearance: 'outlined', placeholder: 'Введи текст' })}
    </label>
    <label class="sample-field">
      <span>Заблокированное поле</span>
      ${renderInput({ type: 'text', value: 'Пример значения', appearance: 'outlined', disabled: true })}
    </label>
    <label class="sample-field">
      <span>Выбор файла <code>outlined</code></span>
      ${renderInput({ type: 'file', accept: '.json,application/json', appearance: 'outlined' })}
    </label>
    <label class="sample-field">
      <span>Выбор файла <code>compact</code></span>
      ${renderInput({ type: 'file', accept: '.json,application/json', appearance: 'compact' })}
    </label>
    <fieldset class="sample-options">
      <legend>Флажки <code>checkbox</code></legend>
      <label>${renderInput({ type: 'checkbox', checked: false })} Не выбран</label>
      <label>${renderInput({ type: 'checkbox', checked: true })} Выбран</label>
      <label>${renderInput({ type: 'checkbox', checked: false, disabled: true })} Заблокирован</label>
    </fieldset>
    <fieldset class="sample-options">
      <legend>Переключатели <code>radio</code></legend>
      <label>${renderInput({ type: 'radio', name: 'sample-choice', value: 'first', checked: true })} Первый</label>
      <label>${renderInput({ type: 'radio', name: 'sample-choice', value: 'second', checked: false })} Второй</label>
      <label>${renderInput({ type: 'radio', name: 'sample-choice', value: 'third', checked: false, disabled: true })} Заблокирован</label>
    </fieldset>
  </div>`;
}

/** Показывает обычный выбор, недоступный вариант и заблокированный список. */
function selectSample(): string {
  const options = [
    { value: 'comfortable', label: 'Обычный' },
    { value: 'compact', label: 'Компактный' },
    { value: 'large', label: 'Крупный', disabled: true },
  ];
  return `<div class="catalog-surface field-grid">
    <label class="sample-field"><span>Размер карточек</span>${renderSelect({ options, appearance: 'outlined', value: 'comfortable' })}</label>
    <label class="sample-field"><span>Заблокированный список</span>${renderSelect({ options, appearance: 'outlined', value: 'compact', disabled: true })}</label>
  </div>`;
}

/** Показывает оболочку карточки с примером содержимого. */
function cardSample(): string {
  return `<div class="card-preview">
    ${renderCard({
      className: 'sample-card',
      attributes: { 'aria-labelledby': 'sample-card-title' },
      contentMarkup: '<h3 id="sample-card-title" class="card-title">Демонстрация</h3><p>Карточка задаёт фон, рамку и внутренний отступ. Заголовок и содержимое передаёт экран.</p>',
    })}
  </div>`;
}

/** Берёт значения цветов, отступов и шрифта из действующих CSS-токенов. */
function tokenSamples(): string {
  const colors = ['--text', '--canvas', '--surface', '--accent', '--muted', '--line', '--focus'];
  const spacing = ['--space-sm', '--space-md', '--space-lg', '--space-xl'];
  const styles = getComputedStyle(document.documentElement);
  const value = (name: string) => escapeHtml(styles.getPropertyValue(name).trim());
  return `<div class="catalog-surface token-groups">
    <div>
      <h3>Цвета</h3>
      <ul class="token-grid">${colors.map(name => `<li>
        <span class="color-sample" aria-hidden="true" style="--sample: var(${name})"></span>
        <code>${name}</code><code>${value(name)}</code>
      </li>`).join('')}</ul>
    </div>
    <div>
      <h3>Отступы</h3>
      <ul class="token-grid">${spacing.map(name => `<li>
        <span class="spacing-sample" aria-hidden="true" style="--sample: var(${name})"></span>
        <code>${name}</code><code>${value(name)}</code>
      </li>`).join('')}</ul>
    </div>
    <div class="font-token">
      <span class="font-sample" aria-hidden="true">Аа 123</span>
      <div><h3>Шрифт</h3><code>--font-family</code><code>${value('--font-family')}</code></div>
    </div>
  </div>`;
}

/** Показывает реальную карточку выборки в крупной и компактной раскладках. */
function animeCardSamples(): string {
  const anime = DEMO_SNAPSHOT.animes[1]!;
  const entry = DEMO_SNAPSHOT.entries.find(item => item.animeId === anime.id)!;
  const fields = { russianTitle: true, originalTitle: true, status: true, userScore: true, communityScore: false, shikimoriLink: false };
  return `<div class="catalog-surface card-layout-samples">
    ${([['large', 'Крупная'], ['compact', 'Компактная']] as const).map(([layout, label]) => `<div>
      <h3>${label}</h3>
      <div class="anime-grid ${layout}">${selectionCard(anime, entry, { fields, selected: layout === 'compact', disabled: false })}</div>
    </div>`).join('')}
  </div>`;
}

/** Показывает состояние флажка и число видимых произведений демонстрационной выборки. */
function filterSample(): string {
  const visible = visibleEntries(exampleSelection, exampleFilters).length;
  return `${selectionFilterToggle(exampleFilters.selection)}<output class="filter-sample-count">Показано: ${visible} из ${exampleSelection.entries.length}</output>`;
}
