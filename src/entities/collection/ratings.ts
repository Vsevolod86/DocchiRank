import type { RatingScale, RatingTransition, Score } from './model';

export type RatingThreshold = Exclude<Score, 1>;
export type RatingCutoffs = Record<RatingThreshold, number>;
export const RATING_THRESHOLDS: readonly RatingThreshold[] = [10, 9, 8, 7, 6, 5, 4, 3, 2];

/** Неразрешённая вставка класса между двумя соседними оценёнными интервалами. */
export interface PendingRating { ids: string[]; above: Score; below: Score }

/** Результат согласования старых оценок с новым порядком без переоценки неподвижной базы. */
export interface ReconciledRatings {
  scale: RatingScale;
  assignments: Record<string, Score>;
  pending: PendingRating[];
  conflict: string | null;
}

/** Возвращает разрешённые позиции разделителей, считая класс равных неделимым. */
export function ratingPositions(groups: readonly (readonly string[])[]): number[] {
  validateGroups(groups);
  const positions = [0];
  for (const group of groups) positions.push(positions[positions.length - 1]! + group.length);
  return positions;
}

/** Читает разделители по стабильным ID; устаревшая пара опор охватывает вставки перед нижней опорой. */
export function scaleToCutoffs(groups: readonly (readonly string[])[], scale: RatingScale): RatingCutoffs | null {
  const positions = ratingPositions(groups);
  const ids = groups.flat();
  if (scale.topScore === null) {
    if (scale.boundaries.length > 0) throw new Error('Неоценённая шкала не может содержать границы.');
    return null;
  }
  validateScore(scale.topScore);
  let score = scale.topScore;
  let lastPosition = 0;
  const boundaries = scale.boundaries.map(boundary => {
    validateScore(boundary.scoreBelow);
    const position = boundaryPosition(ids, boundary.aboveId, boundary.belowId);
    if (!positions.includes(position) || position < lastPosition || boundary.scoreBelow > score) {
      throw new Error('Граница нарушает порядок оценок или разделяет равные произведения.');
    }
    lastPosition = position;
    score = boundary.scoreBelow;
    return { position, scoreBelow: boundary.scoreBelow };
  });
  const cutoffs = emptyCutoffs();
  for (const threshold of RATING_THRESHOLDS) {
    if (scale.topScore < threshold) continue;
    cutoffs[threshold] = boundaries.find(boundary => boundary.scoreBelow < threshold)?.position ?? ids.length;
  }
  return cutoffs;
}

/** Сохраняет все девять порогов, включая пустые интервалы и границы у концов списка. */
export function scaleFromCutoffs(groups: readonly (readonly string[])[], cutoffs: RatingCutoffs): RatingScale {
  validateCutoffs(groups, cutoffs);
  const ids = groups.flat();
  return {
    topScore: 10,
    boundaries: RATING_THRESHOLDS.map(score => ({
      aboveId: ids[cutoffs[score] - 1] ?? null,
      belowId: ids[cutoffs[score]] ?? null,
      scoreBelow: (score - 1) as Score,
    })),
  };
}

/** Назначает оценки по рангам, не изменяя исходную шкалу и порядок. */
export function ratingAssignments(groups: readonly (readonly string[])[], scale: RatingScale): Record<string, Score> {
  const cutoffs = scaleToCutoffs(groups, scale);
  if (!cutoffs) return {};
  return Object.fromEntries(groups.flat().map((id, index) => [id,
    RATING_THRESHOLDS.find(score => index < cutoffs[score]) ?? 1,
  ]));
}

/** Перемещает порог и при пересечении сдвигает соседние пороги, сохраняя монотонность. */
export function moveRatingCutoff(groups: readonly (readonly string[])[], cutoffs: RatingCutoffs, score: RatingThreshold, position: number): RatingCutoffs {
  validateCutoffs(groups, cutoffs);
  if (!RATING_THRESHOLDS.includes(score) || !ratingPositions(groups).includes(position)) {
    throw new Error('Разделитель должен находиться между целыми классами равных.');
  }
  return Object.fromEntries(RATING_THRESHOLDS.map(threshold => [threshold,
    threshold === score ? position : threshold > score ? Math.min(cutoffs[threshold], position) : Math.max(cutoffs[threshold], position),
  ])) as RatingCutoffs;
}

/** Меняет оценку целого класса, сдвигая только необходимые пороги и сохраняя порядок тайтлов. */
export function setGroupRating(groups: readonly (readonly string[])[], cutoffs: RatingCutoffs, id: string, score: Score): RatingCutoffs {
  validateCutoffs(groups, cutoffs);
  validateScore(score);
  const groupIndex = groups.findIndex(group => group.includes(id));
  if (groupIndex < 0) throw new Error('Тайтл отсутствует в установленном порядке.');
  const positions = ratingPositions(groups);
  const above = positions[groupIndex]!;
  const below = positions[groupIndex + 1]!;
  return Object.fromEntries(RATING_THRESHOLDS.map(threshold => [threshold,
    threshold > score ? Math.min(cutoffs[threshold], above) : Math.max(cutoffs[threshold], below),
  ])) as RatingCutoffs;
}

/** Создаёт равные доли либо ограниченный колокол со средним center, округляя по целым классам. */
export function presetRatingCutoffs(groups: readonly (readonly string[])[], preset: 'uniform' | 'bell', center = 7): RatingCutoffs {
  if (preset !== 'uniform' && preset !== 'bell') throw new Error('Неизвестный пресет оценок.');
  if (preset === 'bell' && (!Number.isFinite(center) || center < 1 || center > 10)) throw new Error('Центр распределения должен быть от 1 до 10.');
  const positions = ratingPositions(groups);
  const count = positions[positions.length - 1]!;
  // S = 1 + Binomial(9, p) имеет ровно десять значений и E[S] = 1 + 9p.
  const coefficients = [1, 9, 36, 84, 126, 126, 84, 36, 9, 1];
  const probability = (center - 1) / 9;
  const weights = Array.from({ length: 10 }, (_, index) => {
    const successes = 9 - index;
    return preset === 'uniform' ? 1 : coefficients[successes]! * probability ** successes * (1 - probability) ** (9 - successes);
  });
  const total = weights.reduce((sum, value) => sum + value, 0);
  const cutoffs = emptyCutoffs();
  let cumulative = 0;
  for (const score of RATING_THRESHOLDS) {
    cumulative += weights[10 - score]!;
    const target = count * cumulative / total;
    cutoffs[score] = positions.reduce((best, position) => Math.abs(position - target) <= Math.abs(best - target) ? position : best, 0);
  }
  return cutoffs;
}

/** Размещает новые и пересматриваемые классы в старых интервалах, запрашивая выбор только на стыках. */
export function reconcileRatings(groups: readonly (readonly string[])[], scale: RatingScale, transition: RatingTransition,
  choices: Readonly<Record<string, Score>> = transition.choices ?? {}): ReconciledRatings {
  validateGroups(groups);
  if (new Set(transition.changedIds).size !== transition.changedIds.length) throw new Error('Повторные ID при переносе оценок.');
  for (const score of [...Object.values(transition.scores), ...Object.values(choices)]) validateScore(score);
  const assignments: Record<string, Score> = {};
  const pending: PendingRating[] = [];
  if (groups.length === 0) return { scale: scaleFromCutoffs([], emptyCutoffs()), assignments, pending, conflict: null };
  const unchanged = new Set(groups.flat().filter(id => !transition.changedIds.includes(id)));
  const grades = groups.map(group => {
    const known = [...new Set(group.filter(id => unchanged.has(id)).map(id => transition.scores[id]).filter((score): score is Score => score !== undefined))];
    return known;
  });
  const result = (conflict: string | null): ReconciledRatings => ({ scale: structuredClone(scale), assignments, pending, conflict });
  if (grades.some(values => values.length > 1)) return result('Новый класс равных объединяет разные прежние оценки. Настрой границы вручную.');
  if (!grades.some(values => values.length > 0)) return result('Список изменился, и оценки нужно выставить заново.');
  for (let index = 0; index < groups.length; index++) {
    const group = groups[index]!;
    let score = grades[index]![0];
    if (score === undefined) {
      const above = grades.slice(0, index).reverse().find(values => values.length > 0)?.[0];
      const below = grades.slice(index + 1).find(values => values.length > 0)?.[0];
      if (above === undefined || below === undefined || above === below) score = above ?? below!;
      else {
        const selected = [...new Set(group.map(id => choices[id]).filter((value): value is Score => value !== undefined))];
        if (selected.length > 1 || selected.some(value => value !== above && value !== below)) return result('Выбери одну из соседних оценок для всего класса равных.');
        score = selected[0];
        if (score === undefined) pending.push({ ids: [...group], above, below });
      }
    }
    if (score !== undefined) for (const id of group) assignments[id] = score;
  }
  let previousScore = 10;
  for (const group of groups) {
    const score = assignments[group[0]!];
    if (score === undefined) continue;
    if (score > previousScore) return result('Выбранные интервалы нарушают порядок оценок. Измени выбор на границе.');
    previousScore = score;
  }
  if (pending.length > 0) return result(null);
  const cutoffs = emptyCutoffs();
  for (const threshold of RATING_THRESHOLDS) cutoffs[threshold] = groups.flat().filter(id => assignments[id]! >= threshold).length;
  return { scale: scaleFromCutoffs(groups, cutoffs), assignments, pending, conflict: null };
}

/** Проверяет диапазоны и целостность неделимых классов на публичной границе. */
function validateGroups(groups: readonly (readonly string[])[]): void {
  const ids = groups.flat();
  if (groups.some(group => group.length === 0) || ids.some(id => typeof id !== 'string' || !id.trim()) || new Set(ids).size !== ids.length) {
    throw new Error('Установленный порядок содержит пустые классы или повторные ID.');
  }
}

/** Проверяет полный набор целых монотонных порогов между классами. */
function validateCutoffs(groups: readonly (readonly string[])[], cutoffs: RatingCutoffs): void {
  const positions = ratingPositions(groups);
  let previous = 0;
  for (const score of RATING_THRESHOLDS) {
    const value = cutoffs[score];
    if (!Number.isInteger(value) || !positions.includes(value) || value < previous) throw new Error('Пороги оценок должны возрастать и не разделять класс равных.');
    previous = value;
  }
}

/** Разрешает старые опоры по ID без использования прежних абсолютных позиций. */
function boundaryPosition(ids: readonly string[], aboveId: string | null, belowId: string | null): number {
  if (ids.length > 0 && aboveId === null && belowId === null) throw new Error('У границы в непустом списке должна быть опора.');
  const above = aboveId === null ? -1 : ids.indexOf(aboveId);
  const below = belowId === null ? ids.length : ids.indexOf(belowId);
  if (aboveId !== null && above < 0 || belowId !== null && below < 0 || above >= below) throw new Error('Опоры границы отсутствуют или расположены в обратном порядке.');
  return below;
}

/** Отклоняет дробные, отсутствующие и выходящие за шкалу оценки. */
function validateScore(score: unknown): asserts score is Score {
  if (!Number.isInteger(score) || Number(score) < 1 || Number(score) > 10) throw new Error('Оценка должна быть целым числом от 1 до 10.');
}

/** Создаёт независимый набор нулевых порогов. */
function emptyCutoffs(): RatingCutoffs {
  return Object.fromEntries(RATING_THRESHOLDS.map(score => [score, 0])) as RatingCutoffs;
}
