import { exportCollectionButton } from '../features/backup/export-button';
import type { PageDetail, SidePanelView } from '../pages/page-view';
import { renderButton } from '../shared/ui/button';
import { observeAnimeCardTitles } from '../widgets/anime-card-layout';
import { startComparisonCarousels } from '../widgets/comparison/comparison-carousels';
import { ResultWidgets } from '../widgets/result/result-widgets';
import type { AppView } from './app-view';
import { SettingsDialog } from './settings-dialog';
import { bindThemeToggle } from './theme';

/** Владеет постоянной оболочкой и обновляет только участки с изменившейся разметкой. */
export class AppRenderer {
    private readonly shell: HTMLElement;
    private readonly navigation: HTMLElement;
    private readonly content: HTMLElement;
    private readonly panel: HTMLElement;
    private readonly panelHandleZone: HTMLElement;
    private readonly settingsDialog: SettingsDialog;
    private readonly footer: HTMLElement;
    private readonly saveError: HTMLElement;
    private readonly exportButton: HTMLButtonElement;
    private readonly sections = new Map<string, { markup: string; element: Element }>();
    private readonly openHistory = new Set<string>();
    private previous: AppView | null = null;
    private contentChangedInPlace = false;
    private navigationChangedInPlace = false;
    private animeCardTitles: ResizeObserver | null = null;
    private stopComparisonCarousels: (() => void) | null = null;
    private readonly resultWidgets = new ResultWidgets();

    /** Создаёт оболочку один раз, оставляя навигацию и рабочую область на прежних местах. */
    constructor(private readonly root: HTMLElement) {
        root.innerHTML = `<div class="app-shell">
      <aside class="sidebar" id="app-navigation-panel">
        <div class="sidebar-heading">
          <a class="brand" href="#" data-screen="import" aria-label="DocchiRank — начало">
            <img class="brand-mark" src="${import.meta.env.BASE_URL}docchirank.svg" width="26" height="26" alt="">DocchiRank
          </a>
          <div class="sidebar-actions">
          ${renderButton({
            label: 'Тёмная тема', variant: 'icon', className: 'theme-toggle',
            attributes: { title: 'Тёмная тема' },
            iconPaths: '<path class="theme-moon" d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11Z"/><g class="theme-sun"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></g>',
        })}
          ${renderButton({
            label: 'Настройки', variant: 'icon', className: 'mobile-settings-toggle', hidden: true,
            attributes: { title: 'Настройки', 'data-action': 'open-settings',
                'aria-haspopup': 'dialog', 'aria-expanded': 'false', 'aria-controls': 'mobile-settings-dialog' },
            iconPaths: '<path d="M4 7h5m4 0h7M4 17h9m4 0h3"/><circle cx="11" cy="7" r="2"/><circle cx="15" cy="17" r="2"/>',
          })}
          </div>
        </div>
        <nav aria-label="Экраны приложения"></nav>
        <span class="sidebar-footer">© ${new Date().getFullYear()} DocchiRank.</span>
      </aside>
      <div class="workspace">
        <main id="main-content">
          <div class="screen-content"></div>
          <p id="selection-save-error" class="import-error small" role="alert" hidden></p>
          ${exportCollectionButton(true)}
        </main>
        <footer class="page-footer"></footer>
      </div>
      ${sidebarHandle('navigation', 'app-navigation-panel', 'меню')}
      ${sidebarHandle('settings', 'app-settings-panel', 'боковую панель', true)}
      <dialog class="settings-dialog" id="mobile-settings-dialog" aria-labelledby="mobile-settings-heading">
        <header class="settings-dialog-heading">
          <h2 id="mobile-settings-heading">Настройки</h2>
          ${renderButton({
            label: 'Закрыть настройки', variant: 'icon', attributes: { 'data-close-settings': 'true' },
            iconPaths: '<path d="m6 6 12 12M18 6 6 18"/>',
          })}
        </header>
      </dialog>
    </div>`;
        this.shell = root.querySelector('.app-shell')!;
        this.navigation = root.querySelector('nav')!;
        this.content = root.querySelector('.screen-content')!;
        this.footer = root.querySelector('.page-footer')!;
        this.saveError = root.querySelector('#selection-save-error')!;
        this.exportButton = root.querySelector('#export-unsaved-collection')!;
        this.panel = root.ownerDocument.createElement('aside');
        this.panel.id = 'app-settings-panel';
        this.panelHandleZone = root.querySelector('.sidebar-handle-zone--settings')!;
        this.settingsDialog = new SettingsDialog(
            root.querySelector('.settings-dialog')!, root.querySelector('.mobile-settings-toggle')!,
            this.panel, this.shell,
            () => {
                if (this.previous?.screen === 'comparison') {
                    this.content.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
                }
            },
        );
        bindThemeToggle(root.querySelector('.theme-toggle')!);
        this.bindSidebarHandle(root.querySelector('.sidebar-handle--navigation')!, root.querySelector('.sidebar')!, 'navigation', 'меню');
        this.bindSidebarHandle(root.querySelector('.sidebar-handle--settings')!, this.panel, 'settings', 'боковую панель');
    }

    /** Помещает текущую боковую панель в модальное окно, сохраняя её элементы. */
    showSettings(): void {
        this.settingsDialog.show();
    }

    /** Сверяет подготовленные участки, сохраняя состояние истории и положение прокрутки. */
    render(view: AppView, focusHeading: boolean): void {
        const previous = this.previous;
        if (!view.panel || previous?.screen !== view.screen || focusHeading) this.settingsDialog.close();
        const active = this.root.ownerDocument.activeElement;
        const focused = active instanceof HTMLElement && this.root.contains(active) ? active : null;
        const panelScroll = this.panel.scrollTop;
        const sameCollection = previous?.collectionId === view.collectionId;
        if (!sameCollection) this.openHistory.clear();
        else if (previous.panel?.sections.history !== view.panel?.sections.history) this.rememberHistory();

        if (previous?.navigation !== view.navigation || this.navigationChangedInPlace) {
            this.navigation.innerHTML = view.navigation;
        }
        const replaceContent = previous?.content !== view.content || this.contentChangedInPlace;
        if (replaceContent) {
            const scenarios = sameCollection ? this.content.querySelector<HTMLElement>('.scenario-grid') : null;
            const scenarioScrollLeft = scenarios?.scrollLeft;
            const activeScenario = scenarios?.querySelector<HTMLInputElement>('.scenario-card.active input')?.value;
            this.animeCardTitles?.disconnect();
            this.stopComparisonCarousels?.();
            this.content.innerHTML = view.content;
            this.restoreScenarioScroll(scenarioScrollLeft, activeScenario);
            this.animeCardTitles = observeAnimeCardTitles(this.content);
            this.stopComparisonCarousels = startComparisonCarousels(this.content);
        }
        for (const detail of view.details) {
            if (replaceContent || previous?.details.find(item => item.id === detail.id)?.markup !== detail.markup) {
                this.updateDetail(detail);
            }
        }
        if (previous?.footer !== view.footer) this.footer.innerHTML = view.footer ?? '';
        this.updatePanel(view.panel, sameCollection);
        this.resultWidgets.update(this.content, this.panel, view.ratingEditor);
        this.panel.scrollTop = previous?.screen === view.screen ? panelScroll : 0;
        this.previous = view;
        this.contentChangedInPlace = false;
        this.navigationChangedInPlace = false;
        this.showSaveError(view.saveError);

        if (focusHeading) this.content.querySelector<HTMLElement>('h1')?.focus();
        else if (focused && !this.root.contains(focused)) this.restoreFocus(focused);
    }

    /** Отмечает прямое обновление статуса или выборки перед следующим рендером. */
    contentUpdated(navigationToo = false): void {
        this.contentChangedInPlace = true;
        this.navigationChangedInPlace ||= navigationToo;
    }

    /** Обновляет сообщение об асинхронной записи без пересоздания экрана. */
    showSaveError(error: string | null): void {
        const text = error ?? '';
        if (this.saveError.textContent !== text) this.saveError.textContent = text;
        this.saveError.hidden = !error;
        this.exportButton.hidden = !error || !this.previous?.offerExport;
    }

    /** Сохраняет положение карусели или центрирует выбранный сценарий. */
    private restoreScenarioScroll(previousOffset: number | undefined, previousScenario: string | undefined): void {
        const carousel = this.content.querySelector<HTMLElement>('.scenario-grid');
        if (!carousel || carousel.scrollWidth <= carousel.clientWidth) return;

        const active = carousel.querySelector<HTMLElement>('.scenario-card.active');
        const scenario = active?.querySelector('input')?.value;
        if (previousOffset !== undefined && scenario === previousScenario) {
            carousel.scrollLeft = previousOffset;
        } else if (active) {
            const card = active.getBoundingClientRect();
            carousel.scrollLeft += card.left - carousel.getBoundingClientRect().left + (card.width - carousel.clientWidth) / 2;
        }
    }

    /** Обновляет подробности отдельно от остальной разметки страницы. */
    private updateDetail(detail: PageDetail): void {
        const slot = this.content.querySelector<HTMLElement>(`#${detail.id}`)!;
        if (detail.replace) detail.replace(slot, detail.markup);
        else slot.innerHTML = detail.markup;
    }

    /** Обновляет секции панели отдельно, сохраняя их порядок и прямых соседей в DOM. */
    private updatePanel(view: SidePanelView | null, sameCollection: boolean): void {
        this.shell.classList.toggle('has-filters', view !== null);
        this.panelHandleZone.hidden = view === null;
        this.settingsDialog.setTitle(view?.label ?? null);
        if (!view) {
            this.panel.remove();
            this.panel.replaceChildren();
            this.sections.clear();
            return;
        }
        if (!this.panel.parentElement) this.shell.append(this.panel);
        this.panel.className = view.className;
        this.panel.setAttribute('aria-label', view.label);
        for (const [key, section] of this.sections) {
            if (!(key in view.sections)) {
                section.element.remove();
                this.sections.delete(key);
            }
        }

        let nextChild = this.panel.firstElementChild;
        for (const [key, markup] of Object.entries(view.sections)) {
            const previous = this.sections.get(key);
            let element = previous?.element;
            if (!previous || previous.markup !== markup || key === 'history' && !sameCollection) {
                const template = this.root.ownerDocument.createElement('template');
                template.innerHTML = markup;
                element = template.content.firstElementChild!;
                this.panel.insertBefore(element, previous?.element ?? nextChild);
                if (nextChild === previous?.element) nextChild = element;
                previous?.element.remove();
                this.sections.set(key, { markup, element });
                if (key === 'history') {
                    for (const entry of element.querySelectorAll<HTMLDetailsElement>('details[data-history-event]')) {
                        entry.open = this.openHistory.has(entry.dataset.historyEvent!);
                    }
                }
            }
            if (element !== nextChild) this.panel.insertBefore(element!, nextChild);
            nextChild = element!.nextElementSibling;
        }
    }

    /** Сворачивает панель на широком экране, сохраняя её содержимое и позицию прокрутки. */
    private bindSidebarHandle(handle: HTMLButtonElement, panel: HTMLElement, side: 'navigation' | 'settings', name: string): void {
        let scrollTop = 0;
        handle.addEventListener('click', () => {
            const expanded = handle.getAttribute('aria-expanded') === 'true';
            if (expanded) scrollTop = panel.scrollTop;
            this.shell.classList.toggle(`${side}-collapsed`, expanded);
            handle.setAttribute('aria-expanded', String(!expanded));
            const label = `${expanded ? 'Показать' : 'Скрыть'} ${name}`;
            handle.setAttribute('aria-label', label);
            handle.title = label;
            if (!expanded) panel.scrollTop = scrollTop;
        });
    }

    /** Запоминает открытые записи перед заменой или сворачиванием истории. */
    private rememberHistory(): void {
        const history = this.sections.get('history')?.element;
        if (!history) return;
        for (const entry of history.querySelectorAll<HTMLDetailsElement>('details[data-history-event]')) {
            if (entry.open) this.openHistory.add(entry.dataset.historyEvent!);
            else this.openHistory.delete(entry.dataset.historyEvent!);
        }
    }

    /** Ищет прежний элемент управления по тем же атрибутам, если его участок заменён. */
    private restoreFocus(focused: HTMLElement): void {
        const identity = Array.from(focused.attributes).filter(({ name }) =>
            name === 'id' || name === 'name' || name === 'value' || name.startsWith('data-'));
        if (!identity.length) return;
        const replacement = Array.from(this.root.querySelectorAll<HTMLElement>(focused.localName)).find(element =>
            !element.matches(':disabled') && identity.every(({ name, value }) => element.getAttribute(name) === value));
        replacement?.focus({ preventScroll: true });
    }
}

/** Создаёт ручку сворачивания с отдельным указанием управляемой панели. */
function sidebarHandle(side: 'navigation' | 'settings', controls: string, name: string, hidden = false): string {
    return `<div class="sidebar-handle-zone sidebar-handle-zone--${side}" ${hidden ? 'hidden' : ''}>
    <button type="button" class="sidebar-handle sidebar-handle--${side}" aria-controls="${controls}"
      aria-expanded="true" aria-label="Скрыть ${name}" title="Скрыть ${name}">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"
        stroke-linejoin="round" aria-hidden="true"><path d="m6 3 5 5-5 5"/></svg>
    </button>
  </div>`;
}
