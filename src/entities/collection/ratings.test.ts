import { describe, expect, it } from 'vitest';
import type { RatingScale, RatingTransition } from './model';
import {
  moveRatingCutoff, presetRatingCutoffs, ratingAssignments, ratingPositions, reconcileRatings,
  scaleFromCutoffs, scaleToCutoffs, setGroupRating,
} from './ratings';

const groups = [['a'], ['b', 'c'], ['d'], ['e']];
const scale: RatingScale = { topScore: 9, boundaries: [{ aboveId: 'c', belowId: 'd', scoreBelow: 7 }] };

describe('интервальные оценки', () => {
  it('связывает девять порогов с опорами ID, пропуская оценки и сохраняя целые классы', () => {
    const before = structuredClone({ groups, scale });
    const cutoffs = scaleToCutoffs(groups, scale)!;
    expect(ratingPositions(groups)).toEqual([0, 1, 3, 4, 5]);
    expect(cutoffs).toMatchObject({ 10: 0, 9: 3, 8: 3, 7: 5, 2: 5 });
    expect(ratingAssignments(groups, scale)).toEqual({ a: 9, b: 9, c: 9, d: 7, e: 7 });
    expect(scaleToCutoffs(groups, scaleFromCutoffs(groups, cutoffs))).toEqual(cutoffs);
    expect({ groups, scale }).toEqual(before);
  });

  it('допускает одну общую оценку, пустой список и оба конца, но отклоняет разрыв ничьей и инверсию оценок', () => {
    const oneGrade: RatingScale = { topScore: 4, boundaries: [] };
    const cutoffs = scaleToCutoffs(groups, oneGrade)!;
    expect(ratingAssignments(groups, scaleFromCutoffs(groups, cutoffs))).toEqual({ a: 4, b: 4, c: 4, d: 4, e: 4 });
    expect(scaleToCutoffs([], { topScore: null, boundaries: [] })).toBeNull();
    expect(ratingAssignments([], scaleFromCutoffs([], presetRatingCutoffs([], 'uniform')))).toEqual({});
    expect(() => scaleFromCutoffs(groups, { ...cutoffs, 9: 2 })).toThrow();
    expect(() => scaleFromCutoffs(groups, { ...cutoffs, 9: 5, 8: 3 })).toThrow();
    expect(() => scaleToCutoffs(groups, { topScore: 9, boundaries: [{ aboveId: 'b', belowId: 'c', scoreBelow: 7 }] })).toThrow();
    expect(() => scaleToCutoffs(groups, { topScore: 7, boundaries: [{ aboveId: 'c', belowId: 'd', scoreBelow: 8 }] })).toThrow();
    const allTen = moveRatingCutoff(groups, cutoffs, 10, 5);
    expect(ratingAssignments(groups, scaleFromCutoffs(groups, allTen))).toEqual({ a: 10, b: 10, c: 10, d: 10, e: 10 });
    const allOne = moveRatingCutoff(groups, allTen, 2, 0);
    expect(ratingAssignments(groups, scaleFromCutoffs(groups, allOne))).toEqual({ a: 1, b: 1, c: 1, d: 1, e: 1 });
  });

  it('применяет пресеты по целым классам и концентрирует колокол около семи', () => {
    const many = Array.from({ length: 100 }, (_, index) => [`id${index}`]);
    const uniform = ratingAssignments(many, scaleFromCutoffs(many, presetRatingCutoffs(many, 'uniform')));
    expect(Object.values(uniform).filter(value => value === 10)).toHaveLength(10);
    expect(Object.values(uniform).filter(value => value === 1)).toHaveLength(10);
    const bell = ratingAssignments(many, scaleFromCutoffs(many, presetRatingCutoffs(many, 'bell')));
    expect(Object.values(bell).filter(value => value === 7).length).toBeGreaterThan(20);
    expect(Object.values(bell).filter(value => value === 10).length).toBeLessThan(10);
    const tied = [['a', 'b', 'c', 'd'], ['e']];
    const grades = ratingAssignments(tied, scaleFromCutoffs(tied, presetRatingCutoffs(tied, 'uniform')));
    expect(new Set(tied[0]!.map(id => grades[id])).size).toBe(1);
  });

  it('задаёт среднее ограниченного колокола и поддерживает оба края шкалы', () => {
    const many = Array.from({ length: 1000 }, (_, index) => [`id${index}`]);
    for (const center of [1, 3, 5.5, 7, 10]) {
      const grades = Object.values(ratingAssignments(many, scaleFromCutoffs(many, presetRatingCutoffs(many, 'bell', center))));
      expect(Math.abs(grades.reduce((sum, score) => sum + score, 0) / grades.length - center)).toBeLessThan(.01);
      expect(Math.min(...grades)).toBeGreaterThanOrEqual(1);
      expect(Math.max(...grades)).toBeLessThanOrEqual(10);
      if (center === 1 || center === 10) expect(new Set(grades)).toEqual(new Set([center]));
    }
    for (const center of [0, 11, NaN, Infinity]) expect(() => presetRatingCutoffs(groups, 'bell', center)).toThrow();
  });

  it('меняет оценку всего класса и только необходимые соседние интервалы без мутации порядка', () => {
    const cutoffs = scaleToCutoffs(groups, scale)!;
    const before = structuredClone({ groups, cutoffs });
    const raised = setGroupRating(groups, cutoffs, 'b', 10);
    expect(ratingAssignments(groups, scaleFromCutoffs(groups, raised))).toEqual({ a: 10, b: 10, c: 10, d: 7, e: 7 });
    const lowered = setGroupRating(groups, cutoffs, 'c', 4);
    expect(ratingAssignments(groups, scaleFromCutoffs(groups, lowered))).toEqual({ a: 9, b: 4, c: 4, d: 4, e: 4 });
    expect({ groups, cutoffs }).toEqual(before);
    expect(() => setGroupRating(groups, cutoffs, 'missing', 8)).toThrow();
  });

  it('сохраняет оценки базы при вставке внутри интервала, а на стыке требует явный выбор', () => {
    const transition: RatingTransition = { scores: ratingAssignments(groups, scale), changedIds: ['x', 'y'] };
    const inside = [['a'], ['x'], ['b', 'c'], ['d'], ['e']];
    expect(reconcileRatings(inside, scale, transition).assignments).toEqual({ a: 9, x: 9, b: 9, c: 9, d: 7, e: 7 });
    const boundary = [['a'], ['b', 'c'], ['x', 'y'], ['d'], ['e']];
    const before = structuredClone({ boundary, scale, transition });
    const pending = reconcileRatings(boundary, scale, transition);
    expect(pending.pending).toEqual([{ ids: ['x', 'y'], above: 9, below: 7 }]);
    expect(pending.assignments.x).toBeUndefined();
    const chosen = reconcileRatings(boundary, scale, transition, { x: 7 });
    expect(chosen.pending).toEqual([]);
    expect(chosen.conflict).toBeNull();
    expect(ratingAssignments(boundary, chosen.scale)).toEqual({ ...transition.scores, x: 7, y: 7 });
    expect(reconcileRatings(boundary, scale, transition, { x: 9, y: 7 }).conflict).toBeTruthy();
    expect({ boundary, scale, transition }).toEqual(before);
  });

  it('пересматривает только перемещённое произведение, сохраняя оценки остальных', () => {
    const transition: RatingTransition = { scores: ratingAssignments(groups, scale), changedIds: ['a'] };
    const moved = [['b', 'c'], ['d'], ['a'], ['e']];
    const result = reconcileRatings(moved, scale, transition);
    expect(result.conflict).toBeNull();
    expect(result.assignments).toEqual({ b: 9, c: 9, d: 7, a: 7, e: 7 });
    expect(ratingAssignments(moved, result.scale)).toEqual(result.assignments);
    expect(reconcileRatings([['a', 'd'], ['b', 'c'], ['e']], scale, { ...transition, changedIds: [] }).conflict).toBeTruthy();
  });
});
