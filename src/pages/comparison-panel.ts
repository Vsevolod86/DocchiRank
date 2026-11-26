import type { Collection } from '../entities/collection/model';
import { historyPanel } from '../widgets/comparison-history/history-view';
import type { HistoryPanelOptions } from '../widgets/comparison-history/history-view';
import { settingsPanel } from '../widgets/settings/settings-panel';
import type { SettingsOptions } from '../widgets/settings/settings-panel';
import type { SidePanelView } from './page-view';

/** Данные общей боковой панели сравнения и результата. */
export interface ComparisonPanelOptions {
  settings: SettingsOptions;
  history: HistoryPanelOptions;
}

/** Составляет секции, которые одинаковы на сравнении и в результате. */
export function comparisonSections(collection: Collection, { settings, history }: ComparisonPanelOptions): SidePanelView['sections'] {
  return { settings: settingsPanel(settings, false), history: historyPanel(collection, history) };
}
