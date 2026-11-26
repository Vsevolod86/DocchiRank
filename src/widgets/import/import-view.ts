import type { BackupPreview } from '../../features/backup/collection-backups';
import { collectionSummary, importError, importFeedback } from '../../features/import-list/import-feedback';
import type { ImportMethod, ImportStatus } from '../../features/import-list/list-import';
import type { SelectionPersistence } from '../../features/selection/selection-persistence';
import { escapeHtml } from '../../shared/lib/escape-html';
import { renderButton } from '../../shared/ui/button';
import { renderCard } from '../../shared/ui/card';
import { renderInput } from '../../shared/ui/input';
import { renderSelect } from '../../shared/ui/select';
import { renderShikimoriProfileField } from '../shikimori/profile-field';

/** Поля формы импорта и сведения для восстановления последней коллекции. */
export type ImportViewOptions = Pick<ReturnType<SelectionPersistence['summary']>, 'collections' | 'resumeCollectionId'> & {
    importMode: ImportMethod;
    import: Readonly<ImportStatus>;
};

/** Показывает демонстрацию, формы импорта и продолжение работы с коллекцией. */
export function importView(state: ImportViewOptions, importIcon: string): string {
    const savedCollection = state.collections.find(item => item.id === state.resumeCollectionId);
    const canResume = !!savedCollection;
    const { loading, media, profileInput } = state.import;
    const method = state.importMode;
    const loadLabel = loading ? 'Загружаю…' : state.import.error && state.import.method === 'profile' ? 'Повторить загрузку' : 'Загрузить список';
    return `<section class="intro">
    <h1 tabindex="-1">Упорядочи тайтлы по своим предпочтениям</h1>
    <p class="lead">Сравнивай аниме, мангу или ранобэ попарно. DocchiRank соберёт из ответов твой личный рейтинг.<br class="desktop-break"> Тайтл выше в списке получит такую же оценку или выше, чем тайтл ниже.</p>
    <div class="import-grid">
      ${renderCard({
        className: 'import-card demo-panel', attributes: { 'aria-labelledby': 'demo-title' }, contentMarkup: `
        <span class="panel-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="m10 8 6 4-6 4Z"/></svg></span>
        <h2 id="demo-title" class="card-title">Демонстрация</h2>
        <p>Попробуй сравнение на девяти аниме из каталога Shikimori.</p>
        <div class="import-card-footer">
        <p class="small muted">Без подключения к аккаунту</p>
        ${renderButton({ label: 'Открыть демонстрацию', variant: 'primary', disabled: loading, attributes: { 'data-action': 'load-demo' } })}
        </div>
      ` })}
      ${renderCard({
            className: 'import-card source-panel', attributes: { 'aria-labelledby': 'source-title' }, contentMarkup: `
        <span class="panel-icon">${importIcon}</span>
        <h2 id="source-title" class="card-title">Список Shikimori</h2>
        <label for="import-method">Способ импорта</label>
        ${renderSelect({
                name: 'import-method', attributes: { id: 'import-method' }, value: method, appearance: 'outlined', disabled: loading, options: [
                    { value: 'profile', label: 'По нику' },
                    { value: 'file', label: 'Из JSON' },
                ]
            })}
        ${method === 'profile' ? `
        <form id="profile-form" aria-label="Импорт профиля">
        <label for="import-media">Какой список загрузить</label>
        ${renderSelect({
                name: 'import-media', attributes: { id: 'import-media' }, value: media, appearance: 'outlined', disabled: loading,
                options: Object.entries(LIST_MEDIA_LABELS).map(([value, label]) => ({ value, label })),
            })}
        ${renderShikimoriProfileField({ id: 'profile-input', value: profileInput, describedBy: 'import-note', disabled: loading })}
        <div class="import-card-footer">
        <p id="import-note" class="muted small">Для открытого списка достаточно ника или ссылки.</p>
        ${renderButton({ label: loadLabel, variant: 'primary', type: 'submit', disabled: loading })}
        </div>
        </form>` : `
        <form id="json-import-form" class="file-import" aria-label="Импорт JSON">
          <label for="json-input">JSON-выгрузка Shikimori</label>
          ${renderInput({
                type: 'file', name: 'json-file', appearance: 'outlined', accept: '.json,application/json', required: true, disabled: loading,
                attributes: { id: 'json-input', 'aria-describedby': 'json-note' },
            })}
          <div class="import-card-footer">
          <p id="json-note" class="small muted">Список закрыт? Скачай его в настройках Shikimori и загрузи сюда.</p>
          ${renderButton({ label: 'Импортировать JSON', variant: 'primary', type: 'submit', disabled: loading })}
          </div>
        </form>`}
      ` })}
      ${renderCard({
                className: canResume ? 'import-card resume-panel' : 'import-card resume-panel unavailable',
                attributes: { 'aria-labelledby': 'resume-title' },
                contentMarkup: `
        <span class="panel-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8a8.5 8.5 0 1 1 0 8M3 4v4h4M12 7v5l3 2"/></svg></span>
        <h2 id="resume-title" class="card-title">Продолжить</h2>
        <p>Вернуться к сохранённому набору и незавершённому сравнению.</p>
        <label class="backup-file-label" for="collection-backup">Или восстановить JSON-копию DocchiRank</label>
        ${renderInput({
                    type: 'file', name: 'collection-backup', appearance: 'compact', accept: '.json,application/json',
                    disabled: loading, attributes: { id: 'collection-backup' },
                })}
        <div class="import-card-footer">
        ${state.collections.length > 1 ? `<label class="small" for="resume-collection">Коллекция</label>${renderSelect({
                    name: 'resume-collection', attributes: { id: 'resume-collection' }, value: savedCollection?.id, disabled: loading,
                    options: state.collections.map(item => ({ value: item.id, label: `${item.name} · ${LIST_MEDIA_LABELS[item.media]}` })),
                })}` : ''}
        <p class="small muted">${savedCollection ? `${escapeHtml(savedCollection.nickname)} · ${LIST_MEDIA_LABELS[savedCollection.media]}<br>Выбрано тайтлов: ${savedCollection.selectedCount}` : 'Нет сохранения.'}</p>
        ${renderButton({ label: 'Продолжить', variant: 'primary', disabled: loading || !canResume, attributes: { 'data-action': 'resume-selection' } })}
        </div>
      ` })}
    </div>
    ${importFeedback(state.import)}
    <div id="backup-feedback"></div>
  </section>`;
}

/** Показывает загрузку списка на этапе набора до появления готовой коллекции. */
export function pendingSelectionView(status: Readonly<ImportStatus>): string {
    return `<section aria-labelledby="pending-selection-heading">
      ${collectionSummary(status.profileInput, status)}
      ${importError(status)}
      <h1 id="pending-selection-heading" tabindex="-1">Готовим список ${status.method === 'profile' && status.media === 'manga' ? 'манги и ранобэ' : 'аниме'}</h1>
      <p class="lead">После загрузки списка можно будет выбрать тайтлы для сравнения.</p>
      ${status.loading ? '' : `<div class="selection-controls">
        ${renderButton({ label: 'Повторить загрузку', variant: 'primary', attributes: { 'data-action': 'retry-list-import' } })}
        ${renderButton({ label: 'К импорту', variant: 'secondary', attributes: { 'data-screen': 'import' } })}
      </div>`}
    </section>`;
}

/** Предлагает явный способ восстановления проверенной резервной копии. */
export function backupFeedback(backup: Readonly<BackupPreview>, collections: ImportViewOptions['collections']): string {
    const pending = backup.pending;
    return `${backup.error ? `<p class="import-error" role="alert">${escapeHtml(backup.error)}</p>` : ''}${backup.message ? `<p class="import-status" role="status">${escapeHtml(backup.message)}</p>` : ''}
    ${pending ? renderCard({
        className: 'backup-preview', attributes: { 'aria-labelledby': 'backup-heading' }, contentMarkup: `
      <h2 id="backup-heading" class="card-title">Резервная копия: ${escapeHtml(pending.name)}</h2>
      <p>В списке: ${pending.entries.length}. Выбрано: ${pending.selectedIds.length}. Размещено: ${pending.orderedIds.length}.</p>
      <div class="comparison-actions">
        ${renderButton({ label: 'Создать отдельную коллекцию', variant: 'primary', attributes: { 'data-action': 'import-backup-copy' } })}
        ${collections.some(item => item.id === pending.id) ? renderButton({
            label: 'Заменить сохранённую', variant: 'secondary', attributes: { 'data-action': 'import-backup-replace' },
        }) : ''}
        ${renderButton({ label: 'Отмена', variant: 'secondary', attributes: { 'data-action': 'cancel-backup' } })}
      </div>` }) : ''}`;
}
import { LIST_MEDIA_LABELS } from '../../entities/collection/model';
