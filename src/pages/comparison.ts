import type { Collection } from '../entities/collection/model';
import { comparisonShortcuts, comparisonView } from '../widgets/comparison/comparison-view';
import type { ComparisonOptions } from '../widgets/comparison/comparison-view';
import { comparisonSections } from './comparison-panel';
import type { ComparisonPanelOptions } from './comparison-panel';
import type { PageView } from './page-view';

/** Раскладывает текущую пару, настройки и историю по участкам сравнения. */
export function comparisonPage(collection: Collection, options: ComparisonOptions, panelOptions: ComparisonPanelOptions): PageView {
  const sections = comparisonSections(collection, panelOptions);
  return {
    content: comparisonView(collection, options),
    footer: comparisonShortcuts(options),
    details: [],
    panel: { className: 'filter-panel comparison-panel', label: 'Настройки и история сравнения', sections },
  };
}
