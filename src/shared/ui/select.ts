import { escapeHtml } from '../lib/escape-html';
import { renderAttributes } from './attributes';
import type { ElementAttributes } from './attributes';

interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectProps {
  name?: string;
  value?: string | undefined;
  options: readonly SelectOption[];
  appearance?: 'outlined';
  disabled?: boolean;
  autofocus?: boolean;
  attributes?: ElementAttributes;
}

/** Формирует нативный раскрывающийся список из переданных вариантов. */
export function renderSelect({ name, value, options, appearance, disabled, autofocus, attributes }: SelectProps): string {
  const markup = renderAttributes({
    ...attributes, name, disabled, autofocus, class: appearance ? `input-field input-field--${appearance}` : undefined,
  });
  return `<select${markup}>${options.map(option => `<option${renderAttributes({
    value: option.value, selected: option.value === value, disabled: option.disabled,
  })}>${escapeHtml(option.label)}</option>`).join('')}</select>`;
}
