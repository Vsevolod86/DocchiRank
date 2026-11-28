import type { AnimeDisplayFields } from '../entities/anime/anime-card';
import type { BackupPreview } from '../features/backup/collection-backups';
import type { CollectionView } from '../features/collection/collection-commands';
import type { SelectionPersistence } from '../features/selection/selection-persistence';
import type { ImportMethod, ImportStatus } from '../features/import-list/list-import';
import type { DisplayFilters } from '../features/selection/filters';
import type { ListSort } from '../features/selection/list-order';
import type { ComparisonScenario } from '../features/collection/comparison-scenarios';
import type { PanelGroup } from '../widgets/panel-group-toggle';

/** Настройки отображения, которыми владеет оболочка приложения. */
export interface ScreenPreferences {
  cardLayout: 'compact' | 'large' | 'list';
  displayFields: AnimeDisplayFields;
  filters: DisplayFilters;
  listSort: ListSort;
  collapsedGroups: Record<PanelGroup, boolean>;
  selectionSettingsCollapsed: boolean;
  scenario: ComparisonScenario;
  importMode: ImportMethod;
}

/** Состояние, подготовленное для отображения одного экрана. */
export interface ViewState extends ScreenPreferences, CollectionView {
  saveError: string | null;
  backup: Readonly<BackupPreview>;
  collections: ReturnType<SelectionPersistence['summary']>['collections'];
  resumeCollectionId: string | null;
  import: Readonly<ImportStatus>;
}
