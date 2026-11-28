import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('../../', import.meta.url));
const sizes = [[6, 0], [9, 0], [16, .25], [32, 0], [32, .5], [64, .9], [96, 0], [96, .4], [145, .85], [256, 0], [500, 0], [500, .9]];
const hintNoise = [.025, .15, .5, 1.2, Infinity];
const runtime = await createServer({
  root,
  configFile: false, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error',
});
try {
  const { PairwiseSorterEngine } = await runtime.ssrLoadModule('/src/entities/sorting/engine.ts');
  const rows = [];
  for (const [size, knownFraction] of sizes) {
    for (const [noiseIndex, noise] of hintNoise.entries()) {
      for (let trial = 0; trial < 4; trial++) {
        const seed = 143799 + size * 15173 + Math.round(knownFraction * 1000) * 132233 + noiseIndex * 3571 + trial * 86629;
        const { input, ranks } = sample(size, knownFraction, noise, seed);
        const engine = new PairwiseSorterEngine(input);
        let view = engine.getView();
        const forecast = view.remainingEstimate;
        let overrun = false;
        while (view.current) {
          if (view.directComparisonCount >= forecast) overrun = true;
          if (view.remainingEstimate < 1 || view.progressPercent >= 100) throw new Error('Unfinished session shows full progress.');
          const left = ranks.get(view.current.leftId), right = ranks.get(view.current.rightId);
          if (!engine.answer(left === right ? 'tie' : left < right ? 'left' : 'right').ok) throw new Error('Ranked answer was rejected.');
          view = engine.getView();
        }
        if (view.remainingEstimate !== 0 || view.progressPercent !== 100) throw new Error('Finished session is missing full progress.');
        rows.push({ size, knownFraction, strategy: view.strategy, forecast, overrun, actual: view.directComparisonCount });
      }
    }
  }
  console.log(JSON.stringify({
    total: metrics(rows),
    insertion: metrics(rows.filter(row => row.strategy === 'insertion')),
    merge: metrics(rows.filter(row => row.strategy === 'merge')),
    examples: rows.filter(row => row.size === 500 && row.knownFraction === 0).slice(-4),
  }, null, 2));
} finally {
  await runtime.close();
}

/** Создаёт готовую базу и очередь с подсказками разной точности, включая ничьи. */
function sample(size, knownFraction, noise, seed) {
  const random = randomSequence(seed);
  const ids = Array.from({ length: size }, (_, i) => String(i + 1));
  const order = ids.map(id => ({ id, key: random() })).sort((a, b) => a.key - b.key);
  const tieSize = random() < .2 ? (random() < .5 ? 2 : 5) : 1;
  const ranks = new Map(order.map(({ id }, position) => [id, Math.floor(position / tieSize)]));
  const knownIds = new Set(ids.slice(0, Math.floor(size * knownFraction)));
  const groups = Map.groupBy(order.filter(({ id }) => knownIds.has(id)).map(({ id }) => id), id => ranks.get(id));
  const pending = ids.filter(id => !knownIds.has(id));
  const queue = pending.map(id => ({
    id, key: noise === Infinity ? random() : ranks.get(id) * tieSize / size + noise * (random() - .5),
  })).sort((a, b) => a.key - b.key).map(({ id }) => id);
  return { input: { known: [...groups.values()], pending, queue }, ranks };
}

/** Повторяет выборку независимо от текущего состояния Math.random. */
function randomSequence(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), seed | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** Считает долю прогнозов, покрывших итог, и запас над фактическим числом ответов. */
function metrics(rows) {
  const covered = rows.filter(row => row.forecast >= row.actual).length;
  const percentage = rows.length ? +(100 * covered / rows.length).toFixed(1) : null;
  const totalActual = rows.reduce((sum, row) => sum + row.actual, 0);
  const totalForecast = rows.reduce((sum, row) => sum + row.forecast, 0);
  return { sessions: rows.length, covered, coveragePercent: percentage,
    unfinishedAfterForecast: rows.filter(row => row.overrun).length, totalActual, totalForecast };
}
