import { FORECAST_SETTINGS, SORTING_SETTINGS } from '../../config/sorting';
import { estimateComparisons, forecastComparisons, forecastRemainingComparisons, normalizeSessionInput, priorOrder } from './contracts';
import { insertion, naturalMerge } from './algorithms';
import type { SortProgram } from './algorithms';
import { activeActions, effectiveAnswers, isRelation } from './journal';
import { RelationConflict, Relations } from './relations';
import type { Relation } from './relations';
import { storedSortingSession } from './session';
import type { AlgorithmPosition, Answer, CurrentPair, EngineInput, EngineOptions, EngineView, Item, MutationResult, SessionInput, SortingEvent, SortingSession, StoredSortingSession, Strategy } from './session';

/** Независимый интерактивный сортировщик с доказуемыми отношениями и полным журналом действий. */
export class PairwiseSorterEngine {
  private static readonly validatedStates = new Map<string, SortingSession>();
  private readonly input: SessionInput;
  private readonly options: { strategy: Strategy; gallopThreshold: number };
  private readonly sessionId: string;
  private readonly ids: string[];
  private readonly initialKnownPairCount: number;
  private readonly comparisonTotal: number;
  private readonly comparisonUpperBound: number;
  private forecastTotal = 0;
  private history: SortingEvent[] = [];
  private active: SortingEvent[] = [];
  private answers: SortingEvent[] = [];
  private relations!: Relations;
  private program!: SortProgram;
  private current: CurrentPair | null = null;
  private waiting: CurrentPair | null = null;
  private skippedPairs = new Set<string>();
  private directPairs = new Set<string>();
  private alternativeAvailable: boolean | null = null;
  private position!: AlgorithmPosition;
  private ordered: string[][] = [];

  /** Проверяет K/N и фиксирует независимые исходные данные и выбранную стратегию. */
  constructor(input: EngineInput | SessionInput, options: EngineOptions = {}) {
    this.input = normalizeSessionInput(input);
    if (options.strategy !== undefined && !['auto', 'insertion', 'merge'].includes(options.strategy)
      || options.gallopThreshold !== undefined && (!Number.isSafeInteger(options.gallopThreshold) || options.gallopThreshold < 1)
      || options.sessionId !== undefined && (typeof options.sessionId !== 'string' || !options.sessionId.trim())) throw new Error('Некорректные параметры сортировки.');
    const estimates = estimateComparisons(this.input.known.length, this.input.pending.length);
    const strategy = options.strategy ?? SORTING_SETTINGS.strategy;
    this.options = {
      strategy: strategy === 'auto' ? estimates.selected : strategy,
      gallopThreshold: options.gallopThreshold ?? SORTING_SETTINGS.gallopThreshold,
    };
    this.comparisonUpperBound = estimates[this.options.strategy];
    this.sessionId = options.sessionId ?? crypto.randomUUID();
    const knownIds = this.input.known.flat();
    this.ids = [...knownIds, ...this.input.pending];
    this.initialKnownPairCount = knownIds.length * (knownIds.length - 1) / 2;
    this.comparisonTotal = this.ids.length * (this.ids.length - 1) / 2 - this.initialKnownPairCount;
    this.rebuild();
  }

  /** Воспроизводит сессию, сверяя каждое событие с показанной парой. */
  static restore(value: unknown): PairwiseSorterEngine {
    if (!value || typeof value !== 'object') throw new Error('Некорректное состояние сессии.');
    const session = value as SortingSession | StoredSortingSession;
    if (session.schemaVersion !== 2 || session.algorithmVersion !== 1 || !session.options || !Array.isArray(session.history)) {
      throw new Error('Неизвестная версия сессии.');
    }
    const engine = new PairwiseSorterEngine(session.input, { ...session.options, sessionId: session.sessionId });
    const firstAction = session.history.findIndex(event => event?.type !== 'reuse');
    const reusedCount = firstAction === -1 ? session.history.length : firstAction;
    engine.loadReusedAnswers(session.history.slice(0, reusedCount));
    for (const event of session.history.slice(reusedCount)) {
      if (!event || typeof event !== 'object' || !Array.isArray(event.affectedIds)) throw new Error('Некорректное событие журнала.');
      let result: MutationResult;
      if (event.type === 'answer') result = engine.answer(event.answer as Answer);
      else if (event.type === 'undo') result = engine.undo();
      else if (event.type === 'revise') result = engine.revise(event.targetEventId!, event.answer as Answer, event.affectedIds.length > 0);
      else throw new Error('Неизвестное действие в журнале.');
      if (!result.ok || !same(engine.history[engine.history.length - 1], event)) throw new Error('Нарушена последовательность событий журнала.');
    }
    const snapshot = engine.getState();
    const expected = 'progress' in session ? snapshot : storedSortingSession(snapshot);
    if (!same(expected, value)) throw new Error('Состояние не соответствует исходным данным и журналу.');
    return engine;
  }

  /** Копирует известный неизменённый снимок, иначе выполняет полную проверку журнала. */
  static copyValidatedState(value: unknown): SortingSession {
    const sessionId = value && typeof value === 'object' ? (value as { sessionId?: unknown }).sessionId : null;
    const cached = typeof sessionId === 'string' ? this.validatedStates.get(sessionId) : undefined;
    if (cached && (same(cached, value) || same(storedSortingSession(cached), value))) return copySession(cached);
    return this.restore(value).getState();
  }

  /** Пересчитывает очередь, сохраняя действующие прямые ответы по оставшимся парам. */
  withPending(pending: readonly Item[]): PairwiseSorterEngine {
    const engine = new PairwiseSorterEngine({
      known: this.input.known,
      pending: pending.map(item => item.id),
      queue: priorOrder(pending).map(item => item.id),
    }, this.options);
    const ids = new Set(engine.ids);
    engine.loadReusedAnswers(this.answers.filter(event =>
      isRelation(event.answer) && ids.has(event.leftId!) && ids.has(event.rightId!)));
    return engine;
  }

  /** Возвращает изолированный JSON-снимок, включая остановленный поиск и текущую пару. */
  getState(): SortingSession {
    const orderedIds = this.ordered.flat();
    const placed = new Set(orderedIds);
    const pendingIds = this.ids.filter(id => !placed.has(id));
    const snapshot: SortingSession = { ...structuredClone({
      schemaVersion: 2, algorithmVersion: 1, sessionId: this.sessionId, input: this.input, options: this.options,
      progress: { orderedIds, pendingIds,
        comparisonCount: this.answers.filter(event => isRelation(event.answer)).length, orderedGroups: this.ordered, current: this.current, position: this.position },
    }), history: copyEvents(this.history) };
    PairwiseSorterEngine.validatedStates.delete(this.sessionId);
    PairwiseSorterEngine.validatedStates.set(this.sessionId, copySession(snapshot));
    if (PairwiseSorterEngine.validatedStates.size > SORTING_SETTINGS.validatedStateCacheSize) {
      PairwiseSorterEngine.validatedStates.delete(PairwiseSorterEngine.validatedStates.keys().next().value!);
    }
    return snapshot;
  }

  /** Показывает размещённые классы и тайтлы, которым ещё нужно определить место. */
  getView(): EngineView {
    const orderedGroups = structuredClone(this.ordered);
    const placed = new Set(orderedGroups.flat());
    const status = this.current ? 'comparing' : 'complete';
    const { strategy } = this.options;
    const directComparisonCount = this.directPairs.size;
    const inferredComparisonCount = this.inferredComparisonCount();
    const unansweredPairs = this.comparisonTotal - directComparisonCount - inferredComparisonCount;
    // Сохраняем небольшой запас, если сессия подходит к прогнозу, но вопросы ещё есть.
    const reserve = Math.max(1, Math.ceil(directComparisonCount / FORECAST_SETTINGS.overrunReserveDivisor));
    const remainingEstimate = status === 'complete' ? 0 :
      Math.min(unansweredPairs, Math.max(reserve, this.forecastTotal - directComparisonCount));
    const estimatedTotal = directComparisonCount + remainingEstimate;
    return {
      current: structuredClone(this.current),
      currentGroups: this.current ? {
        left: this.relations.members(this.current.leftId),
        right: this.relations.members(this.current.rightId),
      } : null,
      orderedGroups,
      pendingIds: this.ids.filter(id => !placed.has(id)),
      comparisonCount: this.history.filter(event => event.type === 'revise' || (event.type === 'answer' || event.type === 'reuse') && isRelation(event.answer)).length,
      directComparisonCount, comparisonTotal: this.comparisonTotal, comparisonUpperBound: this.comparisonUpperBound, inferredComparisonCount,
      canSkip: this.hasAlternative(),
      status, strategy, canUndo: this.active.length > 0,
      remainingEstimate, progressPercent: status === 'complete' ? 100 : Math.min(99, Math.round(100 * directComparisonCount / estimatedTotal)),
      activeAnswers: copyEvents(this.answers),
    };
  }

  /** Принимает ответ или пропуск для показанной пары. */
  answer(answer: Answer): MutationResult {
    if (!isRelation(answer) && answer !== 'skip') throw new Error('Неизвестный ответ.');
    if (!this.current) return { ok: false };
    if (answer === 'skip' && !this.hasAlternative()) return { ok: false };
    const event = this.event('answer', { ...this.current, answer });
    try { this.applyAnswer(event, answer, true); }
    catch (error) { return conflict(error); }
    return { ok: true };
  }

  /** Отменяет последнее действующее действие, сохраняя отменённое событие в полном журнале. */
  undo(): MutationResult {
    const previous = this.active[this.active.length - 1];
    if (!previous) return { ok: false };
    this.history.push(this.event('undo', { targetEventId: previous.id }));
    this.rebuild();
    return { ok: true };
  }

  /** Исправляет действующий ответ; конфликтующие решения снимаются только по явному разрешению. */
  revise(eventId: string, answer: Answer, discardConflicts = false): MutationResult {
    if (!['left', 'right', 'tie'].includes(answer)) throw new Error('Для пересмотра выбери левое, правое или равенство.');
    const previous = this.answers.find(event => event.id === eventId);
    if (!previous || !isRelation(previous.answer)) return { ok: false };
    const dropped = new Set<string>();
    while (true) {
      const event = this.event('revise', { targetEventId: eventId, leftId: previous.leftId, rightId: previous.rightId, answer, affectedIds: [...dropped] });
      try {
        this.prepare([...this.history, event]);
        this.history.push(event); this.rebuild();
        return { ok: true };
      } catch (error) {
        if (!(error instanceof RelationConflict)) throw error;
        const removable = error.eventIds.filter(id => id !== eventId && !dropped.has(id));
        if (!discardConflicts || !removable.length) return conflict(error);
        removable.forEach(id => dropped.add(id));
      }
    }
  }

  /** Загружает перенесённые ответы перед новыми вопросами, проверяя допустимость каждой пары. */
  private loadReusedAnswers(answers: readonly SortingEvent[]): void {
    if (answers.length === 0) return;
    const ids = new Set(this.ids);
    const pending = new Set(this.input.pending);
    const pairs = new Set<string>();
    for (const { leftId, rightId, answer } of answers) {
      if (!leftId || !rightId || leftId === rightId || !ids.has(leftId) || !ids.has(rightId)
        || !pending.has(leftId) && !pending.has(rightId) || !isRelation(answer)) {
        throw new Error('Недопустимый перенесённый ответ.');
      }
      const pair = pairKey(leftId, rightId);
      if (pairs.has(pair)) throw new Error('Повторная пара в перенесённых ответах.');
      pairs.add(pair);
      this.history.push(this.event('reuse', { leftId, rightId, answer }));
    }
    this.restart(this.history);
  }

  /** Создаёт последовательный ID без зависимости от настенных часов. */
  private event(type: SortingEvent['type'], fields: Partial<SortingEvent> = {}): SortingEvent {
    const sequence = this.history.length + 1;
    return { id: `${this.sessionId}:${sequence}`, sequence, type, leftId: null, rightId: null, answer: null, targetEventId: null, affectedIds: [], ...fields };
  }

  /** Выводит активные действия и отношения, не меняя живое состояние до успешной проверки. */
  private prepare(history: SortingEvent[]): { active: SortingEvent[]; answers: SortingEvent[]; relations: Relations } {
    const active = activeActions(history);
    const answers = [...effectiveAnswers(active).values()];
    const relations = new Relations(this.input);
    for (const event of answers) if (isRelation(event.answer)) relations.add({ leftId: event.leftId!, rightId: event.rightId!, answer: event.answer, eventId: event.id });
    return { active, answers, relations };
  }

  /** Перезапускает поиск по действующим отношениям после отмены или пересмотра. */
  private rebuild(): void {
    const actions = activeActions(this.history);
    const firstAction = actions.findIndex(event => event.type !== 'reuse');
    const reusedCount = firstAction === -1 ? actions.length : firstAction;
    this.restart(actions.slice(0, reusedCount));
    for (let index = reusedCount; index < actions.length; index++) {
      const event = actions[index]!;
      if (event.type === 'answer' && (isRelation(event.answer) || event.answer === 'skip')) {
        if (this.current?.leftId !== event.leftId || this.current?.rightId !== event.rightId) {
          throw new Error(event.answer === 'skip' ? 'Пропуск не соответствует показанной паре.' : 'Журнал не соответствует показанным парам.');
        }
        this.applyAnswer(event, event.answer, false);
      } else this.restart(actions.slice(0, index + 1));
    }
  }

  /** Пересчитывает границы после действий, меняющих очередь или действующие свидетельства. */
  private restart(history: SortingEvent[]): void {
    const state = this.prepare(history);
    this.active = state.active; this.answers = state.answers; this.relations = state.relations;
    this.directPairs = new Set(this.answers.filter(event => isRelation(event.answer)).map(event => pairKey(event.leftId!, event.rightId!)));
    this.skippedPairs = new Set(this.answers.filter(event => event.answer === 'skip').map(event => pairKey(event.leftId!, event.rightId!)));
    const seen = new Set<string>();
    const take = (id: string): string[] => {
      const group = this.relations.members(id);
      if (group.some(member => seen.has(member))) return [];
      group.forEach(member => seen.add(member));
      return group;
    };
    const known = this.input.known.map(group => take(group[0]!)).filter(group => group.length > 0);
    const pending = this.input.queue.map(take).filter(group => group.length > 0);
    const stable = (ids: string[]): string[] => this.relations.stableGroup(ids);
    this.program = this.options.strategy === 'insertion' ? insertion(known, pending, stable) : naturalMerge(known, pending, this.options.gallopThreshold, stable);
    this.advance();
    this.refreshForecast();
  }

  /** Обновляет действующие ответы и позицию поиска, добавляя событие в журнал только при новом ответе. */
  private applyAnswer(event: SortingEvent, answer: Relation | 'skip', recordHistory: boolean): void {
    const leftId = event.leftId!;
    const rightId = event.rightId!;
    if (answer !== 'skip') this.relations.add({ leftId, rightId, answer, eventId: event.id });

    if (recordHistory) this.history.push(event);
    this.active.push(event);
    this.answers.push(event);

    const key = pairKey(leftId, rightId);
    if (answer === 'skip') {
      this.skippedPairs.add(key);
      this.selectQuestion();
    } else {
      this.directPairs.add(key);
      this.continueAfterAnswer(answer);
      if (this.directPairs.size % FORECAST_SETTINGS.refreshEveryAnswers === 0) this.refreshForecast();
    }
  }

  /** Уточняет прогноз по достигнутой позиции, опираясь на прямые ответы. */
  private refreshForecast(): void {
    const answered = this.directPairs.size;
    const { strategy } = this.options;
    const remaining = answered === 0
      ? forecastComparisons(this.input.known.length, this.input.pending.length, strategy)
      : forecastRemainingComparisons(this.input, this.position, strategy, answered);
    this.forecastTotal = Math.min(this.comparisonUpperBound, answered + remaining);
  }

  /** Пропускает доказанные отношения, останавливаясь только на неизвестной пользователю паре. */
  private advance(answer?: Relation): void {
    let result = answer === undefined ? this.program.next() : this.program.next(answer);
    while (!result.done) {
      const request = result.value;
      const known = this.relations.compare(request.leftId, request.rightId);
      if (known === null) {
        this.waiting = { leftId: request.leftId, rightId: request.rightId };
        this.position = structuredClone(request.position);
        this.ordered = structuredClone(request.position.orderedGroups);
        this.selectQuestion();
        return;
      }
      result = this.program.next(known);
    }
    this.ordered = structuredClone(result.value);
    this.current = null;
    this.waiting = null;
    this.alternativeAvailable = null;
    this.position = { phase: 'done', orderedGroups: structuredClone(this.ordered), runs: [], candidateId: null, lower: 0, upper: 0, probe: 0, step: 1 };
  }

  /** Возвращает ответ генератору только для его пары; диагностическая пара лишь дополняет отношения. */
  private continueAfterAnswer(answer: Relation): void {
    if (!this.waiting || !this.current) throw new Error('Нет ожидающей пары.');
    if (this.current.leftId === this.waiting.leftId && this.current.rightId === this.waiting.rightId) {
      this.advance(answer);
      return;
    }
    const relation = this.relations.compare(this.waiting.leftId, this.waiting.rightId);
    if (relation === null) this.selectQuestion();
    else {
      this.advance(relation);
    }
  }

  /** Показывает другую неизвестную пару, возвращаясь к нужной алгоритму после полного круга пропусков. */
  private selectQuestion(): void {
    this.alternativeAvailable = null;
    if (!this.waiting) { this.current = null; return; }
    if (!this.skippedPairs.has(pairKey(this.waiting.leftId, this.waiting.rightId))) {
      this.current = { ...this.waiting };
      return;
    }
    const alternative = this.findAlternative(this.skippedPairs);
    if (alternative) this.current = alternative;
    else { this.skippedPairs.clear(); this.current = { ...this.waiting }; }
  }

  /** Повторные чтения одного представления не обходят все пары заново. */
  private hasAlternative(): boolean {
    if (!this.current) return false;
    this.alternativeAvailable ??= this.findAlternative(new Set([pairKey(this.current.leftId, this.current.rightId)])) !== null;
    return this.alternativeAvailable;
  }

  /** Выбирает детерминированно первую другую неизвестную пару, не исключая тайтлы из сортировки. */
  private findAlternative(excluded: Set<string>): CurrentPair | null {
    const ids = this.ids;
    const focus = this.waiting ? [this.waiting.leftId, this.waiting.rightId] : [];
    for (const leftId of focus) for (const rightId of ids) {
      if (leftId === rightId || excluded.has(pairKey(leftId, rightId)) || this.relations.compare(leftId, rightId) !== null) continue;
      return { leftId, rightId };
    }
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const leftId = ids[i]!, rightId = ids[j]!;
      if (excluded.has(pairKey(leftId, rightId)) || this.relations.compare(leftId, rightId) !== null) continue;
      return { leftId, rightId };
    }
    return null;
  }

  /** Отделяет новые выводы от прямых ответов и отношений уже упорядоченной базы. */
  private inferredComparisonCount(): number {
    return Math.max(0, this.relations.countKnownPairs() - this.initialKnownPairCount - this.directPairs.size);
  }
}

/** Канонизирует неориентированную пару без ограничений на содержимое ID. */
function pairKey(leftId: string, rightId: string): string {
  return JSON.stringify(leftId < rightId ? [leftId, rightId] : [rightId, leftId]);
}

/** Сообщает противоречие, не раскрывая внутренний граф интерфейсу. */
function conflict(error: unknown): MutationResult {
  if (!(error instanceof RelationConflict)) throw error;
  return { ok: false, conflict: { message: error.message, eventIds: error.eventIds } };
}

/** Сравнивает JSON-объекты независимо от порядка ключей, но с сохранением порядка массивов. */
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const array = Array.isArray(a);
  if (array !== Array.isArray(b)) return false;
  if (Object.getPrototypeOf(a) !== (array ? Array.prototype : Object.prototype)
    || Object.getPrototypeOf(b) !== (array ? Array.prototype : Object.prototype)) return false;
  if (array && (a as unknown[]).length !== (b as unknown[]).length) return false;
  const x = a as Record<string, unknown>, y = b as Record<string, unknown>;
  const keys = Reflect.ownKeys(x);
  return keys.length === Reflect.ownKeys(y).length && keys.every(key => {
    const first = Object.getOwnPropertyDescriptor(x, key), second = Object.getOwnPropertyDescriptor(y, key);
    return first && second && first.enumerable === second.enumerable && 'value' in first && 'value' in second && same(first.value, second.value);
  });
}

/** Копирует плоские события и единственное вложенное поле без обхода неизменяемых строк. */
function copyEvents(events: readonly SortingEvent[]): SortingEvent[] {
  return events.map(event => ({ ...event, affectedIds: [...event.affectedIds] }));
}

/** Копирует публичный снимок, сохраняя изоляцию канонического кэша от вызывающего кода. */
function copySession(session: SortingSession): SortingSession {
  const { history, ...state } = session;
  return { ...structuredClone(state), history: copyEvents(history) };
}
