import { escapeHtml } from '../../shared/lib/escape-html';
import { renderButton } from '../../shared/ui/button';
import type { ImportStatus } from './list-import';

/** Показывает прогресс и сообщения на экране импорта. */
export function importFeedback(status: Readonly<ImportStatus>): string {
    return `<div id="import-feedback" aria-busy="${status.loading}">
    ${importStatus(status.message)}
    ${status.method === 'profile' && status.error?.code === 'not-found' ? '' : importError(status)}
  </div>`;
}

/** Группирует имя и статус в одну строку рядом с кнопками набора. */
export function collectionSummary(owner: string, status: Readonly<ImportStatus>, fallback = '', action = ''): string {
    const name = escapeHtml(owner);
    return `<div class="collection-summary" aria-label="Данные набора" aria-busy="${status.loading}">
      <div class="collection-summary-text">
        <strong class="collection-owner" title="${name}">${name}</strong>
        ${importStatus(status.message || fallback)}
      </div>
      ${cancelImportButton(status)}
      ${action}
    </div>`;
}

/** Показывает ошибку полностью, отдельно от однострочного статуса шапки. */
export function importError(status: Readonly<ImportStatus>): string {
    const message = status.error?.message;
    return message ? `<p class="import-error small" role="alert">${escapeHtml(message)}</p>` : '';
}

/** Оставляет один обновляемый статус для обоих вариантов импорта. */
function importStatus(message: string): string {
    const text = escapeHtml(message);
    return `<p id="import-status" class="import-status small" role="status" title="${text}" ${message ? '' : 'hidden'}>${text}</p>`;
}

/** Показывает иконку отмены на этапе набора во время прерываемой загрузки. */
function cancelImportButton(status: Readonly<ImportStatus>): string {
    if (!status.loading || !status.cancellable) return '';
    return renderButton({
        label: 'Отменить загрузку', variant: 'icon',
        attributes: { 'data-action': 'cancel-import', title: 'Отменить загрузку' },
        iconPaths: '<path d="m6 6 12 12M6 18 18 6"/>',
    });
}
