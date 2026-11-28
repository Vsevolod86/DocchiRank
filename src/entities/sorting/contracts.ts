import type { EngineInput, Item, SessionInput, Strategy } from './session';

const comparisonEstimates = new Map<string, { insertion: number; merge: number; selected: Strategy }>();

/** Фиксирует исходный порядок и очередь сравнений независимо от будущих оценок. */
export function normalizeSessionInput(input: EngineInput | SessionInput): SessionInput {
  if (!input || typeof input !== 'object' || !('queue' in input)) {
    validateInput(input);
    return {
      known: input.known.map(group => group.map(item => item.id)),
      pending: input.pending.map(item => item.id),
      queue: priorOrder(input.pending).map(item => item.id),
    };
  }

  if (!Array.isArray(input.known) || !Array.isArray(input.pending) || !Array.isArray(input.queue)
    || [...input.known].some(group => !Array.isArray(group) || group.length === 0)) throw new Error('Неверные группы и очереди сравнения.');
  const ids = [...input.known.flatMap(group => [...group]), ...input.pending];
  const pending = new Set(input.pending);
  const queue = new Set(input.queue);
  if (ids.some(id => typeof id !== 'string' || !id.trim()) || new Set(ids).size !== ids.length
    || input.queue.length !== pending.size || queue.size !== pending.size || [...queue].some(id => !pending.has(id))) {
    throw new Error('Повторный ID или несогласованная очередь сравнения.');
  }
  return structuredClone({ known: input.known, pending: input.pending, queue: input.queue });
}

/** Отклоняет несогласованное разделение K/N, а не исправляет его молча. */
export function validateInput(value: unknown): asserts value is EngineInput {
  if (!value || typeof value !== 'object') throw new Error('Некорректные входные данные сортировки.');
  const input = value as EngineInput;
  if (!Array.isArray(input.known) || !Array.isArray(input.pending)) throw new Error('Нужны массивы K и N.');
  const ids = new Set<string>();
  const check = (item: Item): void => {
    if (!item || typeof item.id !== 'string' || !item.id.trim() || ids.has(item.id)
      || typeof item.title !== 'string' || !item.title.trim()
      || !(item.userScore === null || Number.isInteger(item.userScore) && item.userScore >= 1 && item.userScore <= 10)
      || !(item.communityScore === null || typeof item.communityScore === 'number' && Number.isFinite(item.communityScore) && item.communityScore >= 0 && item.communityScore <= 10)) {
      throw new Error('Повторный или неверный ID, пустое название либо неверная оценка.');
    }
    ids.add(item.id);
  };
  for (const group of input.known) {
    if (!Array.isArray(group) || group.length === 0) throw new Error('Класс равных в K не может быть пустым.');
    group.forEach(check);
  }
  input.pending.forEach(check);
}

/** Возвращает стабильный предварительный порядок без назначения отношений предпочтения. */
export function priorOrder(items: readonly Item[]): Item[] {
  return [...items].sort((a, b) => (b.userScore ?? b.communityScore ?? 0) - (a.userScore ?? a.communityScore ?? 0)
    || (b.communityScore ?? 0) - (a.communityScore ?? 0));
}

/** Консервативные верхние оценки числа вопросов без пропусков и пересмотров. */
export function estimateComparisons(knownGroups: number, pending: number): { insertion: number; merge: number; selected: Strategy } {
  if (!Number.isSafeInteger(knownGroups) || knownGroups < 0 || !Number.isSafeInteger(pending) || pending < 0 || !Number.isSafeInteger(knownGroups + pending)) throw new Error('Размеры должны быть целыми неотрицательными.');
  const key = `${knownGroups}/${pending}`;
  const cached = comparisonEstimates.get(key);
  if (cached) return { ...cached };
  let insertion = 0;
  for (let i = 0; i < pending; i++) {
    const size = knownGroups + i;
    if (size) insertion += 2 * Math.ceil(Math.log2(size + 1)) + 2;
  }
  let maximumMergeBudget = 0;
  for (let runCount = 1; runCount <= pending; runCount++) {
    const hasKnown = knownGroups > 0 ? 1 : 0;
    const blockCount = runCount + hasKnown;
    const depths = mergeDepths(blockCount);
    let weightedDepth = knownGroups * (hasKnown ? depths[0]! : 0);
    let deepestPending = 0;
    for (let i = hasKnown; i < depths.length; i++) {
      weightedDepth += depths[i]!;
      deepestPending = Math.max(deepestPending, depths[i]!);
    }
    weightedDepth += (pending - runCount) * deepestPending;
    maximumMergeBudget = Math.max(maximumMergeBudget, 2 * (weightedDepth - (blockCount - 1)));
  }
  const merge = Math.max(0, pending - 1) + maximumMergeBudget;
  const estimate = { insertion, merge, selected: insertion <= merge ? 'insertion' as const : 'merge' as const };
  comparisonEstimates.set(key, estimate);
  if (comparisonEstimates.size > 128) comparisonEstimates.delete(comparisonEstimates.keys().next().value!);
  return { ...estimate };
}

/** Оценивает число прямых ответов по стратегии и размерам готовой базы и очереди. */
export function forecastComparisons(knownGroups: number, pending: number, strategy: Strategy): number {
  if (pending === 0 || knownGroups + pending < 2) return 0;
  // Коэффициенты подобраны для покрытия около 95% синтетических сессий.
  if (strategy === 'insertion') {
    const averageSize = Math.max(1, knownGroups + (pending - 1) / 2);
    const searchWork = 1.5 * Math.log2(averageSize) - 0.5;
    const knownWork = 0.75 * Math.log2(1 + knownGroups / pending);
    return Math.round(pending * Math.max(1, searchWork + knownWork));
  }
  const pendingWork = (pending - 1) * Math.max(1.5, Math.log2(pending) - 1.5);
  const knownMergeWork = 2 * pending * Math.log2(1 + knownGroups / pending);
  return Math.round(1.36 * (pendingWork + knownMergeWork));
}

/** Считает число участий каждого блока в фактическом попарном bottom-up дереве слияния. */
function mergeDepths(blockCount: number): number[] {
  return Array.from({ length: blockCount }, (_, leaf) => {
    let depth = 0, index = leaf, size = blockCount;
    while (size > 1) {
      if (index % 2 === 1 || index + 1 < size) depth++;
      index = Math.floor(index / 2);
      size = Math.ceil(size / 2);
    }
    return depth;
  });
}
