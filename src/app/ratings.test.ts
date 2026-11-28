// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { LIST_FIXTURE } from './list-fixture';
import { createCollection } from '../entities/collection/collection';
import type { Collection } from '../entities/collection/model';
import { ratingAssignments, scaleToCutoffs } from '../entities/collection/ratings';
import type { ListMetadataSource } from '../integrations/list-source';
import { demoSource } from '../integrations/demo';
import { ImportError } from '../integrations/shikimori-data';
import { PairwiseSorterEngine } from '../entities/sorting/engine';
import { BrowserCollectionStore } from '../storage/collection-store';
import { BrowserSelectionStore } from '../storage/selection-store';
import { parseCollectionBackup, serializeCollectionBackup } from '../storage/collection-backup';
import { mountApp } from './mount-app';

let root: HTMLElement;
let store: BrowserCollectionStore;
let database: IDBFactory;
let persisted: Promise<unknown> | undefined;
let storage: Pick<Storage, 'getItem' | 'setItem'>;
let ids: string[];
let groups: string[][];

const lookupProfile = vi.fn<ListMetadataSource['lookupProfile']>();

beforeEach(async () => {
  const values = new Map<string, string>();
  storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } };
  database = new IDBFactory();
  persisted = undefined;
  store = await BrowserCollectionStore.open(database);
  const snapshot = structuredClone(LIST_FIXTURE);
  snapshot.profile = { id: '42', nickname: 'ratings-user', source: 'shikimori', url: 'https://shikimori.io/ratings-user' };
  lookupProfile.mockReset().mockResolvedValue({ ...snapshot.profile, nickname: 'Ratings.User' });
  snapshot.animes = snapshot.animes.map(anime => ({ ...anime, coverUrl: null, kind: 'tv' }));
  ids = snapshot.entries.slice(0, 4).map(entry => entry.animeId);
  groups = [[ids[0]!], [ids[1]!, ids[2]!], [ids[3]!]];
  const collection = createCollection(snapshot, ids, 'ratings');
  setOrder(collection, groups);
  expect(await store.set(collection)).toBe('saved');
  await startApp();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('границы оценок результата', () => {
  it('показывает добавляемые тайтлы, уведомляет перед скачиванием и открывает ссылку на импорт', async () => {
    localStorage.removeItem('docchirank.shikimori-download-notice-seen');
    const download = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:shikimori-export');
    const row = { target_id: Number(ids[0]), target_type: 'Anime', target_title: 'Аниме', score: 0,
      status: 'completed', rewatches: 2, episodes: 12, text: 'Заметка' };
    button('[data-action="export-shikimori-json"]').click();
    const dialog = document.querySelector<HTMLDialogElement>('.shikimori-export-dialog')!;
    const form = dialog.querySelector<HTMLFormElement>('#shikimori-export-file-form')!;
    const downloadButton = dialog.querySelector<HTMLButtonElement>('button[form="shikimori-export-file-form"]')!;
    const notice = dialog.querySelector<HTMLElement>('.shikimori-download-overlay')!;
    const exportLink = dialog.querySelector<HTMLAnchorElement>('#shikimori-export-source')!;
    const importLink = dialog.querySelector<HTMLAnchorElement>('#shikimori-export-import')!;
    const steps = dialog.querySelectorAll('.shikimori-export-steps > li');
    expect(dialog.querySelector('[aria-current="step"]')).toBe(steps[0]);
    await vi.waitFor(() => expect(exportLink.hidden).toBe(false));
    expect(exportLink.href).toBe('https://shikimori.io/Ratings.User/list_export');
    expect(lookupProfile).toHaveBeenCalledWith('ratings-user', { signal: expect.any(AbortSignal) });
    expect(importLink.hidden).toBe(true);
    expect(dialog.querySelector('[aria-current="step"]')).toBe(steps[1]);
    expect(Array.from(dialog.querySelectorAll('[data-complete]'))).toEqual([steps[0]]);
    expect(steps[0]!.contains(exportLink)).toBe(true);
    expect(steps[1]!.contains(form)).toBe(true);
    expect(steps[2]!.contains(downloadButton)).toBe(true);
    expect(steps[3]!.contains(importLink)).toBe(true);
    expect(downloadButton.disabled).toBe(true);

    const files = new DataTransfer();
    files.items.add(new File([JSON.stringify([row])], 'ratings-user_animes.json'));
    const input = form.querySelector('input')!;
    input.files = files.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    const warning = form.querySelector<HTMLElement>('.shikimori-export-warning')!;
    await vi.waitFor(() => expect(warning.hidden).toBe(false));
    expect(dialog.querySelector('[aria-current="step"]')).toBe(steps[2]);
    expect(Array.from(dialog.querySelectorAll('[data-complete]'))).toEqual([steps[0], steps[1]]);
    expect(Array.from(warning.querySelectorAll('li'), item => item.textContent)).toEqual(['Ковбой Бибоп', 'Унесённые призраками', 'Врата Штейна']);
    expect(download).not.toHaveBeenCalled();
    expect(importLink.hidden).toBe(true);
    expect(notice.hidden).toBe(true);
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.2);
    vi.useFakeTimers();
    downloadButton.click();
    form.requestSubmit();
    expect(notice.hidden).toBe(false);
    expect(downloadButton.disabled).toBe(true);
    expect(download).not.toHaveBeenCalled();
    expect(importLink.hidden).toBe(true);

    await vi.advanceTimersByTimeAsync(4_999);
    expect(notice.hidden).toBe(false);
    expect(download).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(download).toHaveBeenCalledOnce();
    expect(notice.hidden).toBe(true);
    expect((download.mock.contexts[0] as HTMLAnchorElement).download).toBe('ratings-user_animes-docchirank.json');
    const [blob] = createUrl.mock.calls[0]!;
    expect(blob).toBeInstanceOf(Blob);
    const [existing, ...added] = JSON.parse(await (blob as Blob).text());
    expect(existing).toEqual({ ...row, score: grades()[ids[0]!] });
    expect(added).toHaveLength(3);
    expect(added[0]).toEqual({ target_id: 1, target_type: 'Anime', target_title: 'Cowboy Bebop', target_title_ru: 'Ковбой Бибоп',
      score: grades()['1'], status: 'planned', episodes: 0, rewatches: 0, text: null });
    expect(importLink.hidden).toBe(false);
    expect(importLink.href).toBe('https://shikimori.io/Ratings.User/list_imports/new');
    expect(Array.from(dialog.querySelectorAll('[aria-current="step"]'))).toEqual([steps[3]]);
    expect(Array.from(dialog.querySelectorAll('[data-complete]'))).toEqual([steps[0], steps[1], steps[2]]);
    expect(localStorage.getItem('docchirank.shikimori-download-notice-seen')).toBe('1');

    downloadButton.click();
    expect(notice.hidden).toBe(true);
    expect(download).toHaveBeenCalledTimes(2);

    const nickname = dialog.querySelector<HTMLInputElement>('#shikimori-export-nickname')!;
    nickname.value = '';
    nickname.dispatchEvent(new Event('input', { bubbles: true }));
    expect(dialog.querySelector('[aria-current="step"]')).toBe(steps[0]);
    expect(Array.from(dialog.querySelectorAll('[data-complete]'))).toEqual([steps[1], steps[2]]);
    expect(importLink.hidden).toBe(true);

    random.mockReturnValue(0.199);
    downloadButton.click();
    expect(notice.hidden).toBe(false);
    dialog.querySelector<HTMLButtonElement>('[data-close-export]')!.click();
    await vi.runOnlyPendingTimersAsync();
    expect(download).toHaveBeenCalledTimes(2);
  });

  it('скрывает ссылки при смене ника и не создаёт их для отсутствующего профиля', async () => {
    button('[data-action="export-shikimori-json"]').click();
    const form = document.querySelector<HTMLFormElement>('#shikimori-export-profile-form')!;
    const link = form.querySelector('a')!;
    const input = form.querySelector('input')!;
    await vi.waitFor(() => expect(link.hidden).toBe(false));
    const steps = form.closest('ol')!;
    expect(steps.querySelector('[aria-current="step"]')).toBe(steps.children[1]);

    lookupProfile.mockRejectedValueOnce(new ImportError('not-found', 'Профиль не найден.'));
    const clipboard = new DataTransfer();
    clipboard.setData('text/plain', 'https://shikimori.io/missing/');
    input.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: clipboard }));
    expect(input.value).toBe('missing');
    expect(link.hidden).toBe(true);
    expect(steps.querySelector('[aria-current="step"]')).toBe(steps.children[0]);
    form.requestSubmit();
    await vi.waitFor(() => expect(form.querySelector('[role="status"]')?.textContent).toBe('Профиль не найден.'));
    expect(lookupProfile).toHaveBeenLastCalledWith('missing', { signal: expect.any(AbortSignal) });
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(link.hasAttribute('href')).toBe(false);
  });

  it('начинает с колокола вокруг 6 и сохраняет ручные оценки при повторном открытии', async () => {
    const original = store.get('ratings')!;
    expect(Object.keys(grades())).toHaveLength(4);
    expect(root.querySelector('main .rating-editor')).toBeNull();
    expect(root.querySelector('.filter-panel .rating-editor')).not.toBeNull();
    expect(root.querySelector('[name="rating-position-range"], .rating-gap')).toBeNull();
    const method = root.querySelector<HTMLSelectElement>('[name="rating-method"]')!;
    expect(Array.from(method.options, option => option.value)).toEqual(['manual', 'uniform', 'bell']);
    expect(method.value).toBe('bell');
    expect(root.querySelector<HTMLSelectElement>('[name="rating-center"]')!.value).toBe('6');
    const writes = vi.mocked(store.set).mock.calls.length;
    expect(writes).toBe(1);
    button('[data-panel-group="distribution"]').click();
    button('[data-panel-group="distribution"]').click();
    expect(vi.mocked(store.set).mock.calls).toHaveLength(writes);
    expect(Array.from(root.querySelectorAll('.filter-panel h2'), item => item.textContent!.trim()))
      .toEqual(['Распределение оценок', 'Настройки', 'История сравнений']);
    expect(root.querySelector<HTMLElement>('#panel-display-options')!.hidden).toBe(true);
    expect(root.querySelector<HTMLElement>('#panel-history-options')!.hidden).toBe(true);
    expect(root.querySelector('.result-table thead')!.querySelectorAll('th')).toHaveLength(7);
    expect(root.querySelectorAll('[name="rating-score"]:disabled')).toHaveLength(0);

    change('rating-method', 'bell');
    change('rating-center', '10');
    changeScore(ids[1]!, 8);
    expect(root.querySelector<HTMLSelectElement>('[name="rating-method"]')!.value).toBe('manual');
    changeScore(ids[3]!, 7);
    changeScore(ids[0]!, 9);
    expect(grades()).toEqual({ [ids[0]!]: 9, [ids[1]!]: 8, [ids[2]!]: 8, [ids[3]!]: 7 });
    expect(Array.from(root.querySelectorAll('[data-result-score]'), item => item.getAttribute('data-result-score'))).toEqual(['9', '8', '7']);
    expect(root.querySelectorAll('[data-result-score="8"] tbody tr')).toHaveLength(2);
    expect(Array.from(root.querySelectorAll('[data-ordered-id]'), row => row.getAttribute('data-ordered-id'))).toEqual(ids);
    expect(store.get('ratings')!.session).toEqual(original.session);
    expect(store.get('ratings')!.entries).toEqual(original.entries);
    const backup = parseCollectionBackup(serializeCollectionBackup(store.get('ratings')!));
    expect(backup.ratings).toEqual(store.get('ratings')!.ratings);
    await startApp();
    expect(vi.mocked(store.set)).not.toHaveBeenCalled();
    expect(root.querySelectorAll('.result-table tbody tr')).toHaveLength(4);
    expect(grades()[ids[3]!]).toBe(7);
  });

  it('сворачивает распределение, сохраняя способ и оценки при переходах между вкладками', () => {
    change('rating-method', 'uniform');
    const before = store.get('ratings')!.ratings;
    button('[data-panel-group="distribution"]').click();
    expect(root.querySelector<HTMLElement>('#panel-distribution-options')!.hidden).toBe(true);
    button('[data-screen="selection"]').click();
    button('[data-screen="result"]').click();
    expect(root.querySelector<HTMLElement>('#panel-distribution-options')!.hidden).toBe(true);
    expect(store.get('ratings')!.ratings).toEqual(before);
    button('[data-panel-group="distribution"]').click();
    expect(root.querySelector<HTMLElement>('#panel-distribution-options')!.hidden).toBe(false);
    expect(root.querySelector<HTMLSelectElement>('[name="rating-method"]')!.value).toBe('uniform');
  });

  it('показывает отсутствие опор над таблицей и после сброса принимает оценку из строки', async () => {
    await persisted;
    const collection = store.get('ratings')!;
    collection.ratingTransition = { scores: grades(), changedIds: [...ids] };
    expect(await store.set(collection)).toBe('saved');
    await startApp();

    const reset = button('#result-table-section [data-action="reset-ratings"]');
    const warning = reset.closest('.rating-conflict');
    expect(warning?.querySelector('[role="alert"]')?.textContent).toBe('Список изменился, и оценки нужно выставить заново.');
    expect(warning?.nextElementSibling?.classList.contains('ordered-result')).toBe(true);
    expect(reset.disabled).toBe(false);
    expect(root.querySelector('.filter-panel [data-action="reset-ratings"]')).toBeNull();
    reset.click();
    expect(Array.from(root.querySelectorAll<HTMLSelectElement>('[name="rating-score"]'), field => field.disabled)).toEqual([false, false, false, false]);
    expect(document.activeElement?.getAttribute('name')).toBe('rating-score');
    expect(root.querySelector('[name="rating-single"]')).toBeNull();

    await startApp();
    expect(root.querySelector<HTMLSelectElement>('[name="rating-method"]')!.value).toBe('manual');
    expect(grades()).toEqual({});
    changeScore(ids[1]!, 8);
    changeScore(ids[3]!, 6);
    expect(grades()).toEqual({ [ids[0]!]: 8, [ids[1]!]: 8, [ids[2]!]: 8, [ids[3]!]: 6 });
    expect(store.get('ratings')!.orderedIds).toEqual(ids);
    expect(store.get('ratings')!.ratingTransition).toBeUndefined();
  });

  it('меняет целый класс и необходимые соседние интервалы, объединяя одинаковые оценки в таблицу', () => {
    rateAll(7);
    changeScore(ids[1]!, 9);
    expect(grades()).toEqual({ [ids[0]!]: 9, [ids[1]!]: 9, [ids[2]!]: 9, [ids[3]!]: 7 });
    expect(root.querySelectorAll('[data-result-score="9"] tbody tr')).toHaveLength(3);
    changeScore(ids[2]!, 2);
    expect(grades()).toEqual({ [ids[0]!]: 9, [ids[1]!]: 2, [ids[2]!]: 2, [ids[3]!]: 2 });
    changeScore(ids[0]!, 1);
    expect(Object.values(grades())).toEqual([1, 1, 1, 1]);
    expect(root.querySelectorAll('.result-table')).toHaveLength(1);
    expect(root.querySelectorAll('.result-table tbody tr')).toHaveLength(4);
    expect(Array.from(root.querySelectorAll<HTMLTableCellElement>('.result-rank'), cell => [cell.textContent, cell.rowSpan]))
      .toEqual([['1', 1], ['2', 2], ['3', 1]]);
    expect(Array.from(root.querySelectorAll<HTMLSelectElement>('[name="rating-score"]')[0]!.options, option => option.value))
      .toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
    expect(root.querySelector('[data-distribution-score="1"]')!.getAttribute('title')).toBe('1 / 10: 4 тайтлов');
    expect(root.querySelector('[data-distribution-score="1"] .rating-bar')!.getAttribute('style')).toBe('height:100%');
  });

  it('применяет настройки колонок, сохраняя прокрутку таблицы и диаграмму', () => {
    const previousTable = root.querySelector<HTMLElement>('.result-table-wrap')!;
    const chart = root.querySelector('.rating-distribution')!;
    previousTable.scrollLeft = 96;
    button('[data-panel-group="settings"]').click();
    root.querySelector<HTMLInputElement>('[name="display-field"][value="userScore"]')!.click();
    root.querySelector<HTMLInputElement>('[name="display-field"][value="communityScore"]')!.click();
    root.querySelector<HTMLInputElement>('[name="display-field"][value="russianTitle"]')!.click();
    root.querySelector<HTMLInputElement>('[name="display-field"][value="shikimoriLink"]')!.click();
    expect(root.querySelector('.result-table thead')!.querySelectorAll('th')).toHaveLength(5);
    expect(root.querySelector('[data-card-field="russianTitle"], [data-card-field="userScore"], [data-card-field="communityScore"]')).toBeNull();
    expect(root.querySelectorAll('[data-card-field="originalTitle"]')).toHaveLength(4);
    expect(root.querySelector('.result-names a')).toBeNull();
    const updatedTable = root.querySelector<HTMLElement>('.result-table-wrap')!;
    expect(updatedTable).not.toBe(previousTable);
    expect(updatedTable.scrollLeft).toBe(96);
    expect(root.querySelector('.rating-distribution')).toBe(chart);
    root.querySelector<HTMLInputElement>('[name="display-field"][value="shikimoriLink"]')!.click();
    expect(root.querySelectorAll('.highlight-result-links .result-names a')).toHaveLength(4);
  });

  it('показывает оригинальное название один раз, если русского перевода нет', async () => {
    const collection = store.get('ratings')!;
    const anime = collection.animes.find(item => item.id === ids[0])!;
    anime.russian = null;
    expect(await store.set(collection)).toBe('saved');
    await startApp();
    const row = root.querySelector('[data-ordered-id="' + ids[0] + '"]')!;
    expect(row.querySelector('[data-card-field="russianTitle"]')).toBeNull();
    expect(row.querySelectorAll('[data-card-field="originalTitle"]')).toHaveLength(1);
    expect(row.querySelector('[data-card-field="originalTitle"]')!.textContent).toBe(anime.name);
  });

  it('применяет пресеты только по выбору способа и не делит ничью', () => {
    const before = store.get('ratings')!.ratings;
    change('rating-method', 'manual');
    expect(store.get('ratings')!.ratings).toEqual(before);
    for (const preset of ['uniform', 'bell']) {
      change('rating-method', preset);
      const collection = store.get('ratings')!;
      expect(Object.keys(grades())).toHaveLength(4);
      expect(grades()[ids[1]!]).toBe(grades()[ids[2]!]);
      expect(Object.values(scaleToCutoffs(groups, collection.ratings)!)).not.toContain(2);
    }
  });

  it('меняет центр колокола, а переключение на ручной режим сохраняет оценки', () => {
    expect(root.querySelector<HTMLSelectElement>('[name="rating-center"]')!.value).toBe('6');
    change('rating-method', 'bell');
    change('rating-center', '3');
    const lower = Object.values(grades()).reduce((sum, score) => sum + score, 0);
    change('rating-center', '8');
    expect(Object.values(grades()).reduce((sum, score) => sum + score, 0)).toBeGreaterThan(lower);
    expect(grades()[ids[1]!]).toBe(grades()[ids[2]!]);
    change('rating-method', 'uniform');
    const uniform = store.get('ratings')!.ratings;
    change('rating-method', 'manual');
    expect(store.get('ratings')!.ratings).toEqual(uniform);
    expect(root.querySelector('[name="rating-center"]')).toBeNull();
    change('rating-method', 'bell');
    change('rating-center', '1');
    expect(Object.values(grades())).toEqual([1, 1, 1, 1]);
  });

  it('оставляет незавершённый результат без редактора границ', async () => {
    const collection = store.get('ratings')!;
    const item = (id: string) => ({ id, title: id, userScore: 8, communityScore: 8 });
    const engine = new PairwiseSorterEngine({ known: [[item(ids[0]!)]], pending: ids.slice(1).map(item) });
    collection.session = engine.getState();
    collection.orderedIds = engine.getView().orderedGroups.flat();
    collection.ratings = { topScore: null, boundaries: [] };
    expect(await store.set(collection)).toBe('saved');
    document.body.innerHTML = '<div id="app"></div>';
    root = document.querySelector<HTMLElement>('#app')!;
    mountApp(root, { demo: demoSource, shikimori: { load: vi.fn(), enrich: vi.fn(), lookupProfile } }, store);
    button('[data-action="resume-selection"]').click();
    button('[data-screen="result"]').click();
    expect(root.querySelector('h1')!.textContent).toBe('Промежуточный рейтинг');
    expect(root.querySelector('.rating-editor')).toBeNull();
    expect(root.querySelector('.rating-gap')).toBeNull();
    expect(store.get('ratings')!.ratings.topScore).toBeNull();
  });

  it('сохраняет частичный выбор интервалов на стыке после перезагрузки без переоценки базы', async () => {
    const collection = store.get('ratings')!;
    const added = collection.entries.slice(4, 6).map(entry => entry.animeId);
    const oldScores = { [ids[0]!]: 9 as const, [ids[1]!]: 7 as const, [ids[2]!]: 7 as const, [ids[3]!]: 7 as const };
    collection.ratings = { topScore: 9, boundaries: [{ aboveId: ids[0]!, belowId: ids[1]!, scoreBelow: 7 }] };
    collection.ratingTransition = { scores: oldScores, changedIds: added };
    setOrder(collection, [[ids[0]!], [added[0]!], [added[1]!], ...groups.slice(1)]);
    expect(await store.set(collection)).toBe('saved');
    await startApp();
    expect(root.querySelectorAll('[name="rating-placement"]')).toHaveLength(2);
    change('rating-placement', '9');
    expect(store.get('ratings')!.ratingTransition!.choices).toEqual({ [added[0]!]: 9 });
    await startApp();
    expect(root.querySelectorAll('[name="rating-placement"]')).toHaveLength(1);
    change('rating-placement', '7');
    expect(store.get('ratings')!.ratingTransition).toBeUndefined();
    const current = store.get('ratings')!;
    expect(ratingAssignments(current.session!.progress.orderedGroups, current.ratings)).toEqual({ ...oldScores, [added[0]!]: 9, [added[1]!]: 7 });
    expect(root.querySelector('.filter-panel [name="rating-method"]')).not.toBeNull();
  });

  it('пересматривает место оценённого тайтла и сохраняет оценки остальных', () => {
    rateAll(7);
    changeScore(ids[0]!, 9);
    const original = store.get('ratings')!;
    const moved = ids[0]!;
    button(`[data-action="reposition"][data-review-id="${moved}"]`).click();
    expect(store.get('ratings')!.ratingTransition!.scores[moved]).toBe(9);
    for (let index = 0; index < 30; index++) {
      const current = PairwiseSorterEngine.restore(store.get('ratings')!.session).getView().current;
      if (!current) break;
      button(`[data-action="answer"][data-answer="${current.leftId === moved ? 'right' : 'left'}"]`).click();
    }
    expect(PairwiseSorterEngine.restore(store.get('ratings')!.session).getView().status).toBe('complete');
    expect(store.get('ratings')!.ratingTransition).toBeUndefined();
    expect(grades()).toEqual(Object.fromEntries(ids.map(id => [id, 7])));
    expect(store.get('ratings')!.entries).toEqual(original.entries);
  });

  it('восстанавливает оценки и ручной режим при замене коллекции резервной копией', async () => {
    change('rating-method', 'uniform');
    const replacement = store.get('ratings')!;
    replacement.ratings = { topScore: 6, boundaries: [] };
    setOrder(replacement, [...groups].reverse());
    button('[data-screen="import"]').click();
    const input = root.querySelector<HTMLInputElement>('[name="collection-backup"]')!;
    Object.defineProperty(input, 'files', { value: [new File([serializeCollectionBackup(replacement)], 'ratings.json', { type: 'application/json' })] });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => { expect(root.querySelector('.backup-preview')).not.toBeNull(); });
    button('[data-action="import-backup-replace"]').click();
    expect(root.querySelector<HTMLSelectElement>('[name="rating-method"]')!.value).toBe('manual');
    expect(Object.values(ratingAssignments(replacement.session!.progress.orderedGroups, store.get('ratings')!.ratings))).toEqual([6, 6, 6, 6]);
  });
});

/** Восстанавливает сохранённую коллекцию без сети в новом экземпляре приложения. */
async function startApp(): Promise<void> {
  await persisted;
  document.body.innerHTML = '<div id="app"></div>';
  root = document.querySelector<HTMLElement>('#app')!;
  store = await BrowserCollectionStore.open(database);
  const save = store.set.bind(store);
  vi.spyOn(store, 'set').mockImplementation(collection => persisted = save(collection));
  mountApp(root, { demo: demoSource, shikimori: { load: vi.fn(), enrich: vi.fn(), lookupProfile } }, store, new BrowserSelectionStore(storage));
  root.querySelector<HTMLButtonElement>('[data-action="resume-selection"]')?.click();
  await vi.waitFor(() => { expect(root.querySelector('.result-table')).not.toBeNull(); });
}

/** Устанавливает готовый порядок с заданными классами равных для проверки оценивания. */
function setOrder(collection: Collection, ordered: string[][]): void {
  const engine = new PairwiseSorterEngine({ known: ordered.map(group => group.map(id => ({ id, title: id, userScore: 8, communityScore: 8 }))), pending: [] });
  collection.session = engine.getState();
  collection.orderedIds = ordered.flat();
}

/** Возвращает сохранённые оценки по ID, независимо от их порядка в DOM. */
function grades(): ReturnType<typeof ratingAssignments> {
  const collection = store.get('ratings')!;
  return ratingAssignments(collection.session!.progress.orderedGroups, collection.ratings);
}

/** Отправляет обычное изменение выбранного элемента управления. */
function change(name: string, value: string): void {
  const control = root.querySelector<HTMLSelectElement>(`[name="${name}"]`)!;
  control.value = value;
  control.dispatchEvent(new Event('change', { bubbles: true }));
}

/** Меняет новый балл в строке конкретного тайтла. */
function changeScore(id: string, value: number): void {
  const control = root.querySelector<HTMLSelectElement>('[name="rating-score"][data-rating-id="' + id + '"]')!;
  control.value = String(value);
  control.dispatchEvent(new Event('change', { bubbles: true }));
}

/** Готовит одну общую оценку через колокол у края и ручную правку первой строки. */
function rateAll(score: number): void {
  change('rating-method', 'bell');
  change('rating-center', '10');
  changeScore(ids[0]!, score);
}

/** Находит кнопку после обновления интерфейса. */
function button(selector: string): HTMLButtonElement { return root.querySelector<HTMLButtonElement>(selector)!; }
