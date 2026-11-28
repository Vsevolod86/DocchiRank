import { FORECAST_SETTINGS, SORTING_SETTINGS } from '../../config/sorting';
import type { AlgorithmPosition, EngineInput, Item, SessionInput, Strategy } from './session';

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
  if (comparisonEstimates.size > SORTING_SETTINGS.estimateCacheSize) comparisonEstimates.delete(comparisonEstimates.keys().next().value!);
  return { ...estimate };
}

/** Оценивает число прямых ответов по стратегии и размерам готовой базы и очереди. */
export function forecastComparisons(knownGroups: number, pending: number, strategy: Strategy): number {
  if (pending === 0 || knownGroups + pending < 2) return 0;
  // Коэффициенты подобраны для покрытия около 95% синтетических сессий.
  if (strategy === 'insertion') {
    const averageSize = Math.max(1, knownGroups + (pending - 1) / 2);
    const { searchMultiplier, searchOffset, knownMultiplier } = FORECAST_SETTINGS.insertion;
    const searchWork = searchMultiplier * Math.log2(averageSize) - searchOffset;
    const knownWork = knownMultiplier * Math.log2(1 + knownGroups / pending);
    return Math.round(pending * Math.max(1, searchWork + knownWork));
  }
  const { minimumRunWork, runOffset, knownMultiplier, margin } = FORECAST_SETTINGS.merge;
  const pendingWork = (pending - 1) * Math.max(minimumRunWork, Math.log2(pending) - runOffset);
  const knownMergeWork = knownMultiplier * pending * Math.log2(1 + knownGroups / pending);
  return Math.round(margin * (pendingWork + knownMergeWork));
}

/** Оценивает оставшуюся работу по размещённым тайтлам и подтверждённым блокам. */
export function forecastRemainingComparisons(input: SessionInput, position: AlgorithmPosition, strategy: Strategy, answered: number): number {
  if (position.phase === 'done') return 0;
  const { orderedGroups, runs } = position;
  const knownTitles = input.known.reduce((count, group) => count + group.length, 0);
  const placedTitles = orderedGroups.reduce((count, group) => count + group.length, 0);
  const pending = knownTitles + input.pending.length - placedTitles;
  if (strategy === 'insertion') {
    const forecast = forecastComparisons(orderedGroups.length, pending, strategy);
    const estimatedSpent = forecastComparisons(input.known.length, input.pending.length - pending, strategy);
    // Если вставки идут медленнее начальной модели, учитываем фактический темп с запасом.
    const pace = Math.max(1, FORECAST_SETTINGS.insertion.paceMargin * answered / Math.max(1, estimatedSpent));
    return Math.ceil(forecast * pace);
  }

  const runLengths = runs.map(run => run.length);
  if (position.phase === 'runs') {
    const scanned = runs.flat().reduce((count, group) => count + group.length, 0);
    const unscanned = pending - scanned;
    const blocks = orderedGroups.length ? [orderedGroups.length, ...runLengths] : runLengths;
    // Пока направление не проверено, закладываем короткие блоки для оставшегося хвоста.
    const { assumedRunSize } = FORECAST_SETTINGS.merge;
    const runSize = Number.isSafeInteger(assumedRunSize) && assumedRunSize > 0 ? assumedRunSize : 1;
    for (let remaining = unscanned; remaining > 0; remaining -= runSize) blocks.push(Math.min(runSize, remaining));
    return unscanned + forecastMergeWork(blocks);
  }

  const [merged = 0, left = 0, right = 0, ...rest] = runLengths;
  const currentMerge = Math.max(0, left + right - 1);
  return forecastMergeWork([merged + left + right, ...rest], currentMerge);
}

/** Оценивает затраты попарных слияний с тем же запасом, что и начальный прогноз. */
function forecastMergeWork(blocks: number[], currentMerge = 0): number {
  const depths = mergeDepths(blocks.length);
  const work = blocks.reduce((sum, size, index) => sum + size * depths[index]!, 0);
  return Math.ceil(FORECAST_SETTINGS.merge.margin * (currentMerge + work - Math.max(0, blocks.length - 1)));
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
