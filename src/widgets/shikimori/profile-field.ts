import { parseProfileInput } from '../../integrations/shikimori-data';
import { escapeHtml } from '../../shared/lib/escape-html';
import { renderInput } from '../../shared/ui/input';

/** Параметры поля профиля для формы импорта или проверки ника. */
interface ShikimoriProfileField {
    id: string;
    value: string;
    describedBy: string;
    disabled?: boolean;
}

/** Показывает одинаковое поле для ника и ссылки на профиль Shikimori. */
export function renderShikimoriProfileField({ id, value, describedBy, disabled = false }: ShikimoriProfileField): string {
    return `<div>
      <label for="${escapeHtml(id)}">Ник или ссылка на профиль</label>
      ${renderInput({
        type: 'text', name: 'profile', value, appearance: 'outlined',
        placeholder: 'shikimori.io/username', required: true, disabled, autocomplete: 'off', spellcheck: false,
        attributes: { id, 'aria-describedby': describedBy, 'data-shikimori-profile': '' },
    })}</div>`;
}

/** Подставляет ник при вставке ссылки и уведомляет форму об изменении поля. */
export function normalizeShikimoriProfilePaste(event: ClipboardEvent): void {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.hasAttribute('data-shikimori-profile')) return;
    const pasted = event.clipboardData?.getData('text/plain');
    if (!pasted?.includes('/')) return;

    let nickname: string;
    try { nickname = parseProfileInput(pasted); }
    catch { return; }

    event.preventDefault();
    input.value = nickname;
    input.dispatchEvent(new Event('input', { bubbles: true }));
}
