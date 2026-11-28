import { renderAttributes } from './attributes';
import type { ElementAttributes } from './attributes';

interface CardProps {
  tag?: 'section' | 'article' | 'label';
  padded?: boolean;
  className?: string;
  attributes?: ElementAttributes;
  contentMarkup: string;
}

/** Оборачивает разметку в карточку с нужным HTML-тегом и отступами. */
export function renderCard({ tag = 'section', padded = true, className, attributes, contentMarkup }: CardProps): string {
  const classes = ['card', padded ? 'panel' : '', className].filter(Boolean).join(' ');
  const attrs = renderAttributes({ ...attributes, class: classes });
  return `<${tag}${attrs}>${contentMarkup}</${tag}>`;
}

/** Не активирует связанный флажок или переключатель при выделении названия. */
export function preventLabelActivationOnCardTitle(event: MouseEvent): void {
  if (!(event.target instanceof Element)) return;
  const title = event.target.closest('label .card-title');
  if (!title) return;
  const style = title.ownerDocument.defaultView?.getComputedStyle(title);
  if (style?.userSelect !== 'none' && style?.webkitUserSelect !== 'none') event.preventDefault();
}
