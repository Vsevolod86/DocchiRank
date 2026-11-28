import type { Collection } from '../entities/collection/model';
import { resultViewData } from '../features/collection/result-view-data';
import { comparisonPage } from '../pages/comparison';
import type { ComparisonPanelOptions } from '../pages/comparison-panel';
import { importPage } from '../pages/import';
import type { PageView } from '../pages/page-view';
import { resultPage } from '../pages/result';
import { selectionPage } from '../pages/selection';
import type { RatingEditorControls } from '../widgets/result/result-widgets';
import { navigationAvailability, navigationMarkup, stepIcon } from './navigation';
import type { Screen } from './navigation';
import type { ViewState } from './state';

/** Подготовленные данные страницы и постоянной оболочки приложения. */
export interface AppView extends PageView {
  screen: Screen;
  collectionId: string | null;
  navigation: string;
  saveError: string | null;
  offerExport: boolean;
  ratingEditor: RatingEditorControls | null;
}

/** Соединяет выбранную страницу с актуальным состоянием оболочки. */
export function prepareAppView(screen: Screen, collection: Collection | null, state: ViewState): AppView {
  const { screens, canCompare } = navigationAvailability(collection, state.scenario, state.import.loading);
  const page = preparePage(screen, collection, state, canCompare);
  return {
    ...page,
    screen,
    collectionId: collection?.id ?? null,
    navigation: navigationMarkup(screen, screens),
    saveError: state.saveError,
    offerExport: collection !== null && !page.panel?.sections.history,
    ratingEditor: page.panel?.sections.distribution ? state.ratingEditor : null,
  };
}

/** Передаёт страницам нужные им данные от приложения и сценариев. */
function preparePage(screen: Screen, collection: Collection | null, state: ViewState, canCompare: boolean): PageView {
  const { displayFields, filters, listSort, collapsedGroups, sorting, comparisonError, comparisonConflict, comparisonRevision } = state;
  const settings = { displayFields, filters, listSort, collapsedGroups, loading: state.import.loading };
  if (screen === 'selection') {
    return selectionPage(collection, {
      cardLayout: state.cardLayout, displayFields, filters, listSort,
      scenario: state.scenario, import: state.import, comparisonError, comparisonComplete: sorting?.status === 'complete',
    }, {
      ...settings, collapsedGroups: { ...collapsedGroups, settings: state.selectionSettingsCollapsed },
    }, canCompare);
  }
  if (screen === 'import' || !collection) {
    return importPage({
      collections: state.collections, resumeCollectionId: state.resumeCollectionId,
      importMode: state.importMode, import: state.import,
    }, state.backup, stepIcon('import'));
  }

  const panel: ComparisonPanelOptions = {
    settings,
    history: { collapsed: collapsedGroups.history, answers: sorting?.activeAnswers ?? [], revisionOpen: comparisonRevision !== null },
  };
  if (screen === 'comparison') {
    return comparisonPage(collection, {
      sorting, comparisonError, comparisonRevision, comparisonConflict, displayFields,
      groupDisplay: state.groupDisplay, loading: state.import.loading,
    }, { ...panel, settings: { ...settings, groupDisplay: state.groupDisplay } });
  }
  return resultPage(collection, {
    data: resultViewData(collection, sorting), displayFields, feedback: { sorting, comparisonError, comparisonConflict },
    editor: state.ratingEditor, distributionCollapsed: collapsedGroups.distribution, panel,
  });
}
