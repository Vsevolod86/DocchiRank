const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Экранирует текст и значения атрибутов перед вставкой в HTML. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => entities[character]!);
}
