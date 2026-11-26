import { escapeHtml } from '../lib/escape-html';
import { renderAttributes } from './attributes';
import type { ElementAttributes } from './attributes';

interface ButtonProps {
  label: string;
  type?: 'button' | 'submit' | 'reset';
  form?: string;
  disabled?: boolean;
  hidden?: boolean;
  attributes?: ElementAttributes;
}

type ButtonAppearance = { variant: 'primary' | 'secondary' | 'text' }
  | { variant: 'icon'; iconPaths: string; className?: string };

const buttonClasses = { primary: 'button primary', secondary: 'button secondary', text: 'text-button', icon: 'icon-button' };

/** Формирует кнопку с текстом или размеченной разработчиком иконкой и доступным именем. */
export function renderButton(props: ButtonProps & ButtonAppearance): string {
  const { label, type = 'button', form, disabled, hidden, attributes, variant } = props;
  const className = variant === 'icon' && props.className ? ` ${props.className}` : '';
  const attrs = renderAttributes({
    ...attributes, type, form, class: buttonClasses[variant] + className, disabled, hidden,
    'aria-label': variant === 'icon' ? label : attributes?.['aria-label'],
  });
  const content = variant === 'icon'
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${props.iconPaths}</svg>`
    : escapeHtml(label);
  return `<button${attrs}>${content}</button>`;
}
