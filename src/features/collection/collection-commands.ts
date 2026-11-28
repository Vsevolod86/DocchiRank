import { RATING_DEFAULTS } from '../../config/ratings';
import { beginComparison, comparisonSelection, updateComparisonSelection } from '../../entities/collection/comparison';
import type { Collection, Score } from '../../entities/collection/model';
import { presetRatingCutoffs, ratingAssignments, reconcileRatings, scaleFromCutoffs, scaleToCutoffs, setGroupRating } from '../../entities/collection/ratings';
import type { RatingCutoffs } from '../../entities/collection/ratings';
import { PairwiseSorterEngine } from '../../entities/sorting/engine';
import { isRelation } from '../../entities/sorting/journal';
import type { Relation } from '../../entities/sorting/relations';
import type { Answer, EngineView, MutationResult } from '../../entities/sorting/session';

/** Снимок текущего сравнения, пересмотра и команд оценивания. */
export interface CollectionView {
  sorting: EngineView | null;
  comparisonError: string | null;
  comparisonRevision: { eventId: string; leftId: string; rightId: string; previousAnswer: Relation } | null;
  comparisonConflict: { answer: Relation; eventIds: string[]; message: string } | null;
  ratingEditor: { center: number; method: 'manual' | 'uniform' | 'bell'; error: string | null };
}

/** Управляет активной коллекцией, сессией и оценками независимо от DOM. */
export class CollectionCommands {
  private active: Collection | null = null;
  private engine: PairwiseSorterEngine | null = null;
  private readonly openedResults = new Set<string>();
  private readonly state: CollectionView = {
    sorting: null, comparisonError: null, comparisonRevision: null, comparisonConflict: null,
    ratingEditor: { center: RATING_DEFAULTS.center, method: 'manual', error: null },
  };

  /** Текущая коллекция для отображения, выбора произведений и импорта. */
  get collection(): Collection | null { return this.active; }

  /** Возвращает данные сравнения и оценивания для отображения. */
  get view(): Readonly<CollectionView> { return this.state; }

  /** Передаёт ошибку операции с активной коллекцией на экран. */
  reportError(message: string): void { this.state.comparisonError = message; }

  /** Принимает обновлённый снимок коллекции и подготавливает представление её сессии. */
  replaceCollection(collection: Collection): void {
    if (this.active?.id !== collection.id) {
      this.state.ratingEditor = { center: RATING_DEFAULTS.center, method: 'manual', error: null };
    }
    if (this.active?.session !== collection.session) {
      this.engine = collection.session ? PairwiseSorterEngine.restore(collection.session) : null;
    }
    this.active = collection;
    this.state.sorting = this.engine?.getView() ?? null;
  }

  /** Открывает сохранённую коллекцию и сообщает, изменились ли оценки. */
  open(collection: Collection): boolean {
    this.replaceCollection(collection);
    this.clearRevision();
    this.state.ratingEditor.error = null;
    this.state.ratingEditor.method = 'manual';
    return this.settleRatings();
  }

  /** Назначает стартовые оценки при первом открытии завершённого результата. */
  initializeRatings(): boolean {
    const view = this.state.sorting;
    const collection = this.active;
    if (view?.status !== 'complete' || !collection || this.openedResults.has(collection.id)) return false;
    this.openedResults.add(collection.id);
    if (collection.ratings.topScore !== null || collection.ratings.manualStart || collection.ratingTransition) return false;
    const { center, preset } = RATING_DEFAULTS;
    this.state.ratingEditor.center = center;
    this.state.ratingEditor.method = preset;
    collection.ratings = scaleFromCutoffs(view.orderedGroups, presetRatingCutoffs(view.orderedGroups, preset, center));
    return true;
  }

  /** Запускает выбранный сценарий или пересматривает место одного произведения. */
  startComparison(scenario: Parameters<typeof beginComparison>[1], reviewId?: string): boolean {
    if (!this.active) return false;
    try {
      const updated = !reviewId && comparisonSelection(this.active).scenario === scenario
        ? updateComparisonSelection(this.active) : this.active;
      this.applyComparison(updated !== this.active ? updated : beginComparison(
        this.active, reviewId ? 'review' : scenario, reviewId ? [reviewId] : this.active.selectedIds));
      return true;
    } catch (error) {
      this.state.comparisonError = error instanceof Error ? error.message : 'Не удалось начать сравнение.';
      return false;
    }
  }

  /** Применяет изменённый набор при продолжении, возвращая null, если применять нечего. */
  resumeComparison(): boolean | null {
    if (!this.active) return null;
    try {
      const updated = updateComparisonSelection(this.active);
      if (updated === this.active) return null;
      this.applyComparison(updated);
      return true;
    } catch (error) {
      this.state.comparisonError = error instanceof Error ? error.message : 'Не удалось применить набор.';
      return false;
    }
  }

  /** Открывает пару из текущего журнала, оставляя текущий вопрос за пределами пересмотра. */
  openRevision(eventId: string): boolean {
    if (this.state.comparisonRevision) return false;
    const event = this.state.sorting?.activeAnswers.find(answer => answer.id === eventId);
    if (!event?.leftId || !event.rightId || !isRelation(event.answer)) return false;
    this.state.comparisonError = null;
    this.state.comparisonRevision = { eventId, leftId: event.leftId, rightId: event.rightId, previousAnswer: event.answer };
    return true;
  }

  /** Закрывает пересмотр и убирает связанные сообщения. */
  cancelRevision(): void {
    if (this.state.comparisonRevision) this.clearRevision();
  }

  /** Применяет ответ к текущему вопросу или предлагает согласовать пересмотр. */
  answer(answer: Answer): boolean {
    const revision = this.state.comparisonRevision;
    if (!revision) {
      return this.changeComparison(engine => engine.answer(answer));
    } else if (isRelation(answer) && answer !== revision.previousAnswer && !this.state.comparisonConflict) {
      return this.changeComparison(engine => {
        const result = engine.revise(revision.eventId, answer);
        if (result.conflict) this.state.comparisonConflict = { answer, ...result.conflict };
        return result;
      });
    }
    return false;
  }

  /** После подтверждения применяет ответ вместе с пересмотром связанных решений. */
  confirmRevision(): boolean {
    const revision = this.state.comparisonRevision;
    const conflict = this.state.comparisonConflict;
    return Boolean(revision && conflict && this.changeComparison(engine => engine.revise(revision.eventId, conflict.answer, true)));
  }

  /** Отменяет последнее действие текущего цикла. */
  undo(): boolean { return this.changeComparison(engine => engine.undo()); }

  /** Изменяет способ распределения, центр колокола или оценку целого класса. */
  changeRating(field: string, input: string, id?: string): boolean {
    const collection = this.active;
    const view = this.state.sorting;
    if (!collection || view?.status !== 'complete') return false;

    const groups = view.orderedGroups;
    const editor = this.state.ratingEditor;
    editor.error = null;
    try {
      if (field === 'rating-method') {
        if (input === 'manual') editor.method = 'manual';
        else if (input === 'uniform' || input === 'bell') {
          return this.applyRatings(presetRatingCutoffs(groups, input, editor.center), input);
        }
      } else if (field === 'rating-center') {
        const center = Number(input);
        if (!Number.isFinite(center) || center < 1 || center > 10) throw new Error('Центр распределения должен быть от 1 до 10.');
        editor.center = center;
        if (editor.method === 'bell') return this.applyRatings(presetRatingCutoffs(groups, 'bell', center), 'bell');
      } else {
        const score = Number(input);
        if (!validRating(score)) return false;
        if (field === 'rating-score' && id && !collection.ratingTransition) {
          // Первая оценка задаёт начальный интервал, пока пользователь не расставил границы.
          const scale = collection.ratings.topScore === null ? { topScore: score, boundaries: [] } : collection.ratings;
          const cutoffs = scaleToCutoffs(groups, scale)!;
          return this.applyRatings(setGroupRating(groups, cutoffs, id, score), 'manual');
        } else if (field === 'rating-placement' && id && collection.ratingTransition) {
          collection.ratingTransition.choices = { ...collection.ratingTransition.choices, [id]: score };
          this.settleRatings();
          return true;
        }
      }
    } catch (error) {
      editor.error = error instanceof Error ? error.message : 'Не удалось изменить оценку.';
    }
    return false;
  }

  /** Сбрасывает выбор интервалов на стыках или шкалу оценок целиком. */
  resetRatings(choicesOnly: boolean): boolean {
    const collection = this.active;
    if (!collection || this.state.sorting?.status !== 'complete') return false;
    this.state.ratingEditor.error = null;
    try {
      if (choicesOnly) {
        if (!collection.ratingTransition) return false;
        delete collection.ratingTransition.choices;
      } else {
        collection.ratings = { topScore: null, boundaries: [], manualStart: true };
        delete collection.ratingTransition;
        this.state.ratingEditor.method = 'manual';
      }
      return true;
    } catch (error) {
      this.state.ratingEditor.error = error instanceof Error ? error.message : 'Не удалось изменить распределение.';
      return false;
    }
  }

  /** Открывает изменённое сравнение и согласовывает оценки с новым порядком. */
  private applyComparison(collection: Collection): void {
    this.replaceCollection(collection);
    this.clearRevision();
    this.state.ratingEditor.error = null;
    this.state.ratingEditor.method = 'manual';
    this.settleRatings();
  }

  /** Применяет результат команды движка вместе с согласованным порядком и оценками. */
  private changeComparison(change: (engine: PairwiseSorterEngine) => MutationResult): boolean {
    const collection = this.active;
    const view = this.state.sorting;
    if (!collection || !this.engine || !view) return false;
    try {
      const previousGrades = !collection.ratingTransition && collection.ratings.topScore !== null && view.status === 'complete'
        ? ratingAssignments(view.orderedGroups, collection.ratings) : null;
      const result = change(this.engine);
      if (!result.ok) {
        this.state.comparisonError = result.conflict?.message ?? 'Это действие сейчас недоступно.';
        return false;
      }
      collection.session = this.engine.getState();
      this.state.sorting = this.engine.getView();
      collection.orderedIds = this.state.sorting.orderedGroups.flat();
      if (previousGrades) {
        const placed = new Set(collection.orderedIds);
        collection.ratingTransition = { scores: previousGrades, changedIds: Object.keys(previousGrades).filter(id => !placed.has(id)) };
      }
      this.clearRevision();
      this.state.ratingEditor.method = 'manual';
      this.settleRatings();
      return true;
    } catch (error) {
      this.state.comparisonError = error instanceof Error ? error.message : 'Не удалось применить ответ.';
      return false;
    }
  }

  /** Применяет шкалу по стабильным опорам и задаёт способ её отображения. */
  private applyRatings(cutoffs: RatingCutoffs, method: CollectionView['ratingEditor']['method']): boolean {
    if (!this.active || !this.state.sorting || this.active.ratingTransition) return false;
    this.active.ratings = scaleFromCutoffs(this.state.sorting.orderedGroups, cutoffs);
    this.state.ratingEditor.method = method;
    return true;
  }

  /** Завершает перенос оценок после сортировки, когда все стыки разрешены. */
  private settleRatings(): boolean {
    const transition = this.active?.ratingTransition;
    const view = this.state.sorting;
    if (!this.active || !transition || view?.status !== 'complete') return false;
    const resolved = reconcileRatings(view.orderedGroups, this.active.ratings, transition, transition.choices);
    if (resolved.conflict || resolved.pending.length) return false;
    this.active.ratings = resolved.scale;
    delete this.active.ratingTransition;
    return true;
  }

  /** Убирает выбранную для пересмотра пару и связанное с ней сообщение. */
  private clearRevision(): void {
    this.state.comparisonRevision = null;
    this.state.comparisonConflict = null;
    this.state.comparisonError = null;
  }
}

/** Принимает только целые оценки шкалы 1–10. */
function validRating(value: number): value is Score {
  return Number.isInteger(value) && value >= 1 && value <= 10;
}
