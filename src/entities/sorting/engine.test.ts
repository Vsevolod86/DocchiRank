import { describe, expect, it } from 'vitest';
import { PairwiseSorterEngine } from './engine';
import { estimateComparisons, priorOrder } from './contracts';
import { Relations } from './relations';
import type { Answer, EngineInput, Item, Strategy } from './session';

/** Создаёт независимый пример без зависимости от предметных обложек и API. */
function item(value: number, score: number | null = null): Item {
  return { id: String(value), title: `Title ${value}`, userScore: score, communityScore: null };
}

/** Сравнивает числовые ранги; одинаковая корзина образует отдельную проверяемую ничью. */
function response(engine: PairwiseSorterEngine, tieSize = 1): Answer {
  const pair = engine.getView().current!;
  const a = Math.floor(Number(pair.leftId) / tieSize), b = Math.floor(Number(pair.rightId) / tieSize);
  return a === b ? 'tie' : a < b ? 'left' : 'right';
}

/** Завершает согласованную сессию с защитой теста от зацикливания. */
function complete(engine: PairwiseSorterEngine, tieSize = 1): void {
  for (let step = 0; engine.getView().current && step < 10000; step++) expect(engine.answer(response(engine, tieSize)).ok).toBe(true);
  expect(engine.getView().status).toBe('complete');
  const completed = engine.getView();
  expect(completed.directComparisonCount + completed.inferredComparisonCount).toBe(completed.comparisonTotal);
}

/** Перемешивает пример воспроизводимым генератором, а не Math.random. */
function shuffled(size: number, seed: number): number[] {
  const values = Array.from({ length: size }, (_, index) => index + 1);
  for (let i = size - 1; i > 0; i--) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; const j = seed % (i + 1); [values[i], values[j]] = [values[j]!, values[i]!]; }
  return values;
}

describe('контракты и оценки вопросов', () => {
  it('не создаёт предпочтений из оценок, сохраняет стабильный априорный порядок и проверяет границы', () => {
    const a = { ...item(1, 7), communityScore: 9 };
    const b = { ...item(2, 7), communityScore: 8 };
    const c = { ...item(3, 7), communityScore: 9 };
    expect(priorOrder([b, a, c]).map(x => x.id)).toEqual(['1', '3', '2']);
    expect(new PairwiseSorterEngine({ known: [], pending: [a, c] }).getView().current).not.toBeNull();
    expect(() => new PairwiseSorterEngine({ known: [[item(1)]], pending: [item(1)] })).toThrow();
    expect(() => new PairwiseSorterEngine({ known: [], pending: [{ ...a, communityScore: NaN }] })).toThrow();
    expect(() => new PairwiseSorterEngine({ known: [[]], pending: [] })).toThrow();
    for (const pending of [[], [item(1)]]) expect(new PairwiseSorterEngine({ known: [], pending }).getView().status).toBe('complete');
    expect(estimateComparisons(0, 0).selected).toBe('insertion');
    expect(estimateComparisons(100, 1).selected).toBe('insertion');
    expect(estimateComparisons(0, 8).selected).toBe('merge');
    for (const knownSize of [0, 20]) {
      const engine = new PairwiseSorterEngine({ known: Array.from({ length: knownSize }, (_, i) => [item(i + 1)]), pending: shuffled(25, 17).filter(id => id > knownSize).map(id => item(id)) });
      complete(engine);
      expect(engine.getView().orderedGroups.flat()).toEqual(Array.from({ length: 25 }, (_, i) => String(i + 1)));
      const estimate = estimateComparisons(knownSize, 25 - knownSize);
      expect(engine.getView().comparisonCount).toBeLessThanOrEqual(Math.min(estimate.insertion, estimate.merge));
    }
  });

  it('выводит транзитивность, отделяет прямые ответы и отклоняет ничью через строгий путь', () => {
    const graph = new Relations({ known: [], pending: ['1', '2', '3'] });
    graph.add({ leftId: '1', rightId: '2', answer: 'left', eventId: 'a' });
    graph.add({ leftId: '2', rightId: '3', answer: 'left', eventId: 'b' });
    expect(graph.compare('1', '3')).toBe('left');
    expect(() => graph.add({ leftId: '1', rightId: '3', answer: 'tie', eventId: 'c' })).toThrow();
    expect(graph.members('1')).toEqual(['1']);
    expect(graph.compare('1', '3')).toBe('left');
  });
});

describe.each<Strategy>(['insertion', 'merge'])('стратегия %s', strategy => {
  it('считает все транзитивные следствия обычных ответов, даже если алгоритм их не запрашивал', () => {
    const engine = new PairwiseSorterEngine({ known: [], pending: [1, 2, 3, 4].map(value => item(value)) }, { strategy });
    engine.answer(response(engine));
    expect(engine.getView().inferredComparisonCount).toBe(0);
    engine.answer(response(engine));
    expect(engine.getView().inferredComparisonCount).toBe(1);
    engine.answer(response(engine));
    expect(engine.getView().inferredComparisonCount).toBe(3);
    expect(engine.getView().status).toBe('complete');
    expect(PairwiseSorterEngine.restore(engine.getState()).getView().inferredComparisonCount).toBe(3);
    engine.undo();
    expect(engine.getView().inferredComparisonCount).toBe(1);
  });

  it('пропускает пару без исключения тайтлов и точно возвращает пару через undo и JSON', () => {
    const engine = new PairwiseSorterEngine({ known: [], pending: [3, 1, 2].map(value => item(value)) }, { strategy });
    const before = engine.getState().progress;
    const upper = engine.getView().comparisonUpperBound;
    expect(engine.getView().canSkip).toBe(true);
    expect(engine.answer('skip').ok).toBe(true);
    expect(engine.getView().current).not.toEqual(before.current);
    expect(new Set([...engine.getView().orderedGroups.flat(), ...engine.getView().pendingIds])).toEqual(new Set(['1', '2', '3']));
    expect(engine.getView().comparisonCount).toBe(0);
    engine.undo();
    expect(engine.getState().progress).toEqual(before);
    engine.answer('skip');
    const restored = PairwiseSorterEngine.restore(JSON.parse(JSON.stringify(engine.getState())));
    expect(restored.getState()).toEqual(engine.getState());
    while (engine.getView().current) {
      const answer = response(engine);
      engine.answer(answer); restored.answer(answer);
      expect(restored.getState()).toEqual(engine.getState());
      expect(engine.getView().comparisonUpperBound).toBe(upper);
    }
    expect(engine.getView().orderedGroups.flat()).toEqual(['1', '2', '3']);
  });

  it('после полного круга пропусков возвращает нужную пару, а транзитивные ответы считает без повторного чтения прямых', () => {
    const input = { known: [], pending: [3, 1, 2].map(value => item(value)) };
    const cycle = new PairwiseSorterEngine(input, { strategy });
    const first = cycle.getView().current;
    cycle.answer('skip'); cycle.answer('skip'); cycle.answer('skip');
    expect(cycle.getView().current).toEqual(first);
    expect(cycle.getView().comparisonCount).toBe(0);
    expect(PairwiseSorterEngine.restore(cycle.getState()).getState()).toEqual(cycle.getState());

    const engine = new PairwiseSorterEngine(input, { strategy });
    engine.answer('skip');
    engine.answer(response(engine));
    engine.answer(response(engine));
    expect(engine.getView().status).toBe('complete');
    expect(engine.getView().comparisonCount).toBe(2);
    expect(engine.getView().inferredComparisonCount).toBe(1);
    expect(engine.getView().orderedGroups.flat()).toEqual(['1', '2', '3']);
    expect(PairwiseSorterEngine.restore(engine.getState()).getView().inferredComparisonCount).toBe(1);
    engine.undo();
    expect(engine.getView().inferredComparisonCount).toBe(0);
    engine.answer(response(engine));
    expect(engine.getView().inferredComparisonCount).toBe(1);
  });

  it('не записывает бессмысленный пропуск единственной неизвестной пары', () => {
    const engine = new PairwiseSorterEngine({ known: [], pending: [2, 1].map(value => item(value)) }, { strategy });
    const before = engine.getState();
    expect(engine.getView().canSkip).toBe(false);
    expect(engine.answer('skip').ok).toBe(false);
    expect(engine.getState()).toEqual(before);
    engine.answer('tie');
    expect(engine.getView().orderedGroups).toEqual([['2', '1']]);
  });

  it('сочетает пропуски, ничьи и отмены с сохранением K и продолжением после каждого шага', () => {
    const known = [2, 6, 10];
    let engine = new PairwiseSorterEngine({
      known: known.map(value => [item(value)]),
      pending: shuffled(13, 81).filter(value => !known.includes(value)).map(value => item(value)),
    }, { strategy });
    for (let step = 0; engine.getView().current && step < 300; step++) {
      const before = engine.getState().progress;
      const answer = step % 4 === 0 && engine.getView().canSkip ? 'skip' : response(engine, 3);
      expect(engine.answer(answer).ok).toBe(true);
      if (step % 7 === 0) {
        engine.undo();
        expect(engine.getState().progress).toEqual(before);
        expect(engine.answer(answer).ok).toBe(true);
      }
      engine = PairwiseSorterEngine.restore(JSON.parse(JSON.stringify(engine.getState())));
    }
    expect(engine.getView().status).toBe('complete');
    const groups = engine.getView().orderedGroups;
    expect(new Set(groups.flat())).toEqual(new Set(Array.from({ length: 13 }, (_, i) => String(i + 1))));
    expect(groups.flat().filter(id => known.includes(Number(id)))).toEqual(known.map(String));
    expect(groups.map(group => Math.floor(Number(group[0]) / 3))).toEqual([0, 1, 2, 3, 4]);
    expect(groups.every(group => group.every(id => Math.floor(Number(id) / 3) === Math.floor(Number(group[0]) / 3)))).toBe(true);
    const beforeRevision = engine.getState().progress;
    const decision = engine.getView().activeAnswers.find(event => event.answer === 'left' || event.answer === 'right')!;
    expect(engine.revise(decision.id, 'tie', true).ok).toBe(true);
    expect(PairwiseSorterEngine.restore(engine.getState()).getState()).toEqual(engine.getState());
    engine.undo();
    expect(engine.getState().progress).toEqual(beforeRevision);
  });

  it('упорядочивает воспроизводимые случайные данные, сохраняет K и укладывается в верхнюю оценку', () => {
    for (const size of [0, 1, 2, 5, 17, 50]) for (const knownSize of [0, Math.floor(size / 2), size]) for (const seed of [3, 17, 81]) {
      const input: EngineInput = {
        known: Array.from({ length: knownSize }, (_, i) => [item(i + 1)]),
        pending: shuffled(size, seed).filter(x => x > knownSize).map(x => item(x, 11 - ((x * 7) % 10 + 1))),
      };
      const engine = new PairwiseSorterEngine(input, { strategy, sessionId: 'test' });
      complete(engine);
      expect(engine.getView().orderedGroups.flat()).toEqual(Array.from({ length: size }, (_, i) => String(i + 1)));
      expect(engine.getView().comparisonCount).toBeLessThanOrEqual(estimateComparisons(knownSize, size - knownSize)[strategy]);
      expect(PairwiseSorterEngine.restore(JSON.parse(JSON.stringify(engine.getState()))).getState()).toEqual(engine.getState());
    }
  });

  it('точно отменяет и восстанавливает каждый шаг, включая поиск направления, galloping и слияние', () => {
    const input: EngineInput = { known: [[item(2)], [item(5)], [item(9)], [item(13)]], pending: [15, 1, 12, 3, 10, 4, 11, 6, 8, 7].map(x => item(x)) };
    const engine = new PairwiseSorterEngine(input, { strategy, gallopThreshold: 1 });
    const phases = new Set<string>();
    while (engine.getView().current) {
      const before = engine.getState().progress;
      phases.add(before.position.phase);
      const answer = response(engine);
      engine.answer(answer);
      const after = engine.getState().progress;
      engine.undo();
      expect(engine.getState().progress).toEqual(before);
      const restored = PairwiseSorterEngine.restore(engine.getState());
      expect(restored.getState()).toEqual(engine.getState());
      engine.answer(answer); restored.answer(answer);
      expect(engine.getState()).toEqual(restored.getState());
      expect(engine.getState().progress).toEqual(after);
    }
    expect(phases.has(strategy === 'insertion' ? 'hint' : 'runs')).toBe(true);
    if (strategy === 'insertion') {
      expect(phases.has('gallop-left') || phases.has('gallop-right')).toBe(true);
      expect(phases.has('binary')).toBe(true);
    } else {
      expect(phases.has('merge')).toBe(true);
      expect(phases.has('merge-gallop')).toBe(true);
    }
    expect(engine.getState().history.some(x => x.type === 'undo')).toBe(true);
  });

});

it('не считает готовую базу новыми выводами и пересчитывает равенства и новые связи классов', () => {
  const engine = new PairwiseSorterEngine({ known: [[item(1)], [item(2)], [item(3)]], pending: [item(4)] }, { strategy: 'insertion' });
  expect(engine.getView().inferredComparisonCount).toBe(0);
  engine.answer('left');
  expect(engine.getView().inferredComparisonCount).toBe(2);
  engine.undo();
  expect(engine.getView().inferredComparisonCount).toBe(0);

  const ties = new PairwiseSorterEngine({ known: [], pending: [1, 2, 3, 4].map(value => item(value)) }, { strategy: 'merge' });
  while (ties.getView().current) ties.answer('tie');
  expect(ties.getView().inferredComparisonCount).toBe(3);

  const graph = new Relations({ known: [], pending: ['1', '2', '3', '4'] });
  graph.add({ leftId: '1', rightId: '2', answer: 'left', eventId: 'a' });
  graph.add({ leftId: '3', rightId: '4', answer: 'left', eventId: 'b' });
  expect(graph.countKnownPairs()).toBe(2);
  graph.add({ leftId: '2', rightId: '3', answer: 'left', eventId: 'c' });
  expect(graph.countKnownPairs()).toBe(6);
});

describe('полный журнал и пересмотр', () => {
  it('валидирует изменённый кэшированный снимок и не разделяет его изменяемую память с копией', () => {
    const engine = new PairwiseSorterEngine({ known: [], pending: [3, 1, 2].map(value => item(value)) });
    engine.answer('left');
    const state = engine.getState();
    const copy = PairwiseSorterEngine.copyValidatedState(state);
    copy.history[0]!.affectedIds.push('changed');
    expect(PairwiseSorterEngine.copyValidatedState(state)).toEqual(state);
    const damaged = structuredClone(state);
    damaged.progress.comparisonCount++;
    expect(() => PairwiseSorterEngine.copyValidatedState(damaged)).toThrow();
    const extra = structuredClone(state);
    Object.defineProperty(extra.history, 'toJSON', { value: () => [] });
    expect(() => PairwiseSorterEngine.copyValidatedState(extra)).toThrow();
  });

  it('не разделяет изменяемые события и параметры между представлением, снимком и живым движком', () => {
    const engine = new PairwiseSorterEngine({ known: [], pending: [3, 1, 2].map(value => item(value)) });
    engine.answer('left');
    const original = engine.getState();
    const view = engine.getView();
    view.activeAnswers[0]!.affectedIds.push('foreign');
    view.activeAnswers[0]!.answer = 'right';
    const snapshot = engine.getState();
    snapshot.history[0]!.affectedIds.push('foreign');
    snapshot.input.pending[0] = 'changed';
    snapshot.input.queue.reverse();
    expect(engine.getState()).toEqual(original);
    const countBeforeUndo = engine.getView().comparisonCount;
    engine.undo();
    expect(engine.getView().comparisonCount).toBe(countBeforeUndo);
    expect(engine.getView().directComparisonCount).toBe(0);
    expect(engine.getState().progress.comparisonCount).toBe(0);
  });

  it('сохраняет историю при исправлении, обнаруживает конфликт и отменяет изменение целиком', () => {
    const engine = new PairwiseSorterEngine({ known: [], pending: [4, 1, 3, 2].map(value => item(value)) }, { strategy: 'insertion' });
    complete(engine);
    const before = engine.getState().progress;
    const first = engine.getView().activeAnswers[0]!;
    const result = engine.revise(first.id, 'tie');
    expect(result.ok).toBe(false);
    expect(result.conflict!.eventIds.length).toBeGreaterThan(0);
    expect(engine.getState().progress).toEqual(before);
    expect(engine.revise(first.id, 'tie', true).ok).toBe(true);
    engine.undo();
    expect(engine.getState().progress).toEqual(before);
    expect(engine.getState().history.some(event => event.type === 'revise')).toBe(true);
    expect(PairwiseSorterEngine.restore(engine.getState()).getState()).toEqual(engine.getState());
    const damaged = engine.getState(); damaged.progress.comparisonCount++;
    expect(() => PairwiseSorterEngine.restore(damaged)).toThrow();
    const duplicate = engine.getState(); duplicate.history[1]!.id = duplicate.history[0]!.id;
    expect(() => PairwiseSorterEngine.restore(duplicate)).toThrow();
    expect(engine.revise(first.id, 'tie', true).ok).toBe(true);
    complete(engine);
  });
});
