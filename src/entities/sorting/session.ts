/** Неизменяемые данные произведения в начале одного цикла сравнения. */
export interface Item {
  id: string;
  title: string;
  userScore: number | null;
  communityScore: number | null;
}

export type Strategy = 'insertion' | 'merge';
export type Answer = 'left' | 'right' | 'tie' | 'skip';

/** Готовые классы равных K и независимая неупорядоченная очередь N. */
export interface EngineInput { known: Item[][]; pending: Item[] }

/** Группы готовой базы, исходный порядок новых тайтлов и очередь сравнений. */
export interface SessionInput { known: string[][]; pending: string[]; queue: string[] }

/** Параметры воспроизводимого цикла; автоматический выбор фиксируется при создании. */
export interface EngineOptions { strategy?: Strategy | 'auto'; gallopThreshold?: number; sessionId?: string }

/** Запись полного журнала; undo и revise никогда не удаляют исходные события. */
export interface SortingEvent {
  id: string;
  sequence: number;
  type: 'answer' | 'undo' | 'revise';
  leftId: string | null;
  rightId: string | null;
  answer: Answer | null;
  targetEventId: string | null;
  affectedIds: string[];
}

/** ID двух тайтлов в показанной паре. */
export interface CurrentPair { leftId: string; rightId: string }

/** Параметры приостановленного поиска или слияния для проверки точного восстановления. */
export interface AlgorithmPosition {
  phase: 'hint' | 'gallop-left' | 'gallop-right' | 'binary' | 'runs' | 'merge' | 'merge-gallop' | 'done';
  orderedGroups: string[][];
  runs: string[][][];
  candidateId: string | null;
  lower: number;
  upper: number;
  probe: number;
  step: number;
}

/** Сериализуемый снимок состояния без генераторов, DOM и изменяемых ссылок. */
export interface SortingProgress {
  orderedIds: string[];
  pendingIds: string[];
  comparisonCount: number;
  orderedGroups: string[][];
  current: CurrentPair | null;
  position: AlgorithmPosition;
}

/** Вход и журнал, достаточные для воспроизведения сессии. */
export interface StoredSortingSession {
  schemaVersion: 2;
  algorithmVersion: 1;
  sessionId: string;
  input: SessionInput;
  options: { strategy: Strategy; gallopThreshold: number };
  history: SortingEvent[];
}

/** Рабочий снимок с вычисленным прогрессом для интерфейса. */
export interface SortingSession extends StoredSortingSession {
  progress: SortingProgress;
}

/** Оставляет в снимке вход, настройки и журнал. */
export function storedSortingSession({ progress, ...session }: SortingSession): StoredSortingSession {
  return session;
}

/** Точные счётчики пар и независимый служебный прогноз числа вопросов для интерфейса. */
export interface EngineView {
  current: CurrentPair | null;
  orderedGroups: string[][];
  pendingIds: string[];
  comparisonCount: number;
  directComparisonCount: number;
  comparisonTotal: number;
  comparisonUpperBound: number;
  inferredComparisonCount: number;
  canSkip: boolean;
  status: 'comparing' | 'complete';
  progressPercent: number;
  remainingEstimate: number;
  strategy: Strategy;
  canUndo: boolean;
  activeAnswers: SortingEvent[];
}

/** Отказ применения противоречия с ID решений, которые можно явно пересмотреть. */
export interface MutationResult { ok: boolean; conflict?: { message: string; eventIds: string[] } }
