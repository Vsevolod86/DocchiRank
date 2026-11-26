import type { CollectionView } from '../../features/collection/collection-commands';
import { observeRatingChart } from './rating-chart';
import { syncRatingEditor } from './rating-editor';
import { observeResultTitles } from './result-table';

export type RatingEditorControls = Pick<CollectionView['ratingEditor'], 'method' | 'center'>;

interface ObservedElement {
  element: HTMLElement;
  observer: ResizeObserver;
}

/** Синхронизирует редактор и владеет измерениями подключённых таблицы и диаграммы. */
export class ResultWidgets {
  private chart: ObservedElement | null = null;
  private table: ObservedElement | null = null;

  /** Переподключает наблюдателей только при замене или снятии соответствующего участка. */
  update(content: HTMLElement, panel: HTMLElement, editor: RatingEditorControls | null): void {
    if (editor) syncRatingEditor(panel, editor);
    this.chart = watch(panel.querySelector<HTMLElement>('.rating-distribution'), this.chart, observeRatingChart);
    this.table = watch(content.querySelector<HTMLElement>('.ordered-result'), this.table, observeResultTitles);
  }
}

/** Сохраняет наблюдателя неизменившегося узла и отключает его при замене. */
function watch(element: HTMLElement | null, previous: ObservedElement | null, observe: (element: HTMLElement) => ResizeObserver): ObservedElement | null {
  if (element === (previous?.element ?? null)) return previous;
  previous?.observer.disconnect();
  return element ? { element, observer: observe(element) } : null;
}
