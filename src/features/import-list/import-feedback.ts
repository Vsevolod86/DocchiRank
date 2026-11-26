import { escapeHtml } from '../../shared/lib/escape-html';
import { renderButton } from '../../shared/ui/button';
import type { ImportStatus } from './list-import';

/** Показывает прогресс, ошибку и доступную отмену текущего импорта. */
export function importFeedback(status: Readonly<ImportStatus>): string {
    return `<div id="import-feedback" aria-busy="${status.loading}">
    ${importStatus(status.message)}
    ${importError(status)}
    ${cancelImportButton(status, false)}
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
      ${cancelImportButton(status, true)}
      ${action}
    </div>`;
}

/** Показывает ошибку полностью, отдельно от однострочного статуса шапки. */
export function importError(status: Readonly<ImportStatus>): string {
    return status.error ? `<p class="import-error small" role="alert">${escapeHtml(status.error)}</p>` : '';
}

/** Оставляет один обновляемый статус для обоих вариантов импорта. */
function importStatus(message: string): string {
    const text = escapeHtml(message);
    return `<p id="import-status" class="import-status small" role="status" title="${text}" ${message ? '' : 'hidden'}>${text}</p>`;
}

/** Показывает отмену только во время операции, которую можно прервать. */
function cancelImportButton(status: Readonly<ImportStatus>, compact: boolean): string {
    if (!status.loading || !status.cancellable) return '';
    return renderButton({
        label: 'Отменить загрузку', attributes: { 'data-action': 'cancel-import', title: compact ? 'Отменить загрузку' : undefined },
        ...(compact ? { variant: 'icon', iconPaths: '<path d="m6 6 12 12M6 18 18 6"/>' } : { variant: 'text' }),
    });
}
