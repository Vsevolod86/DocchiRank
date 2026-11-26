import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { createServer } from 'vite';
import { IDBFactory } from 'fake-indexeddb';

const root = fileURLToPath(new URL('../../', import.meta.url));
const runtime = await createServer({ root, configFile: false, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { PairwiseSorterEngine } = await runtime.ssrLoadModule('/src/entities/sorting/engine.ts');
  const { priorOrder, estimateComparisons } = await runtime.ssrLoadModule('/src/entities/sorting/contracts.ts');
  const { BrowserCollectionStore } = await runtime.ssrLoadModule('/src/storage/collection-store.ts');
  const { createCollection } = await runtime.ssrLoadModule('/src/entities/collection/collection.ts');
  const rows = [];
  for (const size of process.argv.includes('--performance-only') ? [] : [32, 128]) for (const knownSize of [0, Math.floor(size / 2), Math.floor(size * .9)]) for (const mode of ['exact', 'blocks', 'random', 'zigzag']) {
    const samples = [];
    for (const seed of [3, 17, 81]) {
      const input = makeInput(size, knownSize, mode, seed);
      const estimates = estimateComparisons(knownSize, size - knownSize);
      const counts = {};
      for (const strategy of ['insertion', 'merge']) {
        const engine = new PairwiseSorterEngine(input, { strategy });
        complete(engine);
        const state = engine.getState();
        verifyOrder(state.progress.orderedIds, size);
        counts[strategy] = state.progress.comparisonCount;
        if (counts[strategy] > estimates[strategy]) throw new Error(`Upper bound exceeded: ${JSON.stringify({ size, knownSize, mode, seed, strategy })}`);
      }
      const known = input.known.flat().map(item => Number(item.id));
      const pending = priorOrder(input.pending).map(item => Number(item.id));
      samples.push({ ...counts, auto: counts[estimates.selected], binary: binaryInsertion(known, pending), ordinaryMerge: ordinaryMerge(known, pending) });
    }
    rows.push({ size, knownSize, mode, strategy: estimateComparisons(knownSize, size - knownSize).selected,
      means: Object.fromEntries(Object.keys(samples[0]).map(key => [key, average(samples.map(sample => sample[key]))])), samples });
    console.log(`Counts ${size}/${knownSize}/${mode}`);
  }
  const timings = [];
  for (const [size, knownSize] of [[500, 0], [500, 490]]) {
    const input = makeInput(size, knownSize, 'random', 17);
    for (const strategy of ['insertion', 'merge']) {
      const start = performance.now();
      const engine = new PairwiseSorterEngine(input, { strategy });
      let checkpoint = null;
      let checkpointTiming = null;
      let view = engine.getView();
      let questions = 0;
      while (view.current) {
        engine.answer(modelAnswer(view.current));
        questions++;
        view = engine.getView();
        if (questions % 500 === 0) console.log(`Progress ${size}/${knownSize}/${strategy}: ${questions} answers, ${round(performance.now() - start)} ms`);
        if (questions === 30) {
          checkpoint = engine.getState();
          const before = performance.now();
          PairwiseSorterEngine.restore(checkpoint);
          checkpointTiming = performance.now() - before;
        }
      }
      const sortMs = performance.now() - start;
      console.log(`Sorted ${size}/${knownSize}/${strategy}: ${round(sortMs)} ms`);
      const state = engine.getState();
      verifyOrder(state.progress.orderedIds, size);
      const beforeCopy = performance.now();
      for (let i = 0; i < 10; i++) PairwiseSorterEngine.copyValidatedState(state);
      const copyMs = (performance.now() - beforeCopy) / 10;
      const allItems = [...input.known.flat(), ...input.pending];
      const collection = createCollection({
        profile: { id: 'benchmark', nickname: 'Benchmark', source: 'saved-selection', url: null },
        animes: allItems.map(item => ({ id: item.id, name: item.title, russian: null, coverUrl: null, communityScore: item.communityScore, url: `https://shikimori.io/animes/${item.id}` })),
        entries: allItems.map(item => ({ id: item.id, animeId: item.id, originalScore: item.userScore, status: 'completed', importedAt: '2026-11-20T00:00:00Z' })),
      }, allItems.map(item => item.id), 'benchmark');
      collection.session = state;
      collection.orderedIds = state.progress.orderedIds;
      const browserStore = await BrowserCollectionStore.open(new IDBFactory());
      const storeTimes = [];
      for (let i = 0; i < 3; i++) {
        const beforeStore = performance.now();
        if (await browserStore.set(collection) !== 'saved') throw new Error('Persistent store rejected benchmark state.');
        storeTimes.push(performance.now() - beforeStore);
      }
      const beforeRestore = performance.now();
      const restored = PairwiseSorterEngine.restore(state);
      const restoreMs = performance.now() - beforeRestore;
      const beforeUndo = performance.now();
      restored.undo();
      const undoMs = performance.now() - beforeUndo;
      timings.push({ size, knownSize, strategy, questions: state.progress.comparisonCount,
        sortMs: round(sortMs), restoreMs: round(restoreMs), undoMs: round(undoMs), copyMs: round(copyMs), storeSetMs: average(storeTimes), storeSetMaxMs: round(Math.max(...storeTimes)), restoreAt30Ms: checkpoint ? round(checkpointTiming) : null,
        bytes: Buffer.byteLength(JSON.stringify(state)) });
      console.log(`Performance ${size}/${knownSize}/${strategy}: sort ${round(sortMs)} ms, restore ${round(restoreMs)} ms, undo ${round(undoMs)} ms, validated copy ${round(copyMs)} ms, store ${average(storeTimes)} ms`);
    }
  }
  const result = { seeds: [3, 17, 81], node: process.version, gallopThreshold: 3, rows, timings };
  await writeFile(new URL('./results.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
  await writeFile(new URL('./results.md', import.meta.url), markdown(result));
} finally {
  await runtime.close();
}

/** Создаёт независимые оценки-подсказки и готовую базу, распределённую по истинному порядку. */
function makeInput(size, knownSize, mode, seed) {
  const ids = Array.from({ length: size }, (_, i) => i + 1);
  const known = new Set(shuffle(ids, seed).slice(0, knownSize));
  const prior = mode === 'exact' ? ids : mode === 'random' ? shuffle(ids, seed + 101)
    : mode === 'zigzag' ? ids.map((_, i) => i % 2 ? size - Math.floor(i / 2) : Math.floor(i / 2) + 1)
      : shuffle(Array.from({ length: Math.ceil(size / 8) }, (_, i) => i), seed + 41).flatMap(block => ids.slice(block * 8, block * 8 + 8));
  const ranks = new Map(prior.map((id, i) => [id, i]));
  const item = id => ({ id: String(id), title: `Title ${id}`, userScore: null, communityScore: 10 * (size - ranks.get(id)) / size });
  return { known: ids.filter(id => known.has(id)).map(id => [item(id)]), pending: shuffle(ids.filter(id => !known.has(id)), seed + 7).map(item) };
}

/** Завершает движок по строгому модельному компаратору. */
function complete(engine) {
  let current;
  let guard = 0;
  while ((current = engine.getView().current)) {
    if (++guard > 100000 || !engine.answer(modelAnswer(current)).ok) throw new Error('Comparison did not terminate.');
  }
}

/** Предпочитает меньший числовой ранг, не используя предварительные оценки. */
function modelAnswer(pair) { return Number(pair.leftId) < Number(pair.rightId) ? 'left' : 'right'; }

/** Проверяет наблюдаемый итог, а не повторяет внутренние поисковые границы алгоритма. */
function verifyOrder(ids, size) {
  if (ids.length !== size || ids.some((id, i) => Number(id) !== i + 1)) throw new Error('Incorrect model order.');
}

/** Считает обычные двоичные вставки с той же исходной базой и очередью N. */
function binaryInsertion(known, pending) {
  const result = [...known];
  let count = 0;
  for (const item of pending) {
    let lower = 0, upper = result.length;
    while (lower < upper) { count++; const middle = Math.floor((lower + upper) / 2); if (item < result[middle]) upper = middle; else lower = middle + 1; }
    result.splice(lower, 0, item);
  }
  return count;
}

/** Считает обычное bottom-up слияние, считая K готовым блоком и не перепроверяя его. */
function ordinaryMerge(known, pending) {
  let queue = [...(known.length ? [[...known]] : []), ...pending.map(item => [item])];
  let count = 0;
  while (queue.length > 1) {
    const next = [];
    for (let i = 0; i < queue.length; i += 2) {
      if (!queue[i + 1]) { next.push(queue[i]); continue; }
      const first = queue[i], second = queue[i + 1], merged = [];
      let a = 0, b = 0;
      while (a < first.length && b < second.length) { count++; merged.push(first[a] < second[b] ? first[a++] : second[b++]); }
      next.push([...merged, ...first.slice(a), ...second.slice(b)]);
    }
    queue = next;
  }
  return count;
}

/** Перемешивает копию массива воспроизводимым линейным конгруэнтным генератором. */
function shuffle(input, seed) {
  const values = [...input];
  for (let i = values.length - 1; i > 0; i--) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; const j = seed % (i + 1); [values[i], values[j]] = [values[j], values[i]]; }
  return values;
}

/** Усредняет независимые фиксированные серии, сохраняя исходные числа в JSON. */
function average(values) { return round(values.reduce((sum, value) => sum + value, 0) / values.length); }

/** Ограничивает точность отчёта двумя знаками. */
function round(value) { return Math.round(value * 100) / 100; }

/** Формирует таблицы автоматически из тех же проверенных измерений. */
function markdown(result) {
  return `# Сравнение числа вопросов\n\nКоманда: \`node tools/sorting-benchmark/run.mjs\`. Seeds: ${result.seeds.join(', ')}; Node ${result.node}; gallopThreshold ${result.gallopThreshold}. Числа — средние по трём сериям. Все итоги проверены по независимому числовому компаратору.\n\n| M | K | Подсказки | Автовыбор | Авто | Вставки с подсказкой | Natural Merge | Двоичные вставки | Обычное слияние |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n`
    + result.rows.map(row => `| ${row.size} | ${row.knownSize} | ${row.mode} | ${row.strategy} | ${row.means.auto} | ${row.means.insertion} | ${row.means.merge} | ${row.means.binary} | ${row.means.ordinaryMerge} |`).join('\n')
    + `\n\n# Измерения на 500 тайтлах\n\nВремя зависит от машины и JIT. Сортировка включает получение представления для каждого вопроса без DOM и записи диска. Restore включает полную проверку журнала. Копия проверенного снимка измеряется в среднем за 10 вызовов. Для BrowserCollectionStore.set приведены среднее и максимум трёх записей с проверкой версии и имитацией IndexedDB в памяти.\n\n| M | K | Стратегия | Вопросов | Сортировка, мс | Restore, мс | Undo, мс | Проверенная копия, мс | Store mean/max, мс | Restore после 30 ответов, мс | JSON, байт |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n`
    + result.timings.map(row => `| ${row.size} | ${row.knownSize} | ${row.strategy} | ${row.questions} | ${row.sortMs} | ${row.restoreMs} | ${row.undoMs} | ${row.copyMs} | ${row.storeSetMs}/${row.storeSetMaxMs} | ${row.restoreAt30Ms ?? '—'} | ${row.bytes} |`).join('\n') + '\n';
}
