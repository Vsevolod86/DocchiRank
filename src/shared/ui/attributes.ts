import { escapeHtml } from '../lib/escape-html';

/** Дополнительные атрибуты элемента для доступности и делегирования событий. */
export interface ElementAttributes {
  id?: string | undefined;
  title?: string | undefined;
  [attribute: `aria-${string}` | `data-${string}`]: string | undefined;
}

/** Формирует атрибуты HTML, опуская отсутствующие значения и выключенные флаги. */
export function renderAttributes(attributes: Record<string, string | boolean | undefined>): string {
  let markup = '';
  for (const [name, value] of Object.entries(attributes)) {
    if (!/^[a-z][a-z0-9-]*$/.test(name)) throw new TypeError(`Некорректный атрибут: ${name}`);
    if (value === true) markup += ` ${name}`;
    if (typeof value === 'string') markup += ` ${name}="${escapeHtml(value)}"`;
  }
  return markup;
}
