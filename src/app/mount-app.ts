import { COMPARISON_KEYS, SCREEN_DEFAULTS } from '../config/interface';
import type { Collection } from '../entities/collection/model';
import { listMedia } from '../entities/collection/model';
import { CollectionBackups, exportBackup } from '../features/backup/collection-backups';
import { CollectionCommands } from '../features/collection/collection-commands';
import { GROUP_DISPLAYS } from '../features/collection/group-display';
import { canExportShikimori, resultViewData } from '../features/collection/result-view-data';
import { ListImport } from '../features/import-list/list-import';
import type { ImportSources } from '../features/import-list/list-import';
import { createDisplayFilters, cycleDisplayFilter, initialDisplayFilters, toggleFilterGroup, withScoreBound } from '../features/selection/filters';
import { selectAnime, selectionDetails, toggleVisibleSelection } from '../features/selection/selection';
import { SelectionPersistence } from '../features/selection/selection-persistence';
import { downloadJson } from '../shared/lib/download-json';
import { preventLabelActivationOnCardTitle } from '../shared/ui/card';
import { showMissingProfileDialog } from '../widgets/import/import-view';
import { highlightResultLinks } from '../widgets/result/result-table';
import { openShikimoriExportDialog } from '../widgets/result/shikimori-export-dialog';
import { previewScoreRange, scoreAtPosition, scoreInputBound } from '../widgets/settings/score-filter';
import { normalizeShikimoriProfilePaste } from '../widgets/shikimori/profile-field';
import type { CollectionStore } from '../storage/collection-store';
import type { SelectionStore } from '../storage/selection-store';
import type { Answer } from '../entities/sorting/session';
import { AppRenderer } from './app-renderer';
import { prepareAppView } from './app-view';
import { AppNavigation, navigationAvailability, screenFromAttribute } from './navigation';
import type { Screen } from './navigation';
import { LIST_SORTS } from '../features/selection/list-order';
import { COMPARISON_SCENARIOS } from '../features/collection/comparison-scenarios';
import type { ScreenPreferences, ViewState } from './state';

/** Соединяет экран и события DOM с командами коллекции и сценариями. */
export function mountApp(root: HTMLElement, sources: ImportSources, store: CollectionStore,
  selections?: SelectionStore): void {
  const state: ScreenPreferences = { ...structuredClone(SCREEN_DEFAULTS), filters: createDisplayFilters() };
  const commands = new CollectionCommands();
  const navigation = new AppNavigation(commands);
  const keyboardScope: EventTarget = root.closest('dialog') ?? root.ownerDocument;
  const backups = new CollectionBackups(store);
  const persistence = new SelectionPersistence(store, selections, selections?.get() ?? null);
  const renderer = new AppRenderer(root);
  const imports = new ListImport(sources, store, {
    currentCollection: () => commands.collection,
    apply: applyImportedCollection,
    save: saveSelection,
    onProgress: showImportProgress,
    onChange: event => {
      const { method, error } = imports.status;
      const showListLoading = event === 'profile-verified';
      if (showListLoading) navigate('selection');
      const focusHeading = showListLoading
        || event === 'finish' && method !== 'metadata' && !error && navigation.screen === 'selection';
      render(focusHeading);
      if (event === 'finish' && method === 'profile' && error && navigation.screen === 'import') {
        const field = root.querySelector<HTMLInputElement>('#profile-input');
        if (field && error.code === 'not-found') showMissingProfileDialog(field, error.message);
        else field?.focus({ preventScroll: true });
      }
    },
  });

  /** Обрабатывает переходы, выбор набора, обновление и отмену загрузки. */
  async function handleClick(event: MouseEvent): Promise<void> {
    if (!(event.target instanceof Element)) return;
    const target = event.target.closest<HTMLElement>('[data-screen], [data-action]');
    if (!target || target.matches(':disabled')) return;
    if (target.dataset.action === 'score-track' && target !== event.target) return;
    event.preventDefault();
    if (target.dataset.action === 'open-settings') {
      const groups = state.collapsedGroups;
      if (navigation.screen === 'selection') {
        if (state.selectionSettingsCollapsed) {
          state.selectionSettingsCollapsed = false;
          render();
        }
      } else if (groups.settings) {
        groups.settings = false;
        groups.display = false;
        render();
      }
      renderer.showSettings();
      return;
    }
    if (target.dataset.action === 'cancel-import') { imports.cancel(); return; }
    if (target.dataset.action === 'toggle-panel-group') {
      const groups = state.collapsedGroups;
      const group = target.dataset.panelGroup as keyof typeof groups | undefined;
      if (!group || !Object.hasOwn(groups, group)) return;
      if (group === 'settings' && navigation.screen === 'selection') {
        state.selectionSettingsCollapsed = !state.selectionSettingsCollapsed;
      } else {
        groups[group] = !groups[group];
        const child = target.dataset.expandGroup as keyof typeof groups | undefined;
        if (!groups[group] && child && Object.hasOwn(groups, child)) groups[child] = false;
      }
      render();
      root.querySelector<HTMLButtonElement>(`[data-action="toggle-panel-group"][data-panel-group="${group}"]`)?.focus({ preventScroll: true });
      return;
    }
    if (imports.status.loading) return;

    if (target.dataset.action === 'resume-selection') { resumeSelection(); return; }
    if (target.dataset.action === 'retry-list-import') {
      await imports.importProfile(imports.status.profileInput);
      return;
    }
    if (target.dataset.action === 'import-backup-copy' || target.dataset.action === 'import-backup-replace') {
      restoreBackup(target.dataset.action === 'import-backup-copy'); return;
    }
    if (target.dataset.action === 'cancel-backup') { backups.cancel(); render(); return; }

    const collection = commands.collection;
    const destination = screenFromAttribute(target.dataset.screen);
    if (destination) {
      const { screens } = navigationAvailability(collection, state.scenario, imports.status.loading);
      if (!screens[destination]) return;
      if (destination === 'comparison') {
        if (!collection?.session) { startComparison(); return; }
        if (navigation.screen === 'selection') { resumeComparison(); return; }
      }
      navigate(destination);
      imports.resetFeedback();
      render(true);
      return;
    }
    if (target.dataset.action === 'load-demo') {
      const demo = await imports.loadDemo();
      applyImportedCollection(demo, 'restore');
      imports.resetFeedback();
      render(true);
      return;
    }
    if (!collection) return;
    if (handleRatingAction(target)) return;
    if (target.dataset.action === 'start-comparison') { startComparison(); return; }
    if (target.dataset.action === 'resume-comparison') { resumeComparison(); return; }
    if (target.dataset.action === 'reposition' && target.dataset.reviewId) { startComparison(target.dataset.reviewId); return; }
    if (target.dataset.action === 'export-collection') { exportCollection(); return; }
    if (navigation.screen === 'result' && target.dataset.action === 'export-shikimori-json') {
      const data = resultViewData(collection, commands.view.sorting);
      if (!commands.view.comparisonConflict && canExportShikimori(collection, data)) {
        openShikimoriExportDialog(collection, new Map(Object.entries(data.grades)), sources.shikimori);
      }
      return;
    }
    if (target.dataset.action === 'revise-pair' && target.dataset.eventId) {
      navigation.openRevision(target.dataset.eventId);
      render(true);
      return;
    }
    if (target.dataset.action === 'answer') {
      const answer = target.dataset.answer;
      if (isAnswer(answer)) runComparisonCommand(() => commands.answer(answer));
      return;
    }
    if (target.dataset.action === 'undo-comparison') { runComparisonCommand(() => commands.undo()); return; }
    if (target.dataset.action === 'cancel-revision' && commands.view.comparisonRevision) {
      navigation.cancelRevision();
      if (initializeResult()) void saveSelection();
      render(true);
      return;
    }
    if (target.dataset.action === 'confirm-revision' && commands.view.comparisonRevision && commands.view.comparisonConflict) {
      runComparisonCommand(() => commands.confirmRevision());
      return;
    }
    if (target.dataset.action === 'cycle-filter') {
      if (!cycleDisplayFilter(state.filters, target.dataset.filterGroup, target.dataset.filterValue)) return;
      render();
      root.querySelector<HTMLButtonElement>(`[data-filter-group="${target.dataset.filterGroup}"][data-filter-value="${target.dataset.filterValue}"]`)?.focus({ preventScroll: true });
      return;
    }
    if (target.dataset.action === 'select-filter-group') {
      if (toggleFilterGroup(state.filters, target.dataset.filterGroup, collection ? listMedia(collection) : undefined)) render();
      root.querySelector<HTMLButtonElement>(`[data-action="select-filter-group"][data-filter-group="${target.dataset.filterGroup}"]`)?.focus({ preventScroll: true });
      return;
    }
    if (target.dataset.action === 'score-track') {
      const score = scoreAtPosition(target, event.clientX);
      if (score === null) return;
      const { min, max } = state.filters.score;
      applyScoreBound(score <= (min + max) / 2 ? 'min' : 'max', score);
      return;
    }
    if (target.dataset.action === 'reset-filters') {
      state.filters = createDisplayFilters();
      render();
      root.querySelector<HTMLButtonElement>('[data-action="reset-filters"]')?.focus({ preventScroll: true });
      return;
    }
    if (target.dataset.action === 'set-card-layout') {
      const layout = target.dataset.layout;
      if (layout !== 'compact' && layout !== 'large' && layout !== 'list') return;
      state.cardLayout = layout;
      render();
      root.querySelector<HTMLButtonElement>(`[data-action="set-card-layout"][data-layout="${layout}"]`)?.focus();
      return;
    }
    if (target.dataset.action === 'reverse-list-sort') {
      state.listSort.reversed = !state.listSort.reversed;
      render();
      root.querySelector<HTMLButtonElement>('[data-action="reverse-list-sort"]')?.focus({ preventScroll: true });
      return;
    }
    if (target.dataset.action === 'sort-by-column') {
      const option = LIST_SORTS.find(item => item.key === target.dataset.sortKey);
      if (!option) return;
      if (state.listSort.key === option.key) state.listSort.reversed = !state.listSort.reversed;
      state.listSort.key = option.key;
      render();
      root.querySelector<HTMLButtonElement>(`[data-action="sort-by-column"][data-sort-key="${option.key}"]`)?.focus();
      return;
    }
    if (target.dataset.action === 'refresh') {
      await imports.importProfile(collection.profile.nickname, listMedia(collection));
      return;
    }
    if (target.dataset.action === 'select-all') {
      if (!toggleVisibleSelection(collection, state.filters)) return;
      void saveSelection();
      render();
      root.querySelector<HTMLButtonElement>(`[data-action="${target.dataset.action}"]`)?.focus();
    }
  }

  /** Открывает выбранный сценарий, сохраняя сессию и стартовые оценки вместе. */
  function startComparison(reviewId?: string): void {
    if (commands.startComparison(state.scenario, reviewId)) {
      changeScreen(navigation.comparisonProgressScreen);
      void saveSelection();
    }
    render(true);
  }

  /** Возвращает к сравнению и применяет правки, сделанные на экране набора. */
  function resumeComparison(): void {
    const updated = navigation.screen === 'selection' ? commands.resumeComparison() : null;
    if (updated === true) {
      changeScreen(navigation.comparisonProgressScreen);
      void saveSelection();
    } else if (updated === null) navigate('comparison');
    render(true);
  }

  /** Запускает доступную кнопку сравнения по её клавиатурной комбинации. */
  function handleComparisonShortcut(event: Event): void {
    if (!root.isConnected) {
      keyboardScope.removeEventListener('keydown', handleComparisonShortcut);
      return;
    }
    if (!(event instanceof KeyboardEvent) || navigation.screen !== 'comparison' || event.defaultPrevented || event.isComposing
      || event.altKey || event.metaKey || event.shiftKey) return;

    const target = event.target;
    if (!(target instanceof Element) || (!root.contains(target) && target !== root.ownerDocument.body)) return;
    if (root.querySelector('.settings-dialog[open]') || target.closest('input:not([type="checkbox"]), select, textarea')
      || (target instanceof HTMLElement && target.isContentEditable)) return;
    if ((event.key === ' ' || event.key === 'ArrowDown') && target.closest('.comparison-group-scroll')) return;
    if (event.key === ' ' && target.closest('.sidebar-actions, .sidebar-handle, .filter-panel, input[type="checkbox"], .comparison-group button')) return;

    let shortcut = event.key === ' ' ? 'Space' : event.key;
    if (event.ctrlKey) {
      const undo = COMPARISON_KEYS.undo;
      shortcut = event.code === undo.code ? undo.key : `Control+${event.key.toUpperCase()}`;
      if (shortcut !== undo.key) return;
    }
    const button = Array.from(root.querySelectorAll<HTMLButtonElement>('button[aria-keyshortcuts]:not(:disabled)'))
      .find(button => button.getAttribute('aria-keyshortcuts') === shortcut && !button.closest('[hidden]'));
    if (!button) return;

    event.preventDefault();
    if (event.repeat) return;
    if (target.closest('.filter-panel')) root.querySelector<HTMLElement>('.comparison-section h1')?.focus({ preventScroll: true });
    button.click();
  }

  /** Переводит фокус при переходе между сравнением, пересмотром и результатом. */
  function runComparisonCommand(command: () => boolean): void {
    const previousScreen = navigation.screen;
    const revision = commands.view.comparisonRevision;
    if (command()) {
      changeScreen(navigation.comparisonProgressScreen);
      void saveSelection();
    }
    render(previousScreen !== navigation.screen || revision !== commands.view.comparisonRevision);
    if (commands.view.comparisonConflict) root.querySelector<HTMLElement>('#conflict-heading')?.focus();
  }

  /** После сброса переводит фокус к первому доступному полю оценки. */
  function handleRatingAction(target: HTMLElement): boolean {
    const action = target.dataset.action;
    if (action !== 'rating-placement-clear' && action !== 'reset-ratings') return false;
    const choicesOnly = action === 'rating-placement-clear';
    if (commands.resetRatings(choicesOnly)) {
      if (choicesOnly) state.collapsedGroups.distribution = false;
      void saveSelection();
    }
    render();
    const field = choicesOnly ? 'rating-placement' : 'rating-score';
    root.querySelector<HTMLElement>(`[name="${field}"]:not([disabled])`)?.focus();
    return true;
  }

  /** Передаёт значение поля редактору оценок и восстанавливает фокус. */
  function handleRatingChange(input: HTMLInputElement | HTMLSelectElement): boolean {
    if (!input.name.startsWith('rating-')) return false;
    if (commands.changeRating(input.name, input.value, input.dataset.ratingId ?? input.dataset.placementId)) void saveSelection();
    const selector = '[name="' + input.name + '"]' + (input.dataset.ratingId ? '[data-rating-id="' + input.dataset.ratingId + '"]' : '');
    render();
    root.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true });
    return true;
  }

  /** Создаёт переносимую копию без загрузки пользовательских данных на сервер. */
  function exportCollection(): void {
    const collection = commands.collection;
    if (!collection) return;
    try {
      const { filename, text } = exportBackup(collection);
      downloadJson(filename, text);
    } catch (error) {
      commands.reportError(error instanceof Error ? error.message : 'Не удалось создать резервную копию.');
      render();
    }
  }

  /** Передаёт чтение файла сценарию и отображает только актуальный предпросмотр. */
  async function readBackup(file: File): Promise<void> {
    if (await backups.read(() => file.text(), render) && navigation.screen === 'import') render();
  }

  /** Открывает коллекцию после выбора пользователем способа восстановления. */
  function restoreBackup(asCopy: boolean): void {
    const restored = backups.restore(asCopy);
    if (!restored) return;
    state.filters = initialDisplayFilters(listMedia(restored));
    state.scenario = 'new';
    imports.setMessage('Коллекция восстановлена.');
    openCollection(restored, true);
    render(true);
  }

  /** Открывает сохранённую коллекцию на текущем шаге. */
  function resumeSelection(): void {
    const stored = persistence.resumeCollection();
    if (!stored) return;
    state.filters = initialDisplayFilters(listMedia(stored));
    imports.resetFeedback(stored.session ? 'Сессия восстановлена.' : 'Набор восстановлен.');
    if (!openCollection(stored)) persistence.rememberOpened(stored);
    render(true);
  }

  /** Применяет готовую коллекцию и обновляет настройки её экрана. */
  function applyImportedCollection(collection: Collection, reason: 'import' | 'restore' | 'update'): void {
    const previousId = commands.collection?.id;
    commands.replaceCollection(collection);
    if (reason === 'update') return;
    if (reason === 'restore' || previousId !== collection.id) state.filters = initialDisplayFilters(listMedia(collection));
    if (reason === 'restore' || collection.orderedIds.length === 0) state.scenario = 'new';
    navigate('selection');
  }

  /** Показывает прогресс, сохраняя фокус и состояние остальной разметки. */
  function showImportProgress(message: string): void {
    const status = root.querySelector<HTMLElement>('#import-status');
    if (status) {
      status.textContent = message;
      status.title = message;
      status.hidden = !message;
      renderer.contentUpdated();
    }
  }
  /** Запускает импорт из соответствующей формы, включая Enter в поле профиля. */
  function handleSubmit(event: SubmitEvent): void {
    if (!(event.target instanceof HTMLFormElement)) return;
    if (event.target.id === 'json-import-form') {
      event.preventDefault();
      const file = event.target.querySelector<HTMLInputElement>('#json-input')?.files?.[0];
      if (file) void imports.importFile(file.name, () => file.text());
      return;
    }
    if (event.target.id !== 'profile-form') return;
    event.preventDefault();
    const input = event.target.querySelector<HTMLInputElement>('#profile-input');
    if (input) void imports.importProfile(input.value);
  }

  /** Обновляет выбор, повторно применяя условия для отмеченных произведений. */
  function handleChange(event: Event): void {
    if (imports.status.loading) return;
    if ((event.target instanceof HTMLSelectElement || event.target instanceof HTMLInputElement) && handleRatingChange(event.target)) return;
    if (event.target instanceof HTMLSelectElement) {
      const select = event.target;
      if (select.name === 'import-media') {
        if (select.value === 'anime' || select.value === 'manga') imports.rememberMedia(select.value);
        return;
      }
      if (select.name === 'import-method') {
        const method = select.value;
        if (method !== 'profile' && method !== 'file') return;
        const profileInput = root.querySelector<HTMLInputElement>('#profile-input');
        if (profileInput) imports.rememberInput(profileInput.value);
        state.importMode = method;
        imports.resetFeedback();
        render();
        root.querySelector<HTMLSelectElement>('#import-method')?.focus({ preventScroll: true });
        return;
      }
      if (select.name === 'resume-collection' && persistence.preferCollection(select.value)) {
        render();
        root.querySelector<HTMLSelectElement>('[name="resume-collection"]')?.focus({ preventScroll: true });
      }
      return;
    }
    if (event.target instanceof HTMLInputElement && event.target.name === 'collection-backup') {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (file) void readBackup(file);
      return;
    }
    const collection = commands.collection;
    if (!(event.target instanceof HTMLInputElement) || !collection) return;
    const input = event.target;
    if (input.name === 'score-unrated') {
      state.filters.score = { ...state.filters.score, unratedOnly: input.checked };
      render();
      return;
    }
    const scoreBound = scoreInputBound(input, state.filters.score);
    if (scoreBound) {
      applyScoreBound(scoreBound, input.valueAsNumber);
      return;
    }
    if (input.name === 'display-field') {
      const field = input.value;
      if (field !== 'russianTitle' && field !== 'originalTitle' && field !== 'status' && field !== 'userScore' && field !== 'communityScore' && field !== 'shikimoriLink') return;
      const enableResultLinks = field === 'shikimoriLink' && input.checked && !state.displayFields.shikimoriLink
        && navigation.screen === 'result';
      state.displayFields[field] = input.checked;
      render();
      if (enableResultLinks) highlightResultLinks(root);
      root.querySelector<HTMLInputElement>(`[name="display-field"][value="${field}"]`)?.focus({ preventScroll: true });
      return;
    }
    if (input.name === 'comparison-group-display' && input.checked) {
      const option = GROUP_DISPLAYS.find(item => item.key === input.value);
      if (!option) return;
      state.groupDisplay = option.key;
      render();
      return;
    }
    if (input.name === 'comparison-scenario') {
      const scenario = COMPARISON_SCENARIOS.find(item => item.key === input.value);
      if (!scenario || scenario.key !== 'new' && collection.orderedIds.length === 0) return;
      state.scenario = scenario.key;
      render();
      root.querySelector<HTMLInputElement>(`input[name="comparison-scenario"][value="${scenario.key}"]`)?.focus();
      return;
    }
    if (input.name === 'title-sort') {
      const option = LIST_SORTS.find(item => item.key === input.value);
      if (!option) return;
      state.listSort.key = option.key;
      render();
      root.querySelector<HTMLInputElement>(`input[name="title-sort"][value="${option.key}"]`)?.focus({ preventScroll: true });
      return;
    }
    if (input.name === 'anime') {
      if (!selectAnime(collection, input.value, input.checked)) return;
      void saveSelection();
      if (state.filters.selection !== 'neutral') {
        const inputs = Array.from(root.querySelectorAll<HTMLInputElement>('input[name="anime"]'));
        const index = inputs.indexOf(input);
        render();
        const remaining = Array.from(root.querySelectorAll<HTMLInputElement>('input[name="anime"]'));
        (remaining.find(item => item.value === input.value) ?? remaining[Math.min(index, remaining.length - 1)]
          ?? root.querySelector<HTMLButtonElement>('[data-action="reset-filters"]'))?.focus();
      } else updateSelection();
    }
  }

  /** Применяет выбранную границу и возвращает фокус к её бегунку после обновления. */
  function applyScoreBound(bound: 'min' | 'max', score: number): void {
    state.filters.score = withScoreBound(state.filters.score, bound, score);
    render();
    root.querySelector<HTMLInputElement>(`#score-${bound}, #score-merged`)?.focus({ preventScroll: true });
  }

  /** Показывает значение диапазона во время перетаскивания бегунка. */
  function handleInput(event: Event): void {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    const bound = scoreInputBound(input, state.filters.score);
    if (!bound) return;
    const range = withScoreBound(state.filters.score, bound, input.valueAsNumber);
    previewScoreRange(input, range, bound);
  }

  /** Заменяет недоступную обложку, сохраняя работоспособность карточки. */
  function handleImageError(event: Event): void {
    if (!(event.target instanceof HTMLImageElement)) return;
    const placeholder = document.createElement('div');
    placeholder.className = 'cover-placeholder';
    placeholder.setAttribute('role', 'img');
    placeholder.setAttribute('aria-label', 'Нет обложки');
    placeholder.textContent = 'Нет обложки';
    event.target.replaceWith(placeholder);
  }

  /** Обновляет выбор без пересоздания карточек и потери фокуса. */
  function updateSelection(): void {
    const collection = commands.collection;
    if (!collection) return;
    const { selected, countLabel, actionLabel } = selectionDetails(collection, state.filters);
    const { screens, canCompare } = navigationAvailability(collection, state.scenario, imports.status.loading);
    const count = root.querySelector('#selection-count');
    if (count) count.textContent = countLabel;
    const selectAll = root.querySelector<HTMLButtonElement>('[data-action="select-all"]');
    if (selectAll) selectAll.textContent = actionLabel;
    const hint = root.querySelector<HTMLElement>('#selection-hint');
    if (hint) hint.hidden = canCompare;
    root.querySelectorAll<HTMLButtonElement>('[data-action="start-comparison"]').forEach(button => {
      button.disabled = !canCompare;
    });
    root.querySelectorAll<HTMLButtonElement>('[data-screen="comparison"], [data-screen="result"]').forEach(button => {
      button.disabled = button.dataset.screen === 'result' ? !screens.result : !screens.comparison;
    });
    root.querySelectorAll<HTMLElement>('[data-anime]').forEach(card => {
      card.classList.toggle('selected', selected.has(card.dataset.anime!));
    });
    renderer.contentUpdated(true);
  }

  /** Открывает сохранённую коллекцию и при необходимости записывает её один раз. */
  function openCollection(collection: Collection, forceSave = false): boolean {
    const changed = commands.open(collection);
    const initialized = changeScreen(collection.session ? navigation.comparisonProgressScreen : 'selection');
    if (!forceSave && !changed && !initialized) return false;
    void saveSelection();
    return true;
  }

  /** Применяет переход и сохраняет оценки, созданные при первом открытии результата. */
  function navigate(destination: Screen): void {
    if (changeScreen(destination)) void saveSelection();
  }

  /** Применяет переход и сообщает, нужно ли сохранить стартовые оценки. */
  function changeScreen(destination: Screen): boolean {
    navigation.show(destination);
    return initializeResult();
  }

  /** Инициализирует оценки при первом показе завершённой сессии. */
  function initializeResult(): boolean {
    return navigation.screen === 'result' && commands.initializeRatings();
  }

  /** Передаёт коллекцию на запись и показывает актуальный результат в её экране. */
  async function saveSelection(collection = commands.collection): Promise<void> {
    if (!collection) return;
    const error = await persistence.save(collection);
    if (error !== undefined && commands.collection?.id === collection.id) renderer.showSaveError(error);
  }

  /** Собирает состояние экрана из данных независимых сценариев. */
  function prepareView(): ViewState {
    return {
      ...state, ...commands.view, ...persistence.summary(commands.collection?.id),
      import: imports.status, backup: backups.preview,
    };
  }

  /** Отображает подготовленные данные и восстанавливает фокус или прокрутку. */
  function render(focusHeading = false): void {
    renderer.render(prepareAppView(navigation.screen, commands.collection, prepareView()), focusHeading);
  }

  root.addEventListener('click', preventLabelActivationOnCardTitle);
  root.addEventListener('click', event => { void handleClick(event); });
  keyboardScope.addEventListener('keydown', handleComparisonShortcut);
  root.addEventListener('submit', handleSubmit);
  root.addEventListener('paste', normalizeShikimoriProfilePaste);
  root.addEventListener('input', handleInput);
  root.addEventListener('change', handleChange);
  root.addEventListener('error', handleImageError, true);
  render();
}

/** Допускает только ответы, поддерживаемые контрактом движка. */
function isAnswer(value: string | undefined): value is Answer {
  return value === 'left' || value === 'right' || value === 'tie' || value === 'skip';
}

