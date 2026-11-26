// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { LIST_FIXTURE } from './list-fixture';
import { demoSource } from '../integrations/demo';
import type { ListMetadataSource } from '../integrations/list-source';
import { PairwiseSorterEngine } from '../entities/sorting/engine';
import { BrowserCollectionStore } from '../storage/collection-store';
import { BrowserSelectionStore } from '../storage/selection-store';
import { parseCollectionBackup, serializeCollectionBackup } from '../storage/collection-backup';
import { mountApp } from './mount-app';

let root: HTMLElement;
let store: BrowserCollectionStore;
let source: ListMetadataSource;
let values: Map<string, string>;
let database: IDBFactory;
let persisted: Promise<unknown> | undefined;
let storage: Pick<Storage, 'getItem' | 'setItem'>;

beforeEach(async () => {
  values = new Map();
  database = new IDBFactory();
  persisted = undefined;
  storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } };
  const snapshot = structuredClone(LIST_FIXTURE);
  snapshot.animes = snapshot.animes.slice(0, 4).map(anime => ({ ...anime, coverUrl: `https://shikimori.io/covers/${anime.id}.jpg` }));
  snapshot.entries = snapshot.entries.slice(0, 4);
  snapshot.profile = { id: '42', nickname: 'public-user', source: 'shikimori', url: 'https://shikimori.io/public-user' };
  source = {
    load: vi.fn(async () => structuredClone(snapshot)), lookupProfile: vi.fn(async () => snapshot.profile),
    enrich: vi.fn(async data => ({ snapshot: data, matched: data.animes.length, error: null })),
  };
  await startApp();
});

afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks(); });

describe('сравнение реальной коллекции', () => {
  it('выполняет ответы, пропуск и отмену с клавиатуры', async () => {
    await importAndStart();
    const session = () => store.get('shikimori:42')!.session!;

    expect(pressKey('ArrowLeft')).toBe(true);
    const beforeSkip = session();
    expect(beforeSkip.history.at(-1)?.answer).toBe('left');
    expect(pressKey('Tab')).toBe(true);
    expect(session().history.at(-1)?.answer).toBe('skip');

    expect(pressKey('я', { code: 'KeyZ', ctrlKey: true })).toBe(true);
    expect(session().history.at(-1)?.type).toBe('undo');
    expect(session().progress).toEqual(beforeSkip.progress);

    expect(pressKey('ArrowRight')).toBe(true);
    expect(session().history.at(-1)?.answer).toBe('right');
    expect(pressKey(' ')).toBe(true);
    expect(session().history.at(-1)?.answer).toBe('tie');
  });

  it('оставляет навигацию с Shift+Tab и игнорирует повтор и клавиши вне сравнения', async () => {
    await importAndStart();
    const initial = store.get('shikimori:42')!.session;
    expect(pressKey('Tab', { shiftKey: true })).toBe(false);
    expect(pressKey('ArrowLeft', { repeat: true })).toBe(true);
    expect(store.get('shikimori:42')!.session).toEqual(initial);

    finishComparison();
    const completed = store.get('shikimori:42')!.session;
    expect(button('[data-action="undo-comparison"]').disabled).toBe(false);
    expect(pressKey('z', { ctrlKey: true })).toBe(false);
    expect(store.get('shikimori:42')!.session).toEqual(completed);

    button('[data-screen="comparison"]').click();
    expect(pressKey('Tab')).toBe(false);
  });

  it('синхронизирует настройки полей между набором и сравнением без изменения сессии', async () => {
    await importAndStart();
    expect(Array.from(root.querySelectorAll('.filter-panel h2'), heading => heading.textContent!.trim()))
      .toEqual(['Настройки', 'История сравнений']);
    expect(Array.from(root.querySelectorAll('#panel-settings-options h3'), heading => heading.textContent!.trim()))
      .toEqual(['Отображение']);
    expect(root.querySelector<HTMLElement>('#panel-settings-options')!.hidden).toBe(true);
    button('[data-panel-group="settings"]').click();
    expect(root.querySelector<HTMLElement>('#panel-settings-options')!.hidden).toBe(false);
    expect(root.querySelector<HTMLElement>('#panel-display-options')!.hidden).toBe(false);
    expect(root.querySelectorAll('[data-card-field="status"]')).toHaveLength(0);
    root.querySelector<HTMLInputElement>('[name="display-field"][value="status"]')!.click();
    expect(root.querySelectorAll('[data-card-field="status"]')).toHaveLength(2);
    const session = store.get('shikimori:42')!.session;
    root.querySelector<HTMLInputElement>('[name="display-field"][value="russianTitle"]')!.click();
    expect(root.querySelectorAll('[data-card-field="russianTitle"]')).toHaveLength(0);
    expect(root.querySelectorAll('[data-card-field="originalTitle"]')).toHaveLength(2);
    button('[data-screen="selection"]').click();
    expect(root.querySelector<HTMLInputElement>('[name="display-field"][value="russianTitle"]')!.checked).toBe(false);
    expect(root.querySelectorAll('[data-card-field="russianTitle"]')).toHaveLength(0);
    root.querySelector<HTMLInputElement>('[name="display-field"][value="userScore"]')!.click();
    root.querySelector<HTMLInputElement>('[name="display-field"][value="status"]')!.click();
    root.querySelector<HTMLInputElement>('[name="display-field"][value="shikimoriLink"]')!.click();
    button('[data-screen="comparison"]').click();
    expect(root.querySelectorAll('[data-card-field="status"], [data-card-field="userScore"], [data-card-field="shikimoriLink"]')).toHaveLength(0);
    expect(store.get('shikimori:42')!.session).toEqual(session);
  });

  it('показывает три счётчика и сохраняет исходный максимум при ответе и пропуске', async () => {
    await importAndStart();
    const maximum = root.querySelector('[data-comparison-counter="maximum"]')!.textContent;
    expect(root.querySelector('.comparison-counters')!.textContent!.trim()).toMatch(/^\d+\s*\/\s*\d+\s*\/\s*\d+$/);
    button('[data-action="answer"][data-answer="left"]').click();
    expect(root.querySelector('[data-comparison-counter="manual"]')!.textContent).toBe('1');
    button('[data-action="answer"][data-answer="skip"]').click();
    expect(root.querySelector('[data-comparison-counter="manual"]')!.textContent).toBe('1');
    expect(root.querySelector('[data-comparison-counter="maximum"]')!.textContent).toBe(maximum);
    expect(root.querySelector('[data-comparison-counter="inferred"]')!.getAttribute('title')).toBeTruthy();
    button('[data-action="undo-comparison"]').click();
    button('[data-action="undo-comparison"]').click();
    expect(root.querySelector('[data-comparison-counter="manual"]')!.textContent).toBe('0');
    expect(root.querySelector('[data-comparison-counter="maximum"]')!.textContent).toBe(maximum);
  });

  it('обновляет транзитивный счётчик после обычных ответов и сохраняет свёрнутую историю', async () => {
    await importAndStart();
    expect(root.querySelector<HTMLElement>('#panel-history-options')!.hidden).toBe(true);
    button('[data-action="answer"][data-answer="left"]').click();
    button('[data-action="answer"][data-answer="left"]').click();
    expect(root.querySelector('[data-comparison-counter="inferred"]')!.textContent).toBe('1');
    expect(root.querySelector<HTMLElement>('#panel-history-options')!.hidden).toBe(true);
    button('[data-panel-group="history"]').click();
    expect(root.querySelector<HTMLElement>('#panel-history-options')!.hidden).toBe(false);
    expect(root.querySelectorAll('.history-loser')).toHaveLength(2);
  });

  it('скачивает копию из заголовка свёрнутой истории в сравнении и результате', async () => {
    await importAndStart();
    button('[data-action="answer"][data-answer="left"]').click();
    const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:collection-backup');
    const download = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const selector = '.comparison-panel-history .panel-section-heading [data-action="export-collection"]';
    const shortcut = button(selector);
    expect(shortcut.getAttribute('aria-label')).toBe('Скачать историю');
    expect(shortcut.querySelector('svg')).not.toBeNull();
    shortcut.click();
    expect(root.querySelector<HTMLElement>('#panel-history-options')!.hidden).toBe(true);
    const [blob] = createUrl.mock.calls[0]!;
    expect(blob).toBeInstanceOf(Blob);
    const backup = parseCollectionBackup(await (blob as Blob).text());
    expect(backup.session?.history).toEqual(store.get('shikimori:42')!.session?.history);

    finishComparison();
    button(selector).click();
    expect(download).toHaveBeenCalledTimes(2);
    expect(root.querySelector('main [data-action="export-collection"]:not([hidden])')).toBeNull();
  });

  it('продолжает ту же пару после перезапуска и отменяет пропуск с восстановлением поиска', async () => {
    await importAndStart();
    button('[data-action="answer"][data-answer="left"]').click();
    const beforeSkip = store.get('shikimori:42')!.session!;
    button('[data-action="answer"][data-answer="skip"]').click();
    const skipped = store.get('shikimori:42')!.session!;
    expect(skipped.progress.current).not.toEqual(beforeSkip.progress.current);
    await startApp();
    button('[data-action="resume-selection"]').click();
    expect(store.get('shikimori:42')!.session).toEqual(skipped);
    expect(root.querySelector('[data-comparison-left]')?.getAttribute('data-comparison-left') ?? null).toBe(skipped.progress.current?.leftId ?? null);
    button('[data-action="undo-comparison"]').click();
    const undone = store.get('shikimori:42')!.session!;
    expect(undone.progress).toEqual(beforeSkip.progress);
    expect(undone.history.length).toBeGreaterThan(skipped.history.length);
  });

  it('строит реальный результат и пересматривает место, сохраняя порядок остальных и прежний журнал', async () => {
    await importAndStart();
    finishComparison();
    const completed = store.get('shikimori:42')!;
    const view = PairwiseSorterEngine.restore(completed.session).getView();
    expect([view.directComparisonCount, view.inferredComparisonCount, view.comparisonTotal]).toEqual([3, 3, 6]);
    expect(root.querySelector('[aria-current="step"]')!.getAttribute('data-screen')).toBe('result');
    expect(root.querySelector('.comparison-section')).toBeNull();
    expect(document.activeElement).toBe(root.querySelector('h1'));
    expect(root.querySelectorAll('[data-ordered-id]')).toHaveLength(4);
    expect(completed.ratings.topScore).not.toBeNull();

    const saves = vi.mocked(store.set).mock.calls.length;
    button('[data-screen="comparison"]').click();
    expect(root.querySelector('[aria-current="step"]')!.getAttribute('data-screen')).toBe('comparison');
    expect(root.querySelector('h1')!.textContent).toBe('Сравнение завершено');
    expect(root.querySelector('[data-action="answer"]')).toBeNull();
    expect(document.activeElement).toBe(root.querySelector('h1'));
    const result = button('.comparison-tools [data-screen="result"]');
    expect(result.textContent).toBe('К результатам');
    result.click();
    expect(root.querySelector('[aria-current="step"]')!.getAttribute('data-screen')).toBe('result');
    expect(vi.mocked(store.set).mock.calls).toHaveLength(saves);
    expect(store.get('shikimori:42')).toEqual(completed);

    const moved = completed.orderedIds[0]!;
    button(`[data-action="reposition"][data-review-id="${moved}"]`).click();
    expect(store.get('shikimori:42')!.archivedSessions).toEqual([completed.session]);
    finishComparison();
    expect(store.get('shikimori:42')!.orderedIds.filter(id => id !== moved)).toEqual(completed.orderedIds.filter(id => id !== moved));
  });

  it('возвращается к паре при отмене из результата и снова открывает результат после ответа', async () => {
    await importAndStart();
    finishComparison();
    expect(root.querySelector('[aria-current="step"]')!.getAttribute('data-screen')).toBe('result');
    expect(root.querySelector('[data-action="resume-comparison"]')).toBeNull();
    button('[data-action="undo-comparison"]').click();
    expect(root.querySelector('[aria-current="step"]')!.getAttribute('data-screen')).toBe('comparison');
    expect(root.querySelector('[data-action="answer"]')).not.toBeNull();
    expect(document.activeElement).toBe(root.querySelector('h1'));
    finishComparison();
    expect(root.querySelector('[aria-current="step"]')!.getAttribute('data-screen')).toBe('result');
  });

  it('показывает общую историю после пересмотра места и восстановления коллекции', async () => {
    await importAndStart();
    button('[data-action="answer"][data-answer="left"]').click();
    button('[data-action="answer"][data-answer="left"]').click();
    button('[data-action="undo-comparison"]').click();
    button('[data-panel-group="history"]').click();
    const beforeRevision = store.get('shikimori:42')!.session!;
    const decision = beforeRevision.history[0]!;
    const edit = `[data-action="revise-pair"][data-event-id="${decision.id}"]`;
    button(edit).click();
    expect(root.querySelector('[data-comparison-left]')?.getAttribute('data-comparison-left')).toBe(decision.leftId);
    expect(root.querySelector('[data-comparison-right]')?.getAttribute('data-comparison-right')).toBe(decision.rightId);
    expect(button('[data-action="answer"][data-answer="left"]').disabled).toBe(true);
    expect(store.get('shikimori:42')!.session).toEqual(beforeRevision);
    button('[data-action="cancel-revision"]').click();
    expect(root.querySelector('[data-comparison-left]')?.getAttribute('data-comparison-left')).toBe(beforeRevision.progress.current!.leftId);
    expect(store.get('shikimori:42')!.session).toEqual(beforeRevision);
    button(edit).click();
    button('[data-action="answer"][data-answer="tie"]').click();
    expect(store.get('shikimori:42')!.session!.history.at(-1)).toMatchObject({ type: 'revise', targetEventId: decision.id, answer: 'tie' });
    finishComparison();

    const first = store.get('shikimori:42')!;
    button(`[data-action="reposition"][data-review-id="${first.orderedIds[0]}"]`).click();
    const archived = root.querySelectorAll('.comparison-history-session')[1]!;
    const entries = Array.from(archived.querySelectorAll('.history-row'));
    const revised = entries.find(entry => entry.querySelector('.history-sequence')?.textContent === '1');
    expect(revised?.querySelector('.history-relation')?.textContent).toBe('=');
    const originalPair = first.session!.history[0]!;
    for (const id of [originalPair.leftId, originalPair.rightId]) {
      const anime = first.animes.find(item => item.id === id)!;
      expect(revised?.closest('details')?.querySelector('p')?.textContent).toContain(anime.russian || anime.name);
    }
    expect(entries.some(entry => entry.querySelector('.history-sequence')?.textContent === '2')).toBe(false);
    expect(root.querySelector('[data-action="revise-pair"]')).toBeNull();

    finishComparison();
    await startApp();
    button('[data-action="resume-selection"]').click();
    button('[data-panel-group="history"]').click();
    const [current, restoredArchive] = root.querySelectorAll('.comparison-history-session');
    expect(current?.querySelectorAll('[data-action="revise-pair"]').length).toBeGreaterThan(0);
    expect(restoredArchive?.querySelectorAll('.history-row')).toHaveLength(entries.length);
    expect(restoredArchive?.querySelector('[data-action="revise-pair"]')).toBeNull();

    const historyEntry = restoredArchive!.querySelector<HTMLDetailsElement>('details')!;
    const result = root.querySelector('.ordered-result');
    const chart = root.querySelector('.rating-distribution');
    const panel = root.querySelector<HTMLElement>('.filter-panel')!;
    historyEntry.open = true;
    panel.scrollTop = 42;
    button('[data-panel-group="settings"]').click();
    expect(root.querySelector(`details[data-history-event="${historyEntry.dataset.historyEvent}"]`)).toBe(historyEntry);
    expect(historyEntry.open).toBe(true);
    expect(root.querySelector('.ordered-result')).toBe(result);
    expect(root.querySelector('.rating-distribution')).toBe(chart);
    expect(panel.scrollTop).toBe(42);
    expect(document.activeElement).toBe(button('[data-panel-group="settings"]'));

    button('[data-panel-group="history"]').click();
    button('[data-panel-group="history"]').click();
    expect(root.querySelector<HTMLDetailsElement>(`details[data-history-event="${historyEntry.dataset.historyEvent}"]`)?.open).toBe(true);
  });

  it('открывает прежнюю пару из результата и подтверждает конфликт перед изменением журнала', async () => {
    await importAndStart();
    const collection = store.get('shikimori:42')!;
    const rankById = new Map(collection.entries.map(({ animeId }, index) => [animeId, index + 1]));
    const pending = [4, 1, 3, 2].map(rank => ({
      id: collection.entries[rank - 1]!.animeId, title: String(rank), userScore: null, communityScore: null,
    }));
    const engine = new PairwiseSorterEngine({ known: [], pending }, { strategy: 'insertion' });
    for (let step = 0; step < 10; step++) {
      const pair = engine.getView().current;
      if (!pair) break;
      expect(engine.answer(rankById.get(pair.leftId)! < rankById.get(pair.rightId)! ? 'left' : 'right').ok).toBe(true);
    }
    expect(engine.getView().status).toBe('complete');
    collection.session = engine.getState();
    collection.orderedIds = collection.session.progress.orderedIds;
    expect(await store.set(collection)).toBe('saved');

    await startApp();
    button('[data-action="resume-selection"]').click();
    button('[data-panel-group="history"]').click();
    const first = collection.session.history[0]!;
    const edit = `[data-action="revise-pair"][data-event-id="${first.id}"]`;
    button(edit).click();
    expect(root.querySelector('[aria-current="step"]')?.getAttribute('data-screen')).toBe('comparison');
    expect(document.activeElement?.textContent).toBe('Пересмотр ответа');
    expect(root.querySelector('[data-comparison-right]')?.getAttribute('data-comparison-right')).toBe(first.rightId);
    button('[data-action="answer"][data-answer="tie"]').click();
    expect(root.querySelector('#conflict-heading')).not.toBeNull();
    expect(store.get(collection.id)!.session).toEqual(collection.session);
    button('[data-action="cancel-revision"]').click();
    expect(root.querySelector('[aria-current="step"]')?.getAttribute('data-screen')).toBe('result');
    expect(store.get(collection.id)!.session).toEqual(collection.session);
    button(edit).click();
    button('[data-action="answer"][data-answer="tie"]').click();
    button('[data-action="confirm-revision"]').click();
    expect(store.get(collection.id)!.session!.history.at(-1)).toMatchObject({ type: 'revise', targetEventId: first.id, answer: 'tie' });
  });

  it('сразу открывает результат для единственного выбранного тайтла', async () => {
    await importAndStart();
    button('[data-screen="selection"]').click();
    button('[data-action="select-all"]').click();
    root.querySelector<HTMLInputElement>('[name="anime"]')!.click();
    button('[data-action="start-comparison"]').click();
    expect(root.querySelector('[aria-current="step"]')!.getAttribute('data-screen')).toBe('result');
    expect(root.querySelectorAll('[data-ordered-id]')).toHaveLength(1);
    expect(root.querySelector('[data-action="answer"]')).toBeNull();
  });

  it('восстанавливает промежуточный JSON отдельной коллекцией и отклоняет повреждённый файл без потери данных', async () => {
    await importAndStart();
    button('[data-action="answer"][data-answer="tie"]').click();
    const original = store.get('shikimori:42')!;
    button('[data-screen="import"]').click();
    await chooseBackup('{"schemaVersion":999}', false);
    expect(root.querySelector('.backup-preview')).toBeNull();
    expect(store.get(original.id)).toEqual(original);
    await chooseBackup(serializeCollectionBackup(original));
    expect(root.querySelector('.backup-preview')).not.toBeNull();
    button('[data-action="import-backup-copy"]').click();
    const copy = store.list().find(item => item.id !== original.id)!;
    expect(copy.session).toEqual(original.session);
    expect(store.get(original.id)).toEqual(original);
    expect(root.querySelector('[data-comparison-left]')?.getAttribute('data-comparison-left') ?? null).toBe(original.session!.progress.current?.leftId ?? null);

    button('[data-screen="selection"]').click();
    vi.mocked(source.load).mockResolvedValue({
      profile: { ...original.profile, nickname: 'renamed-profile' },
      animes: original.animes.map(anime => ({ ...anime, communityScore: 8.75 })), entries: original.entries,
    });
    button('[data-action="refresh"]').click();
    await vi.waitFor(() => expect(root.querySelector('[data-action="cancel-import"]')).toBeNull());
    expect(store.get(copy.id)).toMatchObject({ name: copy.name, profile: { nickname: 'renamed-profile' }, session: original.session });
    expect(store.get(copy.id)!.animes[0]!.communityScore).toBe(8.75);
    expect(store.get(original.id)).toEqual(original);
  });

  it.each([true, false])('оставляет результат последнего чтения копии при обратном порядке завершения (%s)', async latestValid => {
    await importAndStart();
    const backup = serializeCollectionBackup(store.get('shikimori:42')!);
    button('[data-screen="import"]').click();
    let finishEarlier!: (text: string) => void;
    const earlierRead = new Promise<string>(resolve => { finishEarlier = resolve; });
    const earlierFile = new File([], 'earlier.json');
    vi.spyOn(earlierFile, 'text').mockReturnValue(earlierRead);
    selectBackup(earlierFile);
    await chooseBackup(latestValid ? backup : '{"schemaVersion":999}', latestValid);
    const shown = root.querySelector(latestValid ? '.backup-preview' : '.import-error:not([hidden])');
    expect(shown).not.toBeNull();
    finishEarlier(latestValid ? '{"schemaVersion":999}' : backup);
    await earlierRead;
    expect(root.querySelector(latestValid ? '.backup-preview' : '.import-error:not([hidden])')).toBe(shown);
    expect(root.querySelector(latestValid ? '.import-error:not([hidden])' : '.backup-preview')).toBeNull();
  });

  it('добавляет тайтл после повторного импорта, сохраняя старый порядок и исходные данные завершённого цикла', async () => {
    await importAndStart();
    finishComparison();
    const original = store.get('shikimori:42')!;
    const incoming = {
      profile: original.profile,
      animes: [...original.animes, { ...LIST_FIXTURE.animes[4]!, coverUrl: 'https://shikimori.io/covers/33352.jpg' }],
      entries: [...original.entries, LIST_FIXTURE.entries[4]!].map(entry => ({ ...entry })),
    };
    incoming.entries[0]!.originalScore = 1;
    vi.mocked(source.load).mockResolvedValue(incoming);
    button('[data-screen="selection"]').click();
    button('[data-action="refresh"]').click();
    await vi.waitFor(() => { expect(root.querySelectorAll('.anime-choice')).toHaveLength(5); expect(root.querySelector('[data-action="cancel-import"]')).toBeNull(); });
    expect(store.get(original.id)!.session).toEqual(original.session);
    root.querySelector<HTMLElement>('[data-anime="33352"]')!.click();
    root.querySelector<HTMLInputElement>('input[name="comparison-scenario"][value="add"]')!.click();
    button('[data-action="start-comparison"]').click();
    expect(store.get(original.id)!.session!.input.pending).toEqual(['33352']);
    finishComparison();
    expect(store.get(original.id)!.orderedIds.filter(id => id !== '33352')).toEqual(original.orderedIds);
    expect(store.get(original.id)!.archivedSessions).toEqual([original.session]);
  });

  it('продолжает существующую коллекцию, если быстрый указатель ссылается на отсутствующий ID', async () => {
    await importAndStart();
    const original = store.get('shikimori:42')!;
    const selections = new BrowserSelectionStore(storage);
    selections.set({ ...selections.get()!, collectionId: 'missing' });
    await startApp();
    button('[data-action="resume-selection"]').click();
    expect(store.get(original.id)!.session).toEqual(original.session);
    expect(root.querySelector('[data-comparison-left]')?.getAttribute('data-comparison-left')).toBe(original.session!.progress.current!.leftId);
    expect(selections.get()!.collectionId).toBe(original.id);
  });

  it('оставляет прогресс в памяти и сообщает об отказе записи, сохраняя предыдущую постоянную сессию', async () => {
    await importAndStart();
    await persisted;
    const saved = store.get('shikimori:42')!.session!;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => { throw new DOMException('quota', 'QuotaExceededError'); });
    button('[data-action="answer"][data-answer="left"]').click();
    expect(store.get('shikimori:42')!.session!.progress.comparisonCount).toBe(saved.progress.comparisonCount + 1);
    await vi.waitFor(() => expect(root.querySelector('#selection-save-error')!.textContent).toContain('Не удалось сохранить'));
    expect((await BrowserCollectionStore.open(database)).get('shikimori:42')!.session).toEqual(saved);
  });

  it('показывает конфликт в наборе и сохраняет возможность экспортировать локальные изменения', async () => {
    await importAndStart();
    await persisted;
    const otherTab = await BrowserCollectionStore.open(database);
    const remote = otherTab.get('shikimori:42')!;
    remote.selectedIds = ['5114'];
    expect(await otherTab.set(remote)).toBe('saved');

    button('[data-screen="selection"]').click();
    root.querySelector<HTMLInputElement>('input[name="anime"][value="5114"]')!.click();
    await vi.waitFor(() => expect(root.querySelector('#selection-save-error')!.textContent).toContain('в другой вкладке'));
    expect(button('#export-unsaved-collection').hidden).toBe(false);
    expect(store.get(remote.id)!.selectedIds).not.toContain('5114');
    expect((await BrowserCollectionStore.open(database)).get(remote.id)!.selectedIds).toEqual(['5114']);
  });
});

/** Перезапускает приложение с новым экземпляром постоянного хранилища. */
async function startApp(): Promise<void> {
  await persisted;
  document.body.innerHTML = '<div id="app"></div>';
  root = document.querySelector<HTMLElement>('#app')!;
  store = await BrowserCollectionStore.open(database);
  const save = store.set.bind(store);
  vi.spyOn(store, 'set').mockImplementation(collection => persisted = save(collection));
  mountApp(root, { demo: demoSource, shikimori: source }, store, new BrowserSelectionStore(storage));
}

/** Загружает публичный список, выбирает его и запускает настоящий движок. */
async function importAndStart(): Promise<void> {
  const method = root.querySelector<HTMLSelectElement>('#import-method')!;
  method.value = 'profile';
  method.dispatchEvent(new Event('change', { bubbles: true }));
  root.querySelector<HTMLInputElement>('#profile-input')!.value = 'public-user';
  root.querySelector<HTMLFormElement>('#profile-form')!.requestSubmit();
  await vi.waitFor(() => { expect(root.querySelectorAll('.anime-choice')).toHaveLength(4); expect(root.querySelector('[data-action="cancel-import"]')).toBeNull(); });
  button('[data-action="select-all"]').click();
  button('[data-action="start-comparison"]').click();
  expect(root.querySelector('[data-action="answer"]')).not.toBeNull();
}

/** Завершает небольшой пример последовательными согласованными предпочтениями. */
function finishComparison(): void {
  for (let i = 0; i < 50; i++) {
    if (!PairwiseSorterEngine.restore(store.get('shikimori:42')!.session).getView().current) return;
    button('[data-action="answer"][data-answer="left"]').click();
  }
  throw new Error('Движок не завершил пример за 50 ответов.');
}

/** Дожидается предпросмотра или ошибки при чтении локальной копии. */
async function chooseBackup(text: string, expectedPreview = true): Promise<void> {
  selectBackup(new File([text], 'docchirank.json', { type: 'application/json' }));
  await vi.waitFor(() => { expect(root.querySelector(expectedPreview ? '.backup-preview' : '.import-error:not([hidden])')).not.toBeNull(); });
}

/** Передаёт файл стандартному обработчику выбора резервной копии. */
function selectBackup(file: File): void {
  const input = root.querySelector<HTMLInputElement>('[name="collection-backup"]')!;
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

/** Находит кнопку после очередного обновления интерфейса. */
function button(selector: string): HTMLButtonElement { return root.querySelector<HTMLButtonElement>(selector)!; }

/** Отправляет клавишу сфокусированному элементу и проверяет отмену стандартного действия. */
function pressKey(key: string, options: KeyboardEventInit = {}): boolean {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options });
  (document.activeElement ?? document.body).dispatchEvent(event);
  return event.defaultPrevented;
}
