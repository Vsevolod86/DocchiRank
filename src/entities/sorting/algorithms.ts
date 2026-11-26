import type { AlgorithmPosition } from './session';
import type { Relation } from './relations';

/** Точка приостановки алгоритма до получения или вывода отношения. */
export interface ComparisonRequest { leftId: string; rightId: string; position: AlgorithmPosition }
export type SortProgram = Generator<ComparisonRequest, string[][], Relation>;
type StableGroup = (ids: string[]) => string[];

/** Вставляет классы N, используя предыдущую позицию как подсказку, а не как свидетельство. */
export function* insertion(known: string[][], pending: string[][], stable: StableGroup): SortProgram {
  const ordered = known.map(group => [...group]);
  let hint = 0;
  for (const candidate of pending) {
    if (!ordered.length) { ordered.push(candidate); continue; }
    const result = yield* insertionPosition(ordered, candidate, hint);
    if (result.tie) ordered[result.index] = stable([...ordered[result.index]!, ...candidate]);
    else ordered.splice(result.index, 0, candidate);
    hint = result.index;
  }
  return ordered;
}

/** Подтверждает возрастающие или убывающие блоки, затем попарно сливает их. */
export function* naturalMerge(known: string[][], pending: string[][], threshold: number, stable: StableGroup): SortProgram {
  const runs: string[][][] = [];
  let run: string[][] = [];
  let direction: Relation | null = null;
  for (const group of pending) {
    if (!run.length) { run.push(group); continue; }
    const last = run[run.length - 1]!;
    const result = yield request(last, group, position('runs', known, [...runs, run], group[0]!, 0, pending.length, runs.length, 1));
    if (result === 'tie') run[run.length - 1] = stable([...last, ...group]);
    else if (direction === null || result === direction) { direction = result; run.push(group); }
    else { runs.push(direction === 'right' ? [...run].reverse() : run); run = [group]; direction = null; }
  }
  if (run.length) runs.push(direction === 'right' ? [...run].reverse() : run);
  let queue = [...(known.length ? [known] : []), ...runs];
  while (queue.length > 1) {
    const next: string[][][] = [];
    for (let i = 0; i < queue.length; i += 2) {
      if (!queue[i + 1]) next.push(queue[i]!);
      else next.push(yield* mergeRuns(queue[i]!, queue[i + 1]!, threshold, known, [...next, ...queue.slice(i + 2)], stable));
    }
    queue = next;
  }
  return queue[0] ?? [];
}

/** Локализует позицию экспоненциальными пробами и завершает двоичным поиском. */
function* insertionPosition(ordered: string[][], candidate: string[], hint: number): Generator<ComparisonRequest, { index: number; tie: boolean }, Relation> {
  const size = ordered.length;
  const origin = Math.min(hint, size - 1);
  let lower = 0, upper = size, step = 1;
  let result = yield request(candidate, ordered[origin]!, position('hint', ordered, [], candidate[0]!, lower, upper, origin, step));
  if (result === 'tie') return { index: origin, tie: true };
  const leftward = result === 'left';
  if (leftward) upper = origin; else lower = origin + 1;
  while (lower < upper) {
    const probe = leftward ? Math.max(0, origin - step) : Math.min(size - 1, origin + step);
    result = yield request(candidate, ordered[probe]!, position(leftward ? 'gallop-left' : 'gallop-right', ordered, [], candidate[0]!, lower, upper, probe, step));
    if (result === 'tie') return { index: probe, tie: true };
    if (result === 'left') upper = probe; else lower = probe + 1;
    if ((leftward && result === 'right') || (!leftward && result === 'left')) break;
    step *= 2;
  }
  while (lower < upper) {
    const probe = Math.floor((lower + upper) / 2);
    result = yield request(candidate, ordered[probe]!, position('binary', ordered, [], candidate[0]!, lower, upper, probe, step));
    if (result === 'tie') return { index: probe, tie: true };
    if (result === 'left') upper = probe; else lower = probe + 1;
  }
  return { index: lower, tie: false };
}

/** Сливает два доказанно упорядоченных блока с ограниченным бюджетом galloping. */
function* mergeRuns(first: string[][], second: string[][], threshold: number, known: string[][], rest: string[][][], stable: StableGroup): SortProgram {
  const a = [...first], b = [...second], output: string[][] = [];
  const budget = 2 * (a.length + b.length - 1);
  let spent = 0, streak = 0;
  let winner: 'left' | 'right' | null = null;
  while (a.length && b.length) {
    const result = yield request(a[0]!, b[0]!, position('merge', known, [output, a, b, ...rest], null, 0, a.length + b.length, 0, 1));
    spent++;
    if (result === 'tie') { output.push(stable([...a.shift()!, ...b.shift()!])); winner = null; streak = 0; continue; }
    output.push((result === 'left' ? a : b).shift()!);
    streak = winner === result ? streak + 1 : 1;
    winner = result;
    if (streak < threshold || !a.length || !b.length) continue;
    const winning = result === 'left' ? a : b;
    const losing = result === 'left' ? b : a;
    const canProbe = (): boolean => spent + Math.max(0, a.length + b.length - 1) < budget;
    const onProbe = (): void => { spent++; };
    const prefix = yield* gallopPrefix(winning, losing[0]!, known, [output, a, b, ...rest], canProbe, onProbe);
    output.push(...winning.splice(0, prefix.count));
    if (prefix.tie) output.push(stable([...winning.shift()!, ...losing.shift()!]));
    winner = null; streak = 0;
  }
  return [...output, ...a, ...b];
}

/** Ищет доказанный префикс победителя; оставляет запас для обычного слияния. */
function* gallopPrefix(block: string[][], other: string[], known: string[][], runs: string[][][], canProbe: () => boolean, onProbe: () => void): Generator<ComparisonRequest, { count: number; tie: boolean }, Relation> {
  let lower = 0, upper = block.length, probe = 0, step = 1;
  while (lower < upper && canProbe()) {
    const result = yield request(block[probe]!, other, position('merge-gallop', known, runs, other[0]!, lower, upper, probe, step));
    onProbe();
    if (result === 'tie') return { count: probe, tie: true };
    if (result === 'right') { upper = probe; break; }
    lower = probe + 1;
    step *= 2;
    probe = Math.min(block.length - 1, step - 1);
  }
  while (lower < upper && canProbe()) {
    probe = Math.floor((lower + upper) / 2);
    const result = yield request(block[probe]!, other, position('merge-gallop', known, runs, other[0]!, lower, upper, probe, step));
    onProbe();
    if (result === 'tie') return { count: probe, tie: true };
    if (result === 'left') lower = probe + 1; else upper = probe;
  }
  return { count: lower, tie: false };
}

/** Выбирает представителей сравниваемых классов. */
function request(left: string[], right: string[], state: AlgorithmPosition): ComparisonRequest {
  return { leftId: left[0]!, rightId: right[0]!, position: state };
}

/** Создаёт сериализуемые параметры текущей точки приостановки. */
function position(phase: AlgorithmPosition['phase'], orderedGroups: string[][], runs: string[][][], candidateId: string | null, lower: number, upper: number, probe: number, step: number): AlgorithmPosition {
  return { phase, orderedGroups, runs, candidateId, lower, upper, probe, step };
}
