import type { Collection } from '../entities/collection/model';
import { listMedia } from '../entities/collection/model';
import { pendingSelectionView } from '../widgets/import/import-view';
import { selectionView } from '../widgets/selection/selection-view';
import type { SelectionViewOptions } from '../widgets/selection/selection-view';
import { settingsPanel } from '../widgets/settings/settings-panel';
import type { SettingsOptions } from '../widgets/settings/settings-panel';
import type { PageView } from './page-view';

/** Показывает подготовку списка или выборку с её настройками. */
export function selectionPage(collection: Collection | null, options: SelectionViewOptions, settings: SettingsOptions, canCompare: boolean): PageView {
  const { method, loading } = options.import;
  if (!collection || loading && method === 'profile') {
    return { content: pendingSelectionView(options.import), details: [], panel: null };
  }
  return {
    content: selectionView(collection, options, canCompare),
    details: [],
    panel: {
      className: 'filter-panel', label: 'Настройки набора',
      sections: { settings: settingsPanel(settings, true, listMedia(collection)) },
    },
  };
}
