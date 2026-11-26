import type { Collection, Score } from '../../entities/collection/model';
import { ratingAssignments, reconcileRatings } from '../../entities/collection/ratings';
import type { ReconciledRatings } from '../../entities/collection/ratings';
import type { EngineView } from '../../entities/sorting/session';

/** Общий результат расчёта оценок для таблицы и боковой панели. */
export interface ResultViewData {
    groups: string[][];
    complete: boolean;
    editable: boolean;
    grades: Record<string, Score>;
    transition: ReconciledRatings | null;
}

/** Вычисляет оценки по текущему порядку или подставляет прежние оценки на время сравнения. */
export function resultViewData(collection: Collection, sorting: EngineView | null): ResultViewData {
    const groups = sorting?.orderedGroups ?? collection.orderedIds.map(id => [id]);
    const complete = sorting?.status === 'complete';
    const transition = complete && collection.ratingTransition
        ? reconcileRatings(groups, collection.ratings, collection.ratingTransition) : null;
    const editable = complete && !collection.ratingTransition;
    const grades = transition?.assignments
        ?? (editable ? ratingAssignments(groups, collection.ratings) : collection.ratingTransition?.scores ?? {});
    return { groups, complete, editable, grades, transition };
}

/** Проверяет наличие итоговых баллов после распределения всех тайтлов. */
export function canExportShikimori(collection: Collection, data: ResultViewData): boolean {
    return collection.profile.source !== 'demo' && data.complete && !data.transition?.conflict
        && !data.transition?.pending.length && Object.keys(data.grades).length > 0;
}
