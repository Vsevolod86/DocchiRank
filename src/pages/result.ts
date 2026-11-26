import type { AnimeDisplayFields } from '../entities/anime/anime-card';
import type { Collection } from '../entities/collection/model';
import type { CollectionView } from '../features/collection/collection-commands';
import { canExportShikimori, type ResultViewData } from '../features/collection/result-view-data';
import { ratingConflict, ratingEditor } from '../widgets/result/rating-editor';
import { replaceResultTables, resultTables } from '../widgets/result/result-table';
import { resultView, shikimoriExportButton } from '../widgets/result/result-view';
import { comparisonSections } from './comparison-panel';
import type { ComparisonPanelOptions } from './comparison-panel';
import type { PageView } from './page-view';

/** Подготовленные данные виджетов результата и общей панели. */
interface ResultPageOptions {
  data: ResultViewData;
  displayFields: Readonly<AnimeDisplayFields>;
  feedback: Parameters<typeof resultView>[1];
  editor: CollectionView['ratingEditor'];
  distributionCollapsed: boolean;
  panel: ComparisonPanelOptions;
}

/** Раскладывает результат, таблицу и секции боковой панели по независимым участкам. */
export function resultPage(collection: Collection, { data, displayFields, feedback, editor, distributionCollapsed, panel }: ResultPageOptions): PageView {
  const conflict = data.transition?.conflict;
  const table = data.groups.length > 0 ? resultTables(collection, displayFields, data) : '<p class="empty-state">Размещённых произведений пока нет.</p>';
  return {
    content: resultView(collection, feedback, data.complete),
    details: [
      {
        id: 'result-table-section',
        markup: conflict ? ratingConflict(conflict, Boolean(Object.keys(collection.ratingTransition?.choices ?? {}).length)) + table : table,
        replace: replaceResultTables,
      },
      ...(collection.profile.source !== 'demo' ? [{
        id: 'result-shikimori-export',
        markup: shikimoriExportButton(!feedback.comparisonConflict && canExportShikimori(collection, data)),
      }] : []),
    ],
    panel: {
      className: 'filter-panel result-panel',
      label: 'Распределение и настройки результата',
      sections: {
        ...(data.complete && !conflict ? { distribution: ratingEditor(collection, data, editor, distributionCollapsed) } : {}),
        ...comparisonSections(collection, panel),
      },
    },
  };
}
