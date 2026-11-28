import type { Relation } from './relations';
import type { Answer, SortingEvent } from './session';

/** Восстанавливает действующие действия, проверяя последовательность отмен. */
export function activeActions(history: readonly SortingEvent[]): SortingEvent[] {
  const active: SortingEvent[] = [];
  for (const event of history) {
    if (event.type === 'undo') {
      if (active[active.length - 1]?.id !== event.targetEventId) throw new Error('Отмена не соответствует последнему действию.');
      active.pop();
    } else active.push(event);
  }
  return active;
}

/** Собирает ответы с учётом пересмотров и снятых при конфликте решений. */
export function effectiveAnswers(active: readonly SortingEvent[]): Map<string, SortingEvent> {
  const effective = new Map<string, SortingEvent>();
  for (const event of active) {
    if (event.type === 'answer' || event.type === 'reuse') effective.set(event.id, { ...event });
    if (event.type === 'revise') {
      const original = effective.get(event.targetEventId!);
      if (!original || !isRelation(original.answer)) throw new Error('Не найден ответ для пересмотра.');
      effective.set(original.id, { ...original, answer: event.answer });
      event.affectedIds.forEach(id => effective.delete(id));
    }
  }
  return effective;
}

/** Отличает отношение предпочтения от действий, не сравнивающих тайтлы. */
export function isRelation(answer: Answer | null): answer is Relation {
  return answer === 'left' || answer === 'right' || answer === 'tie';
}
