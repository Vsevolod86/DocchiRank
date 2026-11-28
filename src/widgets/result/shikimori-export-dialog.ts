import { INTERFACE_TIMING } from '../../config/interface';
import type { Collection, Score } from '../../entities/collection/model';
import { listMedia } from '../../entities/collection/model';
import type { ListMetadataSource } from '../../integrations/list-source';
import { parseProfileInput, SHIKIMORI_ORIGIN } from '../../integrations/shikimori-data';
import { updateShikimoriExport } from '../../integrations/shikimori-json';
import { downloadJson } from '../../shared/lib/download-json';
import { renderButton } from '../../shared/ui/button';
import { renderInput } from '../../shared/ui/input';
import { normalizeShikimoriProfilePaste, renderShikimoriProfileField } from '../shikimori/profile-field';

const downloadNoticeKey = 'docchirank.shikimori-download-notice-seen';
let noticeShownWithoutStorage = false;

/** Подготавливает обновлённую выгрузку и ссылки для проверенного профиля. */
export function openShikimoriExportDialog(collection: Collection, grades: ReadonlyMap<string, Score>,
    source: Pick<ListMetadataSource, 'lookupProfile'>): void {
    const dialog = document.createElement('dialog');
    dialog.className = 'shikimori-export-dialog';
    dialog.setAttribute('aria-labelledby', 'shikimori-export-heading');
    const profile = collection.profile;
    const media = listMedia(collection);
    const list = media === 'manga' ? 'манги и ранобэ' : 'аниме';
    const progress = media === 'manga' ? 'глав и томов' : 'просмотренных серий';
    const suggestedNickname = profile.source === 'shikimori' || profile.source === 'shikimori-json' ? profile.nickname : '';
    dialog.innerHTML = `<header class="shikimori-export-header">
      <h2 id="shikimori-export-heading">Скачать оценки в Shikimori</h2>
      <p class="small muted">Четыре простых шага для синхронизации оценок:</p>
    </header>
    <ol class="small shikimori-export-steps">
      <li aria-current="step">
        <p><strong class="shikimori-export-step-title">Исходный список.</strong> Укажи ник или ссылку на профиль и скачай json-список из Shikimori.</p>
        <form id="shikimori-export-profile-form">
          <div class="shikimori-export-profile-field">
            ${renderShikimoriProfileField({ id: 'shikimori-export-nickname', value: suggestedNickname, describedBy: 'shikimori-export-profile-status' })}
            ${renderButton({ label: 'Проверить', variant: 'secondary', type: 'submit' })}
          </div>
          <p id="shikimori-export-profile-status" role="status" hidden></p>
          <a class="shikimori-export-link" id="shikimori-export-source" target="_blank" rel="noopener noreferrer" hidden>Открыть экспорт на Shikimori</a>
        </form>
      </li>
      <li>
        <p><strong class="shikimori-export-step-title">Выбор файла.</strong> Загрузи список, скачанный из Shikimori.</p>
        <form id="shikimori-export-file-form">
          <label for="shikimori-export-input">Исходная выгрузка ${list}</label>
          ${renderInput({
        type: 'file', accept: '.json,application/json', appearance: 'outlined', required: true,
        attributes: { id: 'shikimori-export-input' },
    })}
          <p class="shikimori-export-note muted">Сохрани исходный список, чтобы при необходимости восстановить прежние оценки.</p>
          <div class="shikimori-export-warning" role="status" hidden>
            <p>В исходном файле нет этих тайтлов. В обновлённый файл они попадут со статусом «Запланировано» и нулём ${progress}.</p>
            <ul></ul>
          </div>
          <p id="shikimori-export-file-status" role="status" hidden></p>
        </form>
      </li>
      <li>
        <div class="shikimori-export-download">
          <div class="shikimori-export-download-copy">
            <p><strong class="shikimori-export-step-title">Скачать обновлённые оценки.</strong></p>
            <p class="shikimori-export-note muted">DocchiRank обрабатывает файл локально, в твоём браузере.</p>
          </div>
          ${renderButton({
        label: 'Скачать JSON', variant: 'primary', type: 'submit', disabled: true,
        form: 'shikimori-export-file-form',
    })}
        </div>
        <p id="shikimori-export-download-status" role="status" hidden></p>
      </li>
      <li>
        <p><strong class="shikimori-export-step-title">Импорт.</strong> Загрузи обновлённый файл в Shikimori по ссылке, которая появится после скачивания.</p>
        <a class="shikimori-export-link" id="shikimori-export-import" target="_blank" rel="noopener noreferrer" hidden>Открыть импорт на Shikimori</a>
      </li>
    </ol>
    <footer class="shikimori-export-footer">
      ${renderButton({ label: 'Закрыть', variant: 'secondary', attributes: { 'data-close-export': '' } })}
    </footer>
    <div class="shikimori-download-overlay" hidden>
      <p class="shikimori-download-notice" role="status">Тут могла быть пятиминутная реклама глупой игры. Пять минут твои. Цени.</p>
    </div>`;

    const steps = dialog.querySelectorAll('.shikimori-export-steps > li');
    const profileForm = dialog.querySelector<HTMLFormElement>('#shikimori-export-profile-form')!;
    const nickname = profileForm.querySelector('input')!;
    const verify = profileForm.querySelector('button')!;
    const profileStatus = dialog.querySelector<HTMLElement>('#shikimori-export-profile-status')!;
    const exportLink = dialog.querySelector<HTMLAnchorElement>('#shikimori-export-source')!;
    const importLink = dialog.querySelector<HTMLAnchorElement>('#shikimori-export-import')!;
    const fileForm = dialog.querySelector<HTMLFormElement>('#shikimori-export-file-form')!;
    const input = fileForm.querySelector('input')!;
    const submit = dialog.querySelector<HTMLButtonElement>('button[form="shikimori-export-file-form"]')!;
    const fileStatus = dialog.querySelector<HTMLElement>('#shikimori-export-file-status')!;
    const downloadStatus = dialog.querySelector<HTMLElement>('#shikimori-export-download-status')!;
    const downloadOverlay = dialog.querySelector<HTMLElement>('.shikimori-download-overlay')!;
    const warning = dialog.querySelector<HTMLElement>('.shikimori-export-warning')!;
    const missingTitles = warning.querySelector('ul')!;
    let checking: AbortController | null = null;
    let prepared: { file: File; result: ReturnType<typeof updateShikimoriExport> } | null = null;
    let downloadStarted = false;
    let downloadTimer: ReturnType<typeof setTimeout> | null = null;

    /** Отмечает выполненные действия и выделяет первый незавершённый шаг. */
    function updateSteps(): void {
        const completed = [!exportLink.hidden, prepared !== null, downloadStarted, false];
        const current = completed.indexOf(false);
        importLink.hidden = exportLink.hidden || !downloadStarted;
        steps.forEach((step, index) => {
            step.toggleAttribute('data-complete', completed[index] === true);
            if (index === current) step.setAttribute('aria-current', 'step');
            else step.removeAttribute('aria-current');
        });
    }

    /** Создаёт ссылки по каноническому нику из API и показывает импорт после скачивания. */
    async function verifyNickname(): Promise<void> {
        if (checking || !nickname.value.trim()) return;
        const controller = new AbortController();
        checking = controller;
        verify.disabled = true;
        nickname.removeAttribute('aria-invalid');
        showStatus(profileStatus, 'Проверяю профиль…');
        try {
            const profileNickname = parseProfileInput(nickname.value);
            nickname.value = profileNickname;
            const account = await source.lookupProfile(profileNickname, { signal: controller.signal });
            if (controller.signal.aborted || !dialog.open) return;
            nickname.value = account.nickname;
            const profileUrl = `${SHIKIMORI_ORIGIN}/${encodeURIComponent(account.nickname)}`;
            exportLink.href = `${profileUrl}/list_export`;
            importLink.href = `${profileUrl}/list_imports/new`;
            exportLink.hidden = false;
            profileStatus.hidden = true;
            updateSteps();
        } catch (error) {
            if (controller.signal.aborted || !dialog.open) return;
            nickname.setAttribute('aria-invalid', 'true');
            showStatus(profileStatus, error instanceof Error ? error.message : 'Не удалось проверить профиль Shikimori.', true);
        } finally {
            if (checking === controller) {
                checking = null;
                verify.disabled = !exportLink.hidden;
            }
        }
    }

    /** Готовит файл сразу после выбора и показывает список добавляемых тайтлов. */
    async function prepareFile(): Promise<void> {
        clearPendingDownload();
        prepared = null;
        downloadStarted = false;
        submit.disabled = warning.hidden = fileStatus.hidden = downloadStatus.hidden = true;
        missingTitles.replaceChildren();
        updateSteps();
        const file = input.files?.[0];
        if (!file) return;
        try {
            const contents = await file.text();
            if (!dialog.open || input.files?.[0] !== file) return;
            const result = updateShikimoriExport(contents, grades, collection.animes, media);
            prepared = { file, result };
            for (const row of result.added) {
                const item = document.createElement('li');
                item.textContent = row.target_title_ru || row.target_title;
                missingTitles.append(item);
            }
            warning.hidden = !result.added.length;
            submit.disabled = false;
            updateSteps();
        } catch (error) {
            if (dialog.open && input.files?.[0] === file) {
                showStatus(fileStatus, error instanceof Error ? error.message : 'Не удалось подготовить выгрузку.', true);
            }
        }
    }

    /** Запускает скачивание, если в открытом окне всё ещё выбран подготовленный файл. */
    function downloadPreparedFile(pending: NonNullable<typeof prepared>): void {
        if (!dialog.open || prepared !== pending || input.files?.[0] !== pending.file) return;
        submit.disabled = false;
        const { file, result } = pending;
        try {
            downloadJson(`${file.name.replace(/\.json$/i, '')}-docchirank.json`, result.text);
            downloadStarted = true;
            updateSteps();
            showStatus(downloadStatus, `Изменено оценок: ${result.updated}. Добавлено тайтлов: ${result.added.length}.`);
        } catch {
            showStatus(downloadStatus, 'Не удалось начать скачивание. Попробуй ещё раз.', true);
        }
    }

    /** Убирает плашку и отменяет ожидающее скачивание при смене файла или закрытии окна. */
    function clearPendingDownload(): void {
        if (downloadTimer !== null) clearTimeout(downloadTimer);
        downloadTimer = null;
        downloadOverlay.hidden = true;
    }

    profileForm.addEventListener('paste', normalizeShikimoriProfilePaste);
    profileForm.addEventListener('submit', event => { event.preventDefault(); void verifyNickname(); });
    nickname.addEventListener('input', () => {
        checking?.abort();
        checking = null;
        verify.disabled = false;
        nickname.removeAttribute('aria-invalid');
        profileStatus.hidden = exportLink.hidden = true;
        exportLink.removeAttribute('href');
        importLink.removeAttribute('href');
        updateSteps();
    });
    dialog.querySelector('[data-close-export]')!.addEventListener('click', () => dialog.close());
    input.addEventListener('change', () => { void prepareFile(); });
    fileForm.addEventListener('submit', event => {
        event.preventDefault();
        if (!dialog.open || downloadTimer !== null || !prepared || input.files?.[0] !== prepared.file) return;
        const pending = prepared;
        if (!shouldShowDownloadNotice()) {
            downloadPreparedFile(pending);
            return;
        }
        submit.disabled = true;
        downloadOverlay.hidden = false;
        downloadTimer = setTimeout(() => {
            clearPendingDownload();
            downloadPreparedFile(pending);
        }, INTERFACE_TIMING.downloadNoticeMs);
    });
    dialog.addEventListener('close', () => {
        clearPendingDownload();
        checking?.abort();
        dialog.remove();
    }, { once: true });
    document.body.append(dialog);
    dialog.showModal();
    void verifyNickname();
}

/** Показывает уведомление при первом скачивании, затем применяет вероятность повторного показа. */
function shouldShowDownloadNotice(): boolean {
    if (noticeShownWithoutStorage) return Math.random() < INTERFACE_TIMING.downloadNoticeRepeatChance;
    try {
        const storage = window.localStorage;
        if (storage.getItem(downloadNoticeKey) === '1') return Math.random() < INTERFACE_TIMING.downloadNoticeRepeatChance;
        storage.setItem(downloadNoticeKey, '1');
    } catch {
        noticeShownWithoutStorage = true;
    }
    return true;
}

/** Показывает сообщение о проверке или подготовке JSON. */
function showStatus(element: HTMLElement, message: string, error = false): void {
    element.classList.toggle('import-error', error);
    element.hidden = false;
    element.textContent = message;
}
