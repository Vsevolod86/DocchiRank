import { renderAttributes } from './attributes';
import type { ElementAttributes } from './attributes';

interface InputProps {
  name?: string;
  disabled?: boolean;
  required?: boolean;
  attributes?: ElementAttributes;
}

type InputKind =
  | { type: 'text'; value: string; placeholder?: string; autocomplete?: 'on' | 'off'; spellcheck?: boolean; appearance?: 'outlined' }
  | { type: 'file'; accept: string; appearance?: 'outlined' | 'compact' }
  | { type: 'checkbox' | 'radio'; value?: string; checked: boolean };

/** Формирует нативное поле с заданным состоянием и оформлением. */
export function renderInput(props: InputProps & InputKind): string {
  const { type, name, disabled, required, attributes } = props;
  const appearance = 'appearance' in props ? props.appearance : undefined;
  const common = { ...attributes, type, name, disabled, required, class: appearance ? `input-field input-field--${appearance}` : undefined };
  if (type === 'text') {
    const { value, placeholder, autocomplete, spellcheck } = props;
    return `<input${renderAttributes({ ...common, value, placeholder, autocomplete, spellcheck: spellcheck?.toString() })}>`;
  }
  if (type === 'file') return `<input${renderAttributes({ ...common, accept: props.accept })}>`;
  return `<input${renderAttributes({ ...common, value: props.value, checked: props.checked })}>`;
}
