import type { SessionInput } from './session';

export type Relation = 'left' | 'right' | 'tie';
/** Прямое свидетельство; null обозначает исходный готовый порядок, а не ответ пользователя. */
export interface Fact { leftId: string; rightId: string; answer: Relation; eventId: string | null }

/** Ошибка цикла или несовместимого объединения с исходными свидетельствами. */
export class RelationConflict extends Error {
  /** Сохраняет ID исходных решений, необходимых для явного разрешения конфликта. */
  constructor(public readonly eventIds: string[]) { super('Ответ противоречит действующим отношениям. Пересмотри связанные решения.'); }
}

/** Классы равных и ориентированный граф строгого предпочтения; выводы не попадают в журнал ответов. */
export class Relations {
  private readonly parents = new Map<string, string>();
  private readonly order = new Map<string, number>();
  private facts: Fact[] = [];
  private edges = new Map<string, { to: string; eventId: string | null }[]>();
  private cache = new Map<string, Relation | null>();
  private reachable = new Map<string, Set<string>>();
  private knownPairCount: number | null = null;
  private classSizes: Map<string, number> | null = null;

  /** Инициализирует подтверждённые классы и готовый порядок K без пользовательских ответов. */
  constructor(input: Pick<SessionInput, 'known' | 'pending'>) {
    [...input.known.flat(), ...input.pending].forEach((id, i) => { this.parents.set(id, id); this.order.set(id, i); });
    for (const group of input.known) for (const id of group.slice(1)) {
      this.facts.push({ leftId: group[0]!, rightId: id, answer: 'tie', eventId: null });
      this.parents.set(id, group[0]!);
    }
    for (let i = 1; i < input.known.length; i++) this.facts.push({ leftId: input.known[i - 1]![0]!, rightId: input.known[i]![0]!, answer: 'left', eventId: null });
    this.rebuildEdges();
  }

  /** Устанавливает отношение транзакционно; известное обратное отношение всегда отклоняется. */
  add(fact: Fact): void {
    const known = this.compare(fact.leftId, fact.rightId);
    if (known !== null && known !== fact.answer) {
      const a = this.root(fact.leftId), b = this.root(fact.rightId);
      const path = known === 'left' ? this.path(a, b) : known === 'right' ? this.path(b, a) : this.facts.filter(x => x.answer === 'tie' && (this.root(x.leftId) === a || this.root(x.rightId) === a));
      throw new RelationConflict([...new Set([...path.map(x => x.eventId), fact.eventId].filter((id): id is string => id !== null))]);
    }
    this.facts.push({ ...fact });
    if (fact.answer === 'tie') {
      this.parents.set(this.root(fact.rightId), this.root(fact.leftId));
      this.rebuildEdges();
    } else {
      this.addEdge(fact);
      this.cache.clear();
      if (this.knownPairCount !== null) {
        const from = this.root(fact.answer === 'left' ? fact.leftId : fact.rightId);
        const to = this.root(fact.answer === 'left' ? fact.rightId : fact.leftId);
        this.extendReachability(from, to);
      } else this.reachable.clear();
    }
  }

  /** Возвращает прямое или транзитивно доказанное отношение, иначе null. */
  compare(leftId: string, rightId: string): Relation | null {
    const a = this.root(leftId), b = this.root(rightId);
    if (a === b) return 'tie';
    const key = JSON.stringify([a, b]);
    if (this.cache.has(key)) return this.cache.get(key)!;
    const relation = this.descendants(a).has(b) ? 'left' : this.descendants(b).has(a) ? 'right' : null;
    this.cache.set(key, relation);
    return relation;
  }

  /** Считает все известные неориентированные пары, включая равенства и транзитивные следствия. */
  countKnownPairs(): number {
    if (this.knownPairCount !== null) return this.knownPairCount;
    const sizes = new Map<string, number>();
    for (const id of this.parents.keys()) {
      const root = this.root(id);
      sizes.set(root, (sizes.get(root) ?? 0) + 1);
    }
    let count = 0;
    for (const [root, size] of sizes) {
      count += size * (size - 1) / 2;
      for (const descendant of this.descendants(root)) count += size * sizes.get(descendant)!;
    }
    this.classSizes = sizes;
    this.knownPairCount = count;
    return count;
  }

  /** Сохраняет исходный порядок членов класса независимо от порядка его объединений. */
  members(id: string): string[] {
    const root = this.root(id);
    return [...this.parents.keys()].filter(item => this.root(item) === root);
  }

  /** Стабильно объединяет группы, не создавая новых отношений. */
  stableGroup(ids: string[]): string[] {
    return [...new Set(ids)].sort((a, b) => this.order.get(a)! - this.order.get(b)!);
  }

  /** Находит представителя класса с сокращением путей. */
  private root(id: string): string {
    const parent = this.parents.get(id);
    if (parent === undefined) throw new Error('Неизвестный ID отношения.');
    if (parent === id) return id;
    const root = this.root(parent);
    this.parents.set(id, root);
    return root;
  }

  /** Перестраивает только прямые рёбра после объединения классов. */
  private rebuildEdges(): void {
    this.edges.clear(); this.cache.clear(); this.reachable.clear();
    this.knownPairCount = null;
    this.classSizes = null;
    for (const fact of this.facts) if (fact.answer !== 'tie') this.addEdge(fact);
  }

  /** Добавляет строгое свидетельство без пересоздания не изменившихся классов и рёбер. */
  private addEdge(fact: Fact): void {
    const from = this.root(fact.answer === 'left' ? fact.leftId : fact.rightId);
    const to = this.root(fact.answer === 'left' ? fact.rightId : fact.leftId);
    const edges = this.edges.get(from) ?? [];
    edges.push({ to, eventId: fact.eventId });
    this.edges.set(from, edges);
  }

  /** Дополняет готовое замыкание новым строгим ребром без повторного обхода всего графа. */
  private extendReachability(from: string, to: string): void {
    const targets = new Set([to, ...this.descendants(to)]);
    for (const [ancestor, descendants] of this.reachable) {
      if (ancestor !== from && !descendants.has(from)) continue;
      for (const target of targets) {
        if (descendants.has(target)) continue;
        descendants.add(target);
        this.knownPairCount! += this.classSizes!.get(ancestor)! * this.classSizes!.get(target)!;
      }
    }
  }

  /** Кэширует достижимые классы для выбора другой пары без отдельного обхода графа на каждую пару. */
  private descendants(from: string): Set<string> {
    const cached = this.reachable.get(from);
    if (cached) return cached;
    const result = new Set<string>();
    const queue = [from];
    for (let i = 0; i < queue.length; i++) for (const edge of this.edges.get(queue[i]!) ?? []) {
      if (result.has(edge.to)) continue;
      result.add(edge.to);
      queue.push(edge.to);
    }
    this.reachable.set(from, result);
    return result;
  }

  /** Возвращает свидетельства одного пути; отсутствие пути обозначается пустым массивом. */
  private path(from: string, to: string): { eventId: string | null }[] {
    const queue = [from];
    const previous = new Map<string, { from: string; eventId: string | null }>();
    const seen = new Set(queue);
    for (let i = 0; i < queue.length; i++) {
      const node = queue[i]!;
      for (const edge of this.edges.get(node) ?? []) {
        if (seen.has(edge.to)) continue;
        seen.add(edge.to); previous.set(edge.to, { from: node, eventId: edge.eventId });
        if (edge.to === to) {
          const result: { eventId: string | null }[] = [];
          let cursor = to;
          while (cursor !== from) { const step = previous.get(cursor)!; result.push(step); cursor = step.from; }
          return result;
        }
        queue.push(edge.to);
      }
    }
    return [];
  }
}
